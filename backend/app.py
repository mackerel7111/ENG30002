from pathlib import Path
from datetime import datetime, timezone
from collections import deque
import threading
import math
import csv
import time

import matlab.engine
import joblib
import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="Flood Monitoring API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# ML model (optional – falls back to heuristic if not trained yet)
# ---------------------------------------------------------------------------

MODEL_PATH = Path(__file__).parent / "model" / "flood_risk_model.joblib"
model = joblib.load(MODEL_PATH) if MODEL_PATH.exists() else None

# ---------------------------------------------------------------------------
# MATLAB / Simulink – auto-launch on startup
# ---------------------------------------------------------------------------

PROJECT_DIR = Path(__file__).parent.parent          # …/Dashboard_Testing
SLX_NAME    = "Testing_Simulink"                    # no extension
SLX_PATH    = str(PROJECT_DIR / f"{SLX_NAME}.slx")

print("[Simulink] Starting MATLAB engine …")
eng = matlab.engine.start_matlab()

eng.addpath(str(PROJECT_DIR), nargout=0)
eng.load_system(SLX_PATH, nargout=0)
eng.open_system(SLX_NAME, nargout=0)              # show Simulink window

eng.set_param(SLX_NAME, "StopTime", "inf", nargout=0)
eng.set_param(SLX_NAME, "SimulationCommand", "start", nargout=0)
print("[Simulink] Simulation started.")

# Print all blocks once so we can confirm the exact block paths
blocks = eng.find_system(SLX_NAME, "Type", "block")
print("[Simulink] Blocks found in model:")
for b in blocks:
    print(" ", b)

# ---------------------------------------------------------------------------
# Block paths inside the model  (Simulink uses "<ModelName>/<BlockName>")
# ---------------------------------------------------------------------------

BLOCK_RIVER    = f"{SLX_NAME}/RiverLevel"
BLOCK_RAIN     = f"{SLX_NAME}/RainLevel"
BLOCK_SOIL     = f"{SLX_NAME}/SoilMoisture"
BLOCK_RISK     = f"{SLX_NAME}/FloodRisk"

# ---------------------------------------------------------------------------
# Dataset CSV logging
# ---------------------------------------------------------------------------

DATASET_PATH = Path(__file__).parent / "Dataset.csv"
CSV_HEADERS  = ["timestamp", "river_level", "rain_level", "soil_moisture"]
LOG_INTERVAL = 10   # seconds between each logged row

# Write header row if the file is empty / brand new
if not DATASET_PATH.exists() or DATASET_PATH.stat().st_size == 0:
    with open(DATASET_PATH, "w", newline="") as _f:
        csv.writer(_f).writerow(CSV_HEADERS)


def _log_to_csv() -> None:
    """Background thread: read sensors every LOG_INTERVAL seconds and append to Dataset.csv."""
    while True:
        time.sleep(LOG_INTERVAL)
        try:
            river   = _read_block(BLOCK_RIVER)
            rain    = _read_block(BLOCK_RAIN)
            soil    = _read_block(BLOCK_SOIL)
            ts      = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            with open(DATASET_PATH, "a", newline="") as _f:
                csv.writer(_f).writerow([ts,
                                         round(river, 3),
                                         round(rain,  3),
                                         round(soil,  3)])
        except Exception as e:
            print(f"[CSV Logger] Error writing row: {e}")


_csv_thread = threading.Thread(target=_log_to_csv, daemon=True, name="csv-logger")
_csv_thread.start()
print(f"[CSV Logger] Started – appending to '{DATASET_PATH.name}' every {LOG_INTERVAL}s")


# ---------------------------------------------------------------------------
# In-memory history for dashboard trend chart
# ---------------------------------------------------------------------------

history: deque = deque(maxlen=60)
_lock = threading.Lock()    # guard against concurrent /api/live polls


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class SensorPayload(BaseModel):
    river_level:   float = Field(..., ge=0,   le=20)
    rain_level:    float = Field(..., ge=0,   le=500)
    soil_moisture: float = Field(..., ge=0,   le=100)


# ---------------------------------------------------------------------------
# Helper: read one float from a Simulink Constant block
# ---------------------------------------------------------------------------

def _read_block(block_path: str) -> float:
    """Read the 'Value' param of a Constant block and return as float."""
    raw = eng.get_param(block_path, "Value")
    return math.floor(float(raw) * 1000) / 1000   # 3 d.p., no rounding up


