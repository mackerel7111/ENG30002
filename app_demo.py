from flask import Flask, request, jsonify, send_from_directory
import matlab.engine
import os

app = Flask(__name__)

# ── MATLAB / Simulink setup ───────────────────────────────────────────────────
eng = matlab.engine.start_matlab()

MODEL_DIR  = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(MODEL_DIR, 'DisplayTest')
MODEL_NAME = 'DisplayTest'

eng.addpath(MODEL_DIR, nargout=0)
eng.load_system(MODEL_PATH, nargout=0)
eng.open_system(MODEL_NAME, nargout=0)     # show Simulink window

# Start the simulation (Stop Time = inf so it runs forever)
eng.set_param(MODEL_NAME, 'StopTime', 'inf', nargout=0)
eng.set_param(MODEL_NAME, 'SimulationCommand', 'start', nargout=0)
print('[Simulink] Simulation started.')

# Debug: print block paths once on startup
blocks = eng.find_system(MODEL_NAME, 'Type', 'block')
print('[Simulink] Blocks found in model:')
for b in blocks:
    print(' ', b)

# ── Server-side state ─────────────────────────────────────────────────────────
button_value = 0       # existing toggle button state

# ── Routes ────────────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return send_from_directory(os.path.dirname(os.path.abspath(__file__)), 'index.html')

# ── Existing: button toggle (Dashboard → Simulink) ───────────────────────────
@app.route('/button', methods=['POST'])
def button():
    global button_value
    button_value = 1 - button_value          # alternates 0 → 1 → 0 → 1

    try:
        eng.set_param(f'{MODEL_NAME}/Constant', 'Value', str(button_value), nargout=0)
        print(f'[Simulink] Constant → {button_value}')
        return jsonify({"value": button_value})
    except Exception as e:
        print(f'[ERROR] {e}')
        return jsonify({"error": str(e), "value": button_value}), 500

import math

# ── NEW: read SliderConstant value ← Simulink (Simulink → Dashboard) ─────────
@app.route('/get_slider', methods=['GET'])
def get_slider():
    try:
        # Read the Value parameter directly from the Simulink block
        val_str = eng.get_param(f'{MODEL_NAME}/SliderConstant', 'Value')
        # Explicitly round down (floor) to the nearest whole number
        val = math.floor(float(val_str))
        return jsonify({"value": val})
    except Exception as e:
        print(f'[ERROR] {e}')
        return jsonify({"error": str(e)}), 500

# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == '__main__':
    app.run(debug=False, port=5000)