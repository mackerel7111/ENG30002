"""
app.py
Flask API Server — Flood Prediction Backend

WHAT THIS FILE DOES:
  This file runs a web server that the dashboard talks to
  It exposes two API endpoints:

    POST /ingest  = dashboard sends sensor data here
    POST /predict = dashboard sends live readings, gets flood result

  This file does not contain any model logic , it just receives
  requests from the dashboard and calls flood_prediction_model.py.

HOW TO RUN:
  python app.py

  Server starts at: http://localhost:5000
  Keep this running while the dashboard is in use.

WHAT TO KNOW:
  Base URL : http://localhost:5000  (or server IP when deployed)
  Endpoint : POST /ingest   = send sensor CSV rows
  Endpoint : POST /predict  = send live sensor values
"""

import os
import csv
import threading
from queue import Queue
from datetime import datetime
from pathlib import Path

import pandas as pd
from flask import Flask, request, jsonify

from floodpredictivemodel import predict_live, ingest_sensor_data, retrain_region, get_archive

app = Flask(__name__)

# Logs folder for dashboard CSVs (app.py will call /log to write here)
BACKEND_DIR = Path(__file__).parent
LOGS_DIR = BACKEND_DIR / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)
CSV_HEADERS = [
    "timestamp",
    "area",
    "Date",
    "Location",
    "Rainfall_mm",
    "WaterLevel_m",
    "SoilMoisture_pct",
    "Elevation_m",
    "synthetic",
    "FloodOccurrence",
    "FloodType",
    "RuleFloodOccurrence",
    "RuleFRI",
    "RuleRiskText",
    "RuleFloodType",
    "AIFloodOccurrence",
    "AIConfidence",
    "FinalFloodOccurrence",
]


def _ensure_dataset_csv(path: Path) -> None:
    """Create or migrate dashboard log CSVs without losing existing rows."""
    if not path.exists() or path.stat().st_size == 0:
        path.write_text(",".join(CSV_HEADERS) + "\n")
        return

    existing = pd.read_csv(path)
    legacy_map = {
        "Date": "timestamp",
        "Rainfall_mm": "rain_level",
        "WaterLevel_m": "river_level",
        "SoilMoisture_pct": "soil_moisture",
        "AIFloodOccurrence": "flood_prediction",
        "AIConfidence": "confidence",
    }
    changed = False
    for new_column, old_column in legacy_map.items():
        if new_column not in existing.columns and old_column in existing.columns:
            existing[new_column] = existing[old_column]
            changed = True

    if "FloodOccurrence" not in existing.columns and "AIFloodOccurrence" in existing.columns:
        existing["FloodOccurrence"] = existing["AIFloodOccurrence"]
        changed = True

    for column in CSV_HEADERS:
        if column not in existing.columns:
            if column in ("synthetic",):
                existing[column] = False
            elif column in ("FloodType", "RuleFloodType", "RuleRiskText"):
                existing[column] = "None"
            elif column == "Location":
                existing[column] = ""
            else:
                existing[column] = 0
            changed = True

    if changed or list(existing.columns) != CSV_HEADERS:
        existing = existing[CSV_HEADERS]
        existing.to_csv(path, index=False)

# Ensure Dataset CSVs exist with headers
for i in (1, 2):
    _ensure_dataset_csv(LOGS_DIR / f"Dataset{i}.csv")

# Background retrain worker
RETRAIN_QUEUE = Queue()
RETRAIN_STATUS = {"is_running": False, "last_triggered": None, "last_completed": None}
RETRAIN_LOCK = threading.Lock()

def _retrain_worker():
    """Background daemon thread: processes retrain jobs from the queue."""
    while True:
        try:
            job = RETRAIN_QUEUE.get(block=True)  # Wait for a job
            with RETRAIN_LOCK:
                RETRAIN_STATUS["is_running"] = True
                RETRAIN_STATUS["last_triggered"] = datetime.now().isoformat()
            
            region = job.get("region", "a")
            print(f"  [worker] Starting retrain job for region {region.upper()}...")
            best_model_updated = retrain_region(region)
            
            with RETRAIN_LOCK:
                RETRAIN_STATUS["is_running"] = False
                RETRAIN_STATUS["last_completed"] = datetime.now().isoformat()
                RETRAIN_STATUS["best_model_updated"] = best_model_updated
            
            print(f"  [worker] Region {region.upper()} retrain completed. Best model updated: {best_model_updated}")
            RETRAIN_QUEUE.task_done()
        except Exception as e:
            print(f"  [worker] Error during retrain: {e}")
            with RETRAIN_LOCK:
                RETRAIN_STATUS["is_running"] = False
                RETRAIN_STATUS["error"] = str(e)

_worker_thread = threading.Thread(target=_retrain_worker, daemon=True, name="retrain-worker")
_worker_thread.start()
print("[Main] Background retrain worker started")

# /ingest
#
# The dashboard calls this endpoint to send new sensor readings
# backend saves the data to the correct region
# applies the rolling window, and triggers retraining if the 1000-row threshold is hit

# WHAT TO DO WITH THE RESPONSE:
#   If best_model_updated = true: reload the prediction model on the dashboard side (/predict function will use new model)


@app.route("/ingest", methods=["POST"])
def ingest():
    data   = request.get_json()
    region = data.get("region", "a")
    rows   = pd.DataFrame(data["rows"])

    triggered          = ingest_sensor_data(rows, region=region)
    best_model_updated = False

    if triggered:
        print("\n  [auto-retrain] Rolling threshold hit. Starting retrain...")
        best_model_updated = retrain_region(region)

    return jsonify({
        "status":             "ok",
        "retrain_triggered":   triggered,
        "best_model_updated":  best_model_updated,
    })

