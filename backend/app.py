from pathlib import Path
from datetime import datetime
from collections import deque
import json
import urllib.error
import urllib.request
import threading
import math
import time

import matlab
import matlab.engine
import pickle
import numpy as np
import pandas as pd
from fastapi import FastAPI, Query
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware

from floodpredictivemodel import initial_train, RAW_DIR

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
SLX_NAME    = "SensorFusion_Controller_Model"                    # no extension
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


BACKEND_DIR = Path(__file__).parent
LOG_INTERVAL = 30   # seconds between each logged row
_last_log_at = {1: 0.0, 2: 0.0}

# ---------------------------------------------------------------------------
# Per-area configuration
# Area 1 → RiverLevel, RainLevel, SoilMoisture, FloodFlag1, ConfidenceScore1
# Area 2 → RiverLevel2, RainLevel2, SoilMoisture2, FloodFlag2, ConfidenceScore2
# ---------------------------------------------------------------------------

AREAS: dict = {
    1: {
        "river":      f"{SLX_NAME}/RiverLevel_1",
        "rain":       f"{SLX_NAME}/RainLevel_1",
        "soil":       f"{SLX_NAME}/SoilMoisture_1",
        "flood_flag":  f"{SLX_NAME}/FloodFlag1",
        "confidence_score": f"{SLX_NAME}/ConfidenceScore1",
        # Dashboard → Simulink control blocks
        "sluice_blk": f"{SLX_NAME}/SluiceGate_1",
        "pump_blk":   f"{SLX_NAME}/WaterPump_1",
        "override_blk": f"{SLX_NAME}/InfraOverride_1",
        "sluice_display": f"{SLX_NAME}/Gate_1",
        "pump_display":   f"{SLX_NAME}/Pump_1",
        "rule_blocks": {
            "fri": [
                f"{SLX_NAME}/Flood Risk Index (FRI)_1",
                f"{SLX_NAME}/FRI_1",
                f"{SLX_NAME}/Flood Risk Index (FRI)",
                f"{SLX_NAME}/FRI",
            ],
            "risk_text": [
                f"{SLX_NAME}/Flood Risk Text Display_1",
                f"{SLX_NAME}/Flood Risk Text_1",
                f"{SLX_NAME}/Flood Risk Text Display",
                f"{SLX_NAME}/Flood Risk Text",
            ],
            "flood_type": [
                f"{SLX_NAME}/Flood TYPE Display_1",
                f"{SLX_NAME}/Final Flood Type_1",
                f"{SLX_NAME}/Flood TYPE Display",
                f"{SLX_NAME}/Final Flood Type",
            ],
        },
        "sensors": {
            "river": [f"{SLX_NAME}/River1_{i}" for i in range(1, 4)],
            "rain":  [f"{SLX_NAME}/Rain1_{i}" for i in range(1, 4)],
            "soil":  [f"{SLX_NAME}/Soil1_{i}" for i in range(1, 4)],
        },
        "sensor_elevations": {
            "river": [0.0, 0.0, 0.0],
            "rain":  [0.0, 0.0, 0.0],
            "soil":  [0.0, 0.0, 0.0],
        },
        "region": "a",
        "model_path": BACKEND_DIR / "models" / "current" / "a.pkl",
        "history":    deque(maxlen=60),
        "model":      None,
    },
    2: {
        "river":      f"{SLX_NAME}/RiverLevel_2",
        "rain":       f"{SLX_NAME}/RainLevel_2",
        "soil":       f"{SLX_NAME}/SoilMoisture_2",
        "flood_flag":  f"{SLX_NAME}/FloodFlag2",
        "confidence_score": f"{SLX_NAME}/ConfidenceScore2",
        # Dashboard → Simulink control blocks
        "sluice_blk": f"{SLX_NAME}/SluiceGate_2",
        "pump_blk":   f"{SLX_NAME}/WaterPump_2",
        "override_blk": f"{SLX_NAME}/InfraOverride_2",
        "sluice_display": f"{SLX_NAME}/Gate_2",
        "pump_display":   f"{SLX_NAME}/Pump_2",
        "rule_blocks": {
            "fri": [
                f"{SLX_NAME}/Flood Risk Index (FRI)_2",
                f"{SLX_NAME}/FRI_2",
                f"{SLX_NAME}/Flood Risk Index (FRI)",
                f"{SLX_NAME}/FRI",
            ],
            "risk_text": [
                f"{SLX_NAME}/Flood Risk Text Display_2",
                f"{SLX_NAME}/Flood Risk Text_2",
                f"{SLX_NAME}/Flood Risk Text Display",
                f"{SLX_NAME}/Flood Risk Text",
            ],
            "flood_type": [
                f"{SLX_NAME}/Flood TYPE Display_2",
                f"{SLX_NAME}/Final Flood Type_2",
                f"{SLX_NAME}/Flood TYPE Display",
                f"{SLX_NAME}/Final Flood Type",
            ],
        },
        "sensors": {
            "river": [f"{SLX_NAME}/River2_{i}" for i in range(1, 4)],
            "rain":  [f"{SLX_NAME}/Rain2_{i}" for i in range(1, 4)],
            "soil":  [f"{SLX_NAME}/Soil2_{i}" for i in range(1, 4)],
        },
        "sensor_elevations": {
            "river": [0.0, 0.0, 0.0],
            "rain":  [0.0, 0.0, 0.0],
            "soil":  [0.0, 0.0, 0.0],
        },
        "region": "b",
        "model_path": BACKEND_DIR / "models" / "current" / "b.pkl",
        "history":    deque(maxlen=60),
        "model":      None,
    },
}