# ---------------------------------------------------------------------------
# ML / heuristic prediction
# ---------------------------------------------------------------------------

def predict_risk(river_level: float, rain_level: float, soil_moisture: float) -> dict:
    if model is None:
        score = (
            0.9  * river_level
            + 0.06  * rain_level
            + 0.035 * soil_moisture
        )
        probability = 1 / (1 + np.exp(-(score - 7.5)))
    else:
        X = np.array([[river_level, rain_level, soil_moisture]])
        probability = float(model.predict_proba(X)[0][1])

    if probability < 0.30:
        level = "LOW"
    elif probability < 0.70:
        level = "WARNING"
    else:
        level = "CRITICAL"

    return {
        "flood_probability": round(probability, 4),
        "risk_level":        level,
    }


# ---------------------------------------------------------------------------
# Trend computation
# ---------------------------------------------------------------------------

TREND_THRESHOLDS = {
    "river_level":   0.05,   # metres
    "rain_level":    0.5,    # mm
    "soil_moisture": 0.3,    # %
}


def compute_trends() -> dict:
    """Compare the most recent reading against 3 readings ago."""
    default = {k: "stable" for k in TREND_THRESHOLDS}
    if len(history) < 4:
        return default
    curr = history[-1]
    prev = history[-4]
    trends: dict = {}
    for key, threshold in TREND_THRESHOLDS.items():
        delta = curr[key] - prev[key]
        if delta > threshold:
            trends[key] = "rising"
        elif delta < -threshold:
            trends[key] = "decreasing"
        else:
            trends[key] = "stable"
    return trends


# ---------------------------------------------------------------------------
# Flood type classifier
# ---------------------------------------------------------------------------

RIVER_HIGH = 3.0
RAIN_HEAVY = 20.0
SOIL_WET   = 25.0


def classify_flood_type(river_level: float, rain_level: float,
                        soil_moisture: float, risk_level: str) -> str | None:
    if risk_level == "LOW":
        return None
    river_high = river_level  >= RIVER_HIGH
    rain_heavy = rain_level   >= RAIN_HEAVY
    soil_wet   = soil_moisture >= SOIL_WET

    if river_high and rain_heavy:
        return "Compound"
    if river_high and not rain_heavy:
        return "Fluvial"
    if rain_heavy and (not river_high or soil_wet):
        return "Pluvial"
    return None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {
        "status":       "ok",
        "model_loaded": model is not None,
    }


@app.get("/api/live")
def live_data():
    """
    1. Read RiverLevel / RainLevel / SoilMoisture from Simulink via get_param.
    2. Run flood-risk prediction.
    3. Write FloodRisk (0-1) back to Simulink via set_param.
    4. Return full payload to the React dashboard.
    """
    with _lock:
        try:
            river_level   = _read_block(BLOCK_RIVER)
            rain_level    = _read_block(BLOCK_RAIN)
            soil_moisture = _read_block(BLOCK_SOIL)
        except Exception as e:
            print(f"[ERROR] Reading Simulink blocks: {e}")
            # Use last known values from history if read fails
            if history:
                last = history[-1]
                river_level   = last["river_level"]
                rain_level    = last["rain_level"]
                soil_moisture = last["soil_moisture"]
            else:
                river_level, rain_level, soil_moisture = 0.0, 0.0, 0.0

        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        reading = {
            "timestamp":     ts,
            "river_level":   round(river_level,   3),
            "rain_level":    round(rain_level,    3),
            "soil_moisture": round(soil_moisture, 3),
        }
        history.append(reading)

        pred = predict_risk(river_level, rain_level, soil_moisture)

        # Write FloodRisk back to Simulink
        try:
            eng.set_param(BLOCK_RISK, "Value",
                          str(pred["flood_probability"]), nargout=0)
        except Exception as e:
            print(f"[ERROR] Writing FloodRisk to Simulink: {e}")

    trends     = compute_trends()
    flood_type = classify_flood_type(river_level, rain_level,
                                     soil_moisture, pred["risk_level"])

    return {
        **reading,
        **pred,
        "trends":     trends,
        "flood_type": flood_type,
    }


@app.get("/api/history")
def get_history():
    return list(history)


@app.post("/api/predict")
def manual_predict(payload: SensorPayload):
    pred = predict_risk(payload.river_level, payload.rain_level, payload.soil_moisture)
    return {"input": payload.model_dump(), **pred}