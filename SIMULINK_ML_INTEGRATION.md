# Simulink ML Model Integration Guide

## What the Backend Sends to Simulink

Every 0.5 seconds, the Python backend reads live sensor data from Simulink, runs it through the ML model, and writes two values back:

### Output Blocks (Area 1):
- **FloodFlag1** (Constant block): `0` = no flood, `1` = flood predicted
- **ConfidenceScore1** (Constant block): `0.0` to `1.0` = ML confidence (decimal)

### Output Blocks (Area 2):
- **FloodFlag2** (Constant block): `0` = no flood, `1` = flood predicted
- **ConfidenceScore2** (Constant block): `0.0` to `1.0` = ML confidence (decimal)

---

## Tiered Response Logic to Implement in Simulink

The ML model acts as an early-warning system. Implement this logic in Simulink to map confidence scores to control actions:

| Confidence Range | Tier | Action | Sluice Gate | Water Pump | Operator Alert |
|---|---|---|---|---|---|
| 0.0 – 0.30 | 0 (False Alarm) | None | Keep current | Keep current | No |
| 0.31 – 0.60 | 1 (Alert) | Pre-position | 15% | 15% | Yes – "ML early warning" |
| 0.61 – 1.0 | 2 (High Confidence) | Pre-position | 30% | 30% | Yes – "ML high confidence" |

---

## Implementation Steps

1. **Create a Subsystem**: Add a new Subsystem block named `ML Tiered Response Controller` that reads `FloodFlag` and `ConfidenceScore`.

2. **Extract Confidence Tier**:
   - If `ConfidenceScore < 0.30`: Tier = 0 (do nothing)
   - If `0.30 ≤ ConfidenceScore ≤ 0.60`: Tier = 1 (15% pre-position)
   - If `ConfidenceScore > 0.60`: Tier = 2 (30% pre-position)

3. **Reconcile with Simulink's Rule-Based Flood Detection**:
   - **If Simulink detects flood** (its own rule-based logic): Use Simulink's decision + type-specific gate/pump profile
   - **Else if ML Tier ≥ 1**: Set gate/pump to the ML-derived percentage (15% or 30%)
   - **Else**: Keep current control values (normal operation)

4. **Alert Logic**:
   - If ML Tier ≥ 1 AND Simulink has not confirmed a flood: Log/display "ML Early Warning – Confidence: [X%]"

---

## Example Logic (Pseudocode)

```
IF (Simulink_Flood_Detected == 1):
    Use Simulink's gate/pump profile (type-specific)
ELSE IF (ConfidenceScore > 0.60):
    Sluice_Gate = 0.30
    Water_Pump = 0.30
    Alert = "HIGH confidence ML prediction – preparing"
ELSE IF (ConfidenceScore > 0.30):
    Sluice_Gate = 0.15
    Water_Pump = 0.15
    Alert = "Early warning from ML – confidence: [X%]"
ELSE:
    Sluice_Gate = Keep current
    Water_Pump = Keep current
    Alert = None
```

---

## Key Points

- **Simulink remains the authority**: If Simulink detects a flood, it wins.
- **ML is the early-warning layer**: ML can trigger pre-positioning (gate/pump at 15–30%) before Simulink confirms.
- **No full flood response from ML alone**: ML can only reach 30%, not the full response Simulink uses.
- **Cost-conscious**: 15–30% activation is minimal compared to full deployment.
- **Flood type agnostic**: ML tiers use generic gate/pump because the ML doesn't learn flood types. This is safe across all scenarios.