def _ensure_initial_models():
    """Train once from raw original+synthetic data if no deployed models exist."""
    model_paths = [cfg["model_path"] for cfg in AREAS.values()]
    existing = [path for path in model_paths if path.exists()]
    missing = [path for path in model_paths if not path.exists()]

    if not missing:
        return
    if existing:
        seed_model = existing[0]
        for path in missing:
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(seed_model, "rb") as src, open(path, "wb") as dst:
                dst.write(src.read())
            print(f"[Model] Filled missing deployed model {path.name} from {seed_model.name}")
        return

    train_csv = RAW_DIR / "flood_train_with_synthetic.csv"
    test_csv = RAW_DIR / "flood_test_real.csv"
    if not train_csv.exists() or not test_csv.exists():
        print(f"[Model] Training CSVs missing. Using heuristic until models are available.")
        return

    print("[Model] No deployed area model found. Running initial training once...")
    model = initial_train(train_csv=train_csv, test_csv=test_csv)

    for cfg in AREAS.values():
        cfg["model_path"].parent.mkdir(parents=True, exist_ok=True)
        with open(cfg["model_path"], "wb") as f:
            pickle.dump(model, f)
        print(f"[Model] Bootstrapped deployed model -> {cfg['model_path']}")


def _load_area_models():
    # Load deployed models per area (falls back to heuristic if not trained yet)
    for _area_id, _cfg in AREAS.items():
        _model_path = _cfg["model_path"]
        try:
            if _model_path.exists():
                with open(_model_path, "rb") as _f:
                    _cfg["model"] = pickle.load(_f)
                _cfg["model_mtime"] = _model_path.stat().st_mtime
                print(f"[Model] Area {_area_id}: loaded deployed model from {_model_path.name}")
            else:
                print(f"[Model] Area {_area_id}: no deployed model found, using heuristic")
        except Exception as e:
            print(f"[Model] Area {_area_id}: error loading {_model_path.name}: {e}. Using heuristic.")
            _cfg["model"] = None
            _cfg["model_mtime"] = None


def _reload_area_model_if_changed(area_id: int, cfg: dict) -> None:
    """Hot-reload a region model when main.py deploys a newer current/<region>.pkl."""
    model_path = cfg["model_path"]
    if not model_path.exists():
        return
    mtime = model_path.stat().st_mtime
    if cfg.get("model_mtime") == mtime:
        return
    try:
        with open(model_path, "rb") as f:
            cfg["model"] = pickle.load(f)
        cfg["model_mtime"] = mtime
        print(f"[Model] Area {area_id}: reloaded updated model from {model_path.name}")
    except Exception as e:
        print(f"[Model] Area {area_id}: failed to reload {model_path.name}: {e}")


_ensure_initial_models()
_load_area_models()

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class SensorPayload(BaseModel):
    river_level:   float = Field(..., ge=0,   le=20)
    rain_level:    float = Field(..., ge=0,   le=500)
    soil_moisture: float = Field(..., ge=0,   le=100)


