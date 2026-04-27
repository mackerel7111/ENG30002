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

import pandas as pd
from flask import Flask, request, jsonify
from floodpredictivemodel import predict_live, ingest_sensor_data, retrain

app = Flask(__name__)

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
        best_model_updated = retrain()

    return jsonify({
        "status":             "ok",
        "retrain_triggered":   triggered,
        "best_model_updated":  best_model_updated,
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

# /health
# simple health check endpoint
# call this function to confirm the backend server is running before doing anything

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})

if __name__ == "__main__":
    app.run(debug=True, port=5000)