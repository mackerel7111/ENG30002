# ENG30002
AI Powered Flood Prediction Dashboard

To run, first ensure Matlab is intalled (R2025a) and node.js. 

1. Inside frontend folder run: npm install
2. Then inside the bacckend folder, run: pip install -r requirements.txt

To run the files
1. Backend: uvicorn app:app --reload --port 8000
2. Frontend: npm run dev

# Flood Prediction Backend — NCR Philippines

## What this does
This backend runs a Random Forest model that predicts flood occurrence
from real-time sensor data. It exposes two API endpoints for the dashboard.

## Files
| File | Purpose |
|---|---|
| `flood_prediction_model.py` | Core model logic — training, retraining, prediction |
| `app.py` | Flask API server — connects dashboard to the model |
| `requirements.txt` | Python package dependencies |
| `.gitignore` | Tells Git which files to ignore |
| `flood_train_with_synthetic.csv` | Training data (historical + synthetic) |
| `flood_test_real.csv` | Test data (2020, becomes holdout) |

## How to run

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Run initial training (first time only)
```bash
python flood_prediction_model.py
```

### 3. Start the API server
```bash
python app.py
```
Server runs at: `http://localhost:5000`

## API Endpoints

### POST /ingest
Send sensor data from the dashboard to save and trigger retraining.

**Request:**
```json
{
  "region": "a",
  "rows": [
    {
      "Date": "2026-04-27",
      "Location": "Marikina",
      "Rainfall_mm": 38.5,
      "WaterLevel_m": 4.1,
      "SoilMoisture_pct": 30.0,
      "Elevation_m": 15,
      "FloodOccurrence": 0
    }
  ]
}
```

**Response:**
```json
{
  "status": "ok",
  "retrain_triggered": false,
  "best_model_updated": false
}
```
If `best_model_updated` is `true`, dashboard should reload the model.

---

### POST /predict
Get a flood prediction for a live sensor reading.

**Request:**
```json
{
  "rainfall_mm": 40.0,
  "water_level_m": 4.2,
  "soil_moisture_pct": 32.0,
  "elevation_m": 5
}
```

**Response:**
```json
{
  "flood_occurrence": 1,
  "confidence_score": 0.9873
}
```

---

### GET /health
Check if the server is running.

**Response:** `{ "status": "ok" }`