class ControlPayload(BaseModel):
    """Mitigation control codes sent from the dashboard.

    sluice and pump are integer codes: 0, 1, 2, 3.
    Simulink's lookup blocks map those codes to 0%, 30%, 70%, 100%.
    override: 1 for manual override on, 0 for auto mode.
    """
    sluice: int = Field(..., ge=0, le=3)
    pump:   int = Field(..., ge=0, le=3)
    override: int = Field(default=0, ge=0, le=1)

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
        return None


# ---------------------------------------------------------------------------
# Background pollers – FAST (fused values) and SLOW (individual sensors)
#
# Root-cause of lag: reading 4×3=12 individual sensor blocks per area (24
# total) in the same loop as the 3 fused reads meant the sensor cards on the
# dashboard only refreshed every ~3–5 s instead of sub-second.
#
# Fix: two separate threads.
#   _poll_fast  – reads the 3 fused blocks + writes prediction blocks every 0.5 s.
#                 This is what the sensor cards and the risk gauge display.
#   _poll_slow  – reads the 12 individual sub-sensor blocks every 5 s.
# ---------------------------------------------------------------------------

FAST_INTERVAL = 0.5   # seconds – all Simulink reads happen here

# Live cache: { area_id: {...full payload...} | None }
_live_cache: dict = {area_id: None for area_id in AREAS}

# Individual sensor cache – a snapshot kept between cycles so the API
# always has something to return while the current cycle is running.
_sensor_cache: dict = {
    area_id: {"river": [None]*3, "rain": [None]*3, "soil": [None]*3}
    for area_id in AREAS
}
_sensor_lock = threading.Lock()

MAIN_API_URL = "http://127.0.0.1:5000"

RULE_BLOCKS = {
    "fri": [
        f"{SLX_NAME}/Flood Risk Index (FRI)",
        f"{SLX_NAME}/FRI",
    ],
    "risk_text": [
        f"{SLX_NAME}/Flood Risk Text Display",
        f"{SLX_NAME}/Flood Risk Text",
    ],
    "flood_type": [
        f"{SLX_NAME}/Flood TYPE Display",
        f"{SLX_NAME}/Final Flood Type",
    ],
}
_unavailable_rule_paths = set()


def _post_json(url: str, payload: dict, timeout: float = 1.0) -> dict | None:
    """Best-effort POST helper for forwarding readings to main.py."""
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"[Bridge] Unable to forward payload to main.py: {exc}")
        return None


def _read_optional_block(block_path: str):
    if not block_path:
        return None
    if block_path in _unavailable_rule_paths:
        return None
    try:
        block_type = eng.get_param(block_path, "BlockType")
        if block_type == "Display":
            safe_path = block_path.replace("'", "''")
            raw = eng.eval(
                f"get_param('{safe_path}', 'RuntimeObject').InputPort(1).Data",
                nargout=1
            )
            return raw
        return eng.get_param(block_path, "Value")
    except Exception:
        _unavailable_rule_paths.add(block_path)
        return None


def _try_read_first(paths: list[str]):
    """Read the first Simulink block path that exists and has a usable value."""
    for path in paths:
        value = _read_optional_block(path)
        if value is not None:
            return value
    return None


def _risk_text_from_fri(fri: float) -> str:
    if fri < 0.3:
        return "NORMAL"
    if fri < 0.6:
        return "ALERT"
    if fri < 0.8:
        return "WARNING"
    return "DANGER"


def _flood_type_code(label: str | None) -> int:
    return {"Fluvial": 1, "Pluvial": 2, "Compound": 3}.get(label or "", 0)


def _flood_type_label(value) -> str:
    code_map = {0: "None", 1: "Fluvial", 2: "Pluvial", 3: "Compound"}
    if value is None:
        return "None"
    try:
        return code_map.get(int(round(float(value))), "None")
    except (TypeError, ValueError):
        label = str(value).strip()
        return label if label else "None"


def _command_code_to_percent(code: float | int | None) -> int:
    code_map = {0: 0, 1: 30, 2: 70, 3: 100}
    try:
        return code_map.get(int(round(float(code))), 0)
    except (TypeError, ValueError):
        return 0