@app.route("/log", methods=["POST"])
def log():
    """Accept a single sensor reading from the dashboard/app and append to
    the Dataset CSV. Also forward the reading into the ingest pipeline so
    rolling CSVs are updated and retrain can be triggered.

    Expected JSON:
      {"area": 1, "timestamp": "2026-05-07 12:00:00",
       "river_level": 3.2, "rain_level": 12.3, "soil_moisture": 23.1,
       "elevation_m": 12.1, "flood_prediction": 1, "confidence": 0.83,
       "flood_type": "Pluvial" }
    """
    payload = request.get_json()
    area = int(payload.get("area", 1))
    if area not in (1, 2):
        return jsonify({"status": "error", "reason": "invalid area"}), 400

    ds = LOGS_DIR / f"Dataset{area}.csv"
    _ensure_dataset_csv(ds)
    timestamp = payload.get("timestamp", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    flood_type = payload.get("flood_type", payload.get("FloodType", "None")) or "None"
    rule_flood = int(payload.get("rule_flood_occurrence", payload.get("RuleFloodOccurrence", 0)))
    ai_flood = int(payload.get("ai_flood_occurrence", payload.get("AIFloodOccurrence", payload.get("flood_prediction", 0))))
    final_flood = int(payload.get("final_flood_occurrence", payload.get("FinalFloodOccurrence", rule_flood)))
    row = {
        "timestamp": timestamp,
        "area": area,
        "Date": timestamp,
        "Location": f"Area{area}",
        "Rainfall_mm": float(payload.get("rain_level", payload.get("Rainfall_mm", 0.0))),
        "WaterLevel_m": float(payload.get("river_level", payload.get("WaterLevel_m", 0.0))),
        "SoilMoisture_pct": float(payload.get("soil_moisture", payload.get("SoilMoisture_pct", 0.0))),
        "Elevation_m": float(payload.get("elevation_m", payload.get("Elevation_m", 0.0))),
        "synthetic": False,
        "FloodOccurrence": rule_flood,
        "FloodType": flood_type,
        "RuleFloodOccurrence": rule_flood,
        "RuleFRI": float(payload.get("rule_fri", payload.get("RuleFRI", 0.0))),
        "RuleRiskText": payload.get("rule_risk_text", payload.get("RuleRiskText", "None")) or "None",
        "RuleFloodType": payload.get("rule_flood_type", payload.get("RuleFloodType", flood_type)) or "None",
        "AIFloodOccurrence": ai_flood,
        "AIConfidence": float(payload.get("ai_confidence", payload.get("AIConfidence", payload.get("confidence", 0.0)))),
        "FinalFloodOccurrence": final_flood,
    }
    # Append to CSV
    with open(ds, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_HEADERS)
        writer.writerow(row)

    # Build ingest row expected by floodpredictivemodel.ingest_sensor_data
    # Map area -> region: 1 -> a, 2 -> b
    region = "a" if area == 1 else "b"
    ingest_row = pd.DataFrame([{
        key: row[key]
        for key in CSV_HEADERS
        if key not in ("timestamp", "area")
    }])

    try:
        triggered = ingest_sensor_data(ingest_row, region=region)
    except Exception as e:
        return jsonify({"status": "error", "reason": str(e)}), 500

    best_model_updated = False
    if triggered:
        # Queue retrain job instead of blocking
        RETRAIN_QUEUE.put({"triggered_by": "rolling_threshold", "region": region})
        print(f"  [/log] Region {region.upper()} retrain job queued (threshold hit). Returning immediately.")

    return jsonify({
        "status": "ok",
        "retrain_triggered": triggered,
        "retrain_queued": triggered,
    })

# /predict
#
# The dashboard calls this endpoint with live sensor values to get a flood prediction
# backend loads best_model.pkl and returns the result.

# WHAT TO DO WITH THE RESPONSE:
#   flood_occurrence  = show alert on dashboard if 1
#   confidence_score  = display as percentage 
#   Both values       = forwarded simulink controller

@app.route("/predict", methods=["POST"])
def predict():
    data   = request.get_json()
    result = predict_live(
        rainfall_mm       = data["rainfall_mm"],
        water_level_m     = data["water_level_m"],
        soil_moisture_pct = data["soil_moisture_pct"],
        elevation_m       = data["elevation_m"],
    )
    return jsonify(result)

@app.route("/model/status", methods=["GET"])
def model_status():
    """Return current model archive, deployed models, and retrain status."""
    with RETRAIN_LOCK:
        status_copy = RETRAIN_STATUS.copy()
    
    archive = get_archive()
    archive_info = [
        {"path": str(p), "filename": Path(p).name}
        for p in archive
    ]
    
    return jsonify({
        "status": "ok",
        "retrain_worker": status_copy,
        "archive_count": len(archive),
        "archive_files": archive_info,
    })


@app.route("/model/retrain-now", methods=["POST"])
def retrain_now():
    """Manually trigger a retrain job (non-blocking)."""
    payload = request.get_json(silent=True) or {}
    region = str(payload.get("region", "a")).lower()
    if region not in ("a", "b"):
        return jsonify({"status": "error", "reason": "region must be 'a' or 'b'"}), 400

    RETRAIN_QUEUE.put({"triggered_by": "manual", "region": region})
    return jsonify({
        "status": "ok",
        "message": f"Region {region.upper()} retrain job queued",
        "retrain_worker_status": RETRAIN_STATUS.copy(),
    })


# /health
# simple health check endpoint
# call this function to confirm the backend server is running before doing anything

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})

if __name__ == "__main__":
    app.run(debug=True, port=5000, threaded=True, use_reloader=False)
