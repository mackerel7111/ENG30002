from pathlib import Path
from datetime import datetime
from collections import deque
import threading
import math
import csv
import time

import matlab.engine
import joblib
import numpy as np
from fastapi import FastAPI, Query
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="Flood Monitoring API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
# Per-area configuration
# Area 1 → RiverLevel, RainLevel, SoilMoisture, FloodRisk
# Area 2 → RiverLevel2, RainLevel2, SoilMoisture2, FloodRisk2
# ---------------------------------------------------------------------------

BACKEND_DIR = Path(__file__).parent
CSV_HEADERS  = ["timestamp", "river_level", "rain_level", "soil_moisture"]
LOG_INTERVAL = 10   # seconds between each logged row

AREAS: dict = {
    1: {
        "river":      f"{SLX_NAME}/RiverLevel",
        "rain":       f"{SLX_NAME}/RainLevel",
        "soil":       f"{SLX_NAME}/SoilMoisture",
        "risk":       f"{SLX_NAME}/FloodRisk",
        "dataset":    BACKEND_DIR / "Dataset1.csv",
        "model_path": BACKEND_DIR / "models" / "current" / "model_area1.joblib",
        "history":    deque(maxlen=60),
        "model":      None,
    },
    2: {
        "river":      f"{SLX_NAME}/RiverLevel2",
        "rain":       f"{SLX_NAME}/RainLevel2",
        "soil":       f"{SLX_NAME}/SoilMoisture2",
        "risk":       f"{SLX_NAME}/FloodRisk2",
        "dataset":    BACKEND_DIR / "Dataset2.csv",
        "model_path": BACKEND_DIR / "models" / "current" / "model_area2.joblib",
        "history":    deque(maxlen=60),
        "model":      None,
    },
}

# Load models per area (falls back to heuristic if not trained yet)
for _area_id, _cfg in AREAS.items():
    if _cfg["model_path"].exists():
        _cfg["model"] = joblib.load(_cfg["model_path"])
        print(f"[Model] Area {_area_id}: loaded from {_cfg['model_path'].name}")
    else:
        print(f"[Model] Area {_area_id}: no model file found, using heuristic")

# Initialise CSV headers for each area
for _area_id, _cfg in AREAS.items():
    _ds = _cfg["dataset"]
    if not _ds.exists() or _ds.stat().st_size == 0:
        with open(_ds, "w", newline="") as _f:
            csv.writer(_f).writerow(CSV_HEADERS)

# ---------------------------------------------------------------------------
# Concurrency lock
# ---------------------------------------------------------------------------

_lock = threading.Lock()

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class SensorPayload(BaseModel):
    river_level:   float = Field(..., ge=0,   le=20)
    rain_level:    float = Field(..., ge=0,   le=500)
    soil_moisture: float = Field(..., ge=0,   le=100)


# ---------------------------------------------------------------------------
# Helper: read one float from a Simulink Display (or Constant) block
# ---------------------------------------------------------------------------

def _read_block(block_path: str) -> float:
    """Read the current value from a Simulink Display block via MATLAB eval."""
    try:
        block_type = eng.get_param(block_path, "BlockType")
        if block_type == "Display":
            # Use MATLAB eval with proper 1-based indexing (Python syntax fails here)
            safe_path = block_path.replace("'", "''")
            raw = eng.eval(
                f"get_param('{safe_path}', 'RuntimeObject').InputPort(1).Data",
                nargout=1
            )
            return math.floor(float(raw) * 1000) / 1000

        # Fallback: Constant block
        raw = eng.get_param(block_path, "Value")
        return math.floor(float(raw) * 1000) / 1000
    except Exception as e:
        print(f"[Simulink] Error reading {block_path}: {e}")
        return 0.0


# ---------------------------------------------------------------------------
# CSV background logger – one thread, logs all areas every LOG_INTERVAL secs
# ---------------------------------------------------------------------------

def _log_to_csv() -> None:
    """Background thread: read sensors for every area and append to their CSVs."""
    while True:
        time.sleep(LOG_INTERVAL)
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        for area_id, cfg in AREAS.items():
            try:
                river = _read_block(cfg["river"])
                rain  = _read_block(cfg["rain"])
                soil  = _read_block(cfg["soil"])
                with open(cfg["dataset"], "a", newline="") as _f:
                    csv.writer(_f).writerow([ts,
                                             round(river, 3),
                                             round(rain,  3),
                                             round(soil,  3)])
            except Exception as e:
                print(f"[CSV Logger] Area {area_id} error: {e}")


_csv_thread = threading.Thread(target=_log_to_csv, daemon=True, name="csv-logger")
_csv_thread.start()
print(f"[CSV Logger] Started – logging all areas every {LOG_INTERVAL}s")


# ---------------------------------------------------------------------------
# ML / heuristic prediction  (model is per-area)
# ---------------------------------------------------------------------------

def predict_risk(river_level: float, rain_level: float,
                 soil_moisture: float, model) -> dict:
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
# Trend computation  (operates on a given history deque)
# ---------------------------------------------------------------------------

TREND_THRESHOLDS = {
    "river_level":   0.05,   # metres
    "rain_level":    0.5,    # mm
    "soil_moisture": 0.3,    # %
}


def compute_trends(hist: deque) -> dict:
    """Compare the most recent reading against 3 readings ago."""
    default = {k: "stable" for k in TREND_THRESHOLDS}
    if len(hist) < 4:
        return default
    curr = hist[-1]
    prev = hist[-4]
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
        "status": "ok",
        "areas":  {
            str(a): {"model_loaded": cfg["model"] is not None}
            for a, cfg in AREAS.items()
        }
    }


@app.get("/api/live")
def live_data(area: int = Query(1, ge=1, le=2)):
    """
    Read sensors for the selected area from Simulink, run prediction,
    write FloodRisk back to Simulink, return full payload.
    """
    cfg  = AREAS[area]
    hist = cfg["history"]

    with _lock:
        try:
            river_level   = _read_block(cfg["river"])
            rain_level    = _read_block(cfg["rain"])
            soil_moisture = _read_block(cfg["soil"])
        except Exception as e:
            print(f"[ERROR] Area {area} reading Simulink blocks: {e}")
            if hist:
                last = hist[-1]
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
        hist.append(reading)

        pred = predict_risk(river_level, rain_level, soil_moisture, cfg["model"])

        # Write FloodRisk back to Simulink for this area
        try:
            eng.set_param(cfg["risk"], "Value",
                          str(pred["flood_probability"]), nargout=0)
        except Exception as e:
            print(f"[ERROR] Area {area} writing FloodRisk to Simulink: {e}")

    trends     = compute_trends(hist)
    flood_type = classify_flood_type(river_level, rain_level,
                                     soil_moisture, pred["risk_level"])

    return {
        **reading,
        **pred,
        "trends":     trends,
        "flood_type": flood_type,
    }


@app.get("/api/history")
def get_history(area: int = Query(1, ge=1, le=2)):
    return list(AREAS[area]["history"])


@app.post("/api/predict")
def manual_predict(payload: SensorPayload, area: int = Query(1, ge=1, le=2)):
    pred = predict_risk(payload.river_level, payload.rain_level,
                        payload.soil_moisture, AREAS[area]["model"])
    return {"input": payload.model_dump(), **pred}