def _control_readback(cfg: dict) -> dict:
    pump_pct = _read_optional_block(cfg.get("pump_display", ""))
    gate_pct = _read_optional_block(cfg.get("sluice_display", ""))

    if pump_pct is None:
        pump_pct = _command_code_to_percent(_read_optional_block(cfg["pump_blk"]))
    if gate_pct is None:
        gate_pct = _command_code_to_percent(_read_optional_block(cfg["sluice_blk"]))

    return {
        "pump_percent": round(float(pump_pct), 1),
        "gate_percent": round(float(gate_pct), 1),
    }


def _region_elevation(cfg: dict, sensor_values: dict) -> float:
    """Average elevations for sub-sensors with valid readings."""
    valid_elevations = []
    for sensor_type, values in sensor_values.items():
        elevations = cfg.get("sensor_elevations", {}).get(sensor_type, [])
        for value, elevation in zip(values, elevations):
            if value is not None:
                valid_elevations.append(float(elevation))

    if not valid_elevations:
        all_elevations = [
            float(elevation)
            for elevations in cfg.get("sensor_elevations", {}).values()
            for elevation in elevations
        ]
        valid_elevations = all_elevations or [0.0]

    return round(sum(valid_elevations) / len(valid_elevations), 3)


def _rule_based_snapshot(river_level: float, rain_level: float, soil_moisture: float,
                         flood_type_label: str | None, rule_blocks: dict | None = None) -> dict:
    """Return rule-based values from Simulink when available, with a local fallback."""
    blocks = rule_blocks or RULE_BLOCKS

    fri = _try_read_first(blocks["fri"])
    if fri is None:
        fri = min(
            max((rain_level / 100) + (river_level / 10) + (soil_moisture / 100), 0),
            1,
        )

    risk_text = _try_read_first(blocks["risk_text"])
    if risk_text is None:
        risk_text = _risk_text_from_fri(float(fri))
    else:
        risk_text = str(risk_text)

    flood_type = _try_read_first(blocks["flood_type"])
    if flood_type is None:
        flood_type = _flood_type_code(flood_type_label)

    return {
        "fri": round(float(fri), 3),
        "risk_text": risk_text,
        "flood_type": int(float(flood_type)) if str(flood_type).replace(".", "", 1).isdigit() else flood_type,
        "flood_type_label": flood_type_label,
    }


def _poll_fast() -> None:
    """Single background thread: reads ALL Simulink blocks for every area
    every FAST_INTERVAL seconds.  Fused values, individual sub-sensors, and
    the prediction block writes all happen together so every displayed value on the
    dashboard updates at exactly the same cadence."""
    while True:
        time.sleep(FAST_INTERVAL)
        cycle_ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        pending_logs = []
        for area_id, cfg in AREAS.items():
            hist = cfg["history"]

            # --- 3 fused reads ---
            river_level   = _read_block(cfg["river"])
            rain_level    = _read_block(cfg["rain"])
            soil_moisture = _read_block(cfg["soil"])

            if river_level is None or rain_level is None or soil_moisture is None:
                if hist:
                    last = hist[-1]
                    river_level   = river_level   if river_level   is not None else last.get("river_level",   0.0)
                    rain_level    = rain_level    if rain_level    is not None else last.get("rain_level",    0.0)
                    soil_moisture = soil_moisture if soil_moisture is not None else last.get("soil_moisture", 0.0)
                else:
                    river_level   = river_level   if river_level   is not None else 0.0
                    rain_level    = rain_level    if rain_level    is not None else 0.0
                    soil_moisture = soil_moisture if soil_moisture is not None else 0.0

            # All values capped to 1 decimal place throughout
            river_level   = round(river_level,   1)
            rain_level    = round(rain_level,    1)
            soil_moisture = round(soil_moisture, 1)

            ts = cycle_ts
            reading = {
                "timestamp":     ts,
                "river_level":   river_level,
                "rain_level":    rain_level,
                "soil_moisture": soil_moisture,
            }
            hist.append(reading)

            # --- Individual sub-sensor reads (same cycle = same cadence) ---
            ind = {"river": [], "rain": [], "soil": []}
            for s_type, paths in cfg["sensors"].items():
                for p in paths:
                    try:
                        val = _read_block(p)
                        ind[s_type].append(
                            round(val, 1) if val is not None else None
                        )
                    except Exception:
                        ind[s_type].append(None)

            with _sensor_lock:
                _sensor_cache[area_id] = ind

            elevation_m = _region_elevation(cfg, ind)
            _reload_area_model_if_changed(area_id, cfg)
            pred       = predict_risk(river_level, rain_level, soil_moisture, elevation_m, cfg["model"])
            flood_type = classify_flood_type(river_level, rain_level, soil_moisture, pred["risk_level"])
            trends     = compute_trends(hist)
            rule_based = _rule_based_snapshot(
                river_level,
                rain_level,
                soil_moisture,
                flood_type,
                cfg.get("rule_blocks"),
            )
            controls   = _control_readback(cfg)

            # Write prediction data back to Simulink
            try:
                eng.set_param(cfg["flood_flag"], "Value",
                              str(pred["flood_prediction"]), nargout=0)
                eng.set_param(cfg["confidence_score"], "Value",
                              str(pred["confidence"]), nargout=0)
            except Exception as e:
                print(f"[ERROR] Area {area_id} writing prediction blocks: {e}")

            _live_cache[area_id] = {
                "timestamp":     ts,
                "river_level":   {"fused_value": river_level,   "sensors": ind["river"]},
                "rain_level":    {"fused_value": rain_level,    "sensors": ind["rain"]},
                "soil_moisture": {"fused_value": soil_moisture, "sensors": ind["soil"]},
                "elevation_m":   elevation_m,
                **pred,
                "trends":        trends,
                "flood_type":    flood_type,
                "rule_based":    rule_based,
                "controls":      controls,
            }

            # Log at the slower CSV cadence; live dashboard updates stay fast.
            now = time.time()
            if now - _last_log_at[area_id] >= LOG_INTERVAL:
                _last_log_at[area_id] = now
                flood_type_for_log = rule_based.get("flood_type_label") or _flood_type_label(
                    rule_based.get("flood_type")
                )
                rule_fri = float(rule_based.get("fri", 0.0))
                rule_flood_occurrence = 1 if rule_fri >= 0.3 else 0
                pending_logs.append({
                        "area": area_id,
                        "timestamp": ts,
                        "river_level": river_level,
                        "rain_level": rain_level,
                        "soil_moisture": soil_moisture,
                        "elevation_m": elevation_m,
                        "rule_flood_occurrence": rule_flood_occurrence,
                        "rule_fri": rule_fri,
                        "rule_risk_text": rule_based.get("risk_text", "None"),
                        "rule_flood_type": flood_type_for_log,
                        "ai_flood_occurrence": pred["flood_prediction"],
                        "ai_confidence": pred["confidence"],
                        "final_flood_occurrence": rule_flood_occurrence,
                        "flood_type": flood_type_for_log,
                    })

        # Send area log rows together and keep the fast Simulink poller non-blocking.
        for payload in pending_logs:
            threading.Thread(
                target=_post_json,
                args=(f"{MAIN_API_URL}/log", payload),
                kwargs={"timeout": 2.0},
                daemon=True,
                name=f"log-area-{payload['area']}",
            ).start()


_poll_fast_thread = threading.Thread(target=_poll_fast, daemon=True, name="poller-fast")
_poll_fast_thread.start()
print(f"[Poller] Started – all Simulink reads (fused + individual sensors) every {FAST_INTERVAL}s.")


# ---------------------------------------------------------------------------
# ML / heuristic prediction  (model is per-area)
# ---------------------------------------------------------------------------

def predict_risk(river_level: float, rain_level: float,
                 soil_moisture: float, elevation_m: float, model) -> dict:
    if model is None:
        score = (
            0.9  * river_level
            + 0.06  * rain_level
            + 0.035 * soil_moisture
        )
        probability = 1 / (1 + np.exp(-(score - 7.5)))
    else:
        X = pd.DataFrame([{
            "Rainfall_mm": rain_level,
            "WaterLevel_m": river_level,
            "SoilMoisture_pct": soil_moisture,
            "Elevation_m": elevation_m,
        }])
        probability = float(model.predict_proba(X)[0][1])

    flood_prediction = 1 if probability >= 0.5 else 0
    confidence = round(probability if flood_prediction == 1 else 1 - probability, 4)

    if probability < 0.30:
        level = "LOW"
    elif probability < 0.70:
        level = "WARNING"
    else:
        level = "CRITICAL"

    return {
        "flood_prediction": flood_prediction,  # 0 = no flood, 1 = flood
        "confidence": confidence,               # 0.0-1.0 confidence score
        "flood_probability": round(probability, 4),
        "risk_level": level,
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
    Return the latest cached readings for the selected area.
    All MATLAB I/O happens in the background poller thread – this endpoint
    is non-blocking and returns in microseconds.
    """
    cached = _live_cache.get(area)
    if cached is None:
        # Poller hasn't completed its first cycle yet – return a loading sentinel
        return {
            "timestamp":       datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "river_level":     {"fused_value": 0.0, "sensors": [None]*3},
            "rain_level":      {"fused_value": 0.0, "sensors": [None]*3},
            "soil_moisture":   {"fused_value": 0.0, "sensors": [None]*3},
            "elevation_m":     _region_elevation(AREAS[area], _sensor_cache.get(area, {})),
            "flood_prediction": 0,
            "confidence": 0.5,
            "flood_probability": 0.0,
            "risk_level":      "LOW",
            "trends":          {"river_level": "stable", "rain_level": "stable", "soil_moisture": "stable"},
            "flood_type":      None,
            "rule_based":      {"fri": 0.0, "risk_text": "NORMAL", "flood_type": 0, "flood_type_label": None},
            "controls":        {"pump_percent": 0, "gate_percent": 0},
        }
    return cached


@app.get("/api/history")
def get_history(area: int = Query(1, ge=1, le=2)):
    return list(AREAS[area]["history"])


@app.post("/api/predict")
def manual_predict(payload: SensorPayload, area: int = Query(1, ge=1, le=2)):
    elevation_m = _region_elevation(AREAS[area], _sensor_cache.get(area, {}))
    pred = predict_risk(payload.river_level, payload.rain_level,
                        payload.soil_moisture, elevation_m, AREAS[area]["model"])
    return {"input": payload.model_dump(), **pred}


# ---------------------------------------------------------------------------
# Control endpoint  (Dashboard → Simulink)
# Uses set_param so values appear in the Simulink Constant blocks immediately,
# with no special block configuration.
# Payload values are command codes: 0, 1, 2, 3.
# ---------------------------------------------------------------------------

@app.post("/api/controls")
def set_controls(payload: ControlPayload, area: int = Query(1, ge=1, le=2)):
    """
    Write sluice gate and water pump levels directly into the Simulink Constant
    blocks SluiceGate<N> / WaterPump<N> / InfraOverride via set_param.

    Accepts mitigation codes. Simulink lookup blocks map:
    - 0: 0%
    - 1: 30%
    - 2: 70%
    - 3: 100%
    
    override flag (0/1) is written to InfraOverride block.
    """
    cfg = AREAS[area]
    errors = []

    try:
        eng.set_param(cfg["sluice_blk"], "Value", str(payload.sluice), nargout=0)
        print(f"[Controls] Area {area} SluiceGate code {payload.sluice}")
    except Exception as e:
        err = f"Area {area} SluiceGate set_param failed: {e}"
        print(f"[ERROR] {err}")
        errors.append(err)

    try:
        eng.set_param(cfg["pump_blk"], "Value", str(payload.pump), nargout=0)
        print(f"[Controls] Area {area} WaterPump code {payload.pump}")
    except Exception as e:
        err = f"Area {area} WaterPump set_param failed: {e}"
        print(f"[ERROR] {err}")
        errors.append(err)

    try:
        eng.set_param(cfg["override_blk"], "Value", str(payload.override), nargout=0)
        print(f"[Controls] Area {area} InfraOverride flag -> {payload.override}")
    except Exception as e:
        err = f"Area {area} InfraOverride set_param failed: {e}"
        print(f"[ERROR] {err}")
        errors.append(err)

    if errors:
        return {"status": "partial", "errors": errors,
                "sluice_code": payload.sluice, "pump_code": payload.pump, "override": payload.override, "area": area}

    return {"status": "ok", "sluice_code": payload.sluice,
            "pump_code": payload.pump, "override": payload.override, "area": area}
