from flask import Flask, request, jsonify
import joblib
import pandas as pd
import numpy as np
import os

app = Flask(__name__)

# Load the actual trained XGBoost models
MODEL_DIR = "./ml/"
try:
    print("Loading XGBoost Models...")
    failure_model = joblib.load(os.path.join(MODEL_DIR, 'xgboost_failurerate_with_latency.joblib'))
    throughput_model = joblib.load(os.path.join(MODEL_DIR, 'xgboost_throughput_with_latency.joblib'))
    print("Models loaded successfully!")
except Exception as e:
    print(f"Error loading models: {e}")
    failure_model = None
    throughput_model = None

@app.route('/predict', methods=['POST'])
def predict_risk():
    data = request.json
    if not data:
        return jsonify({"error": "No JSON payload provided"}), 400

    load = float(data.get("load", 50))
    num_caliper_workers = int(data.get("numCaliperWorkers", 10))
    hot_participants = int(data.get("hotParticipants", 1))
    ledger_writes = int(data.get("ledgerWrites", 2))
    reads = int(data.get("reads", 1))
    payload_bytes = int(data.get("payloadBytes", 200))
    latency = float(data.get("latency", 0.5))

    if not failure_model:
        return jsonify({"risk_score": 0.5, "throughput": 50.0, "status": "model_not_loaded"})

    features = pd.DataFrame([{
        'load': load,
        'numCaliperWorkers': num_caliper_workers,
        'hotParticipants': hot_participants,
        'ledgerWrites': ledger_writes,
        'reads': reads,
        'payloadBytes': payload_bytes,
        'latency': latency
    }])

    pred_failure_rate = float(failure_model.predict(features)[0])
    pred_failure_rate = max(0.0, min(1.0, pred_failure_rate))

    pred_throughput = float(throughput_model.predict(features)[0])
    pred_throughput = max(0.0, pred_throughput)

    return jsonify({
        "risk_score": pred_failure_rate,
        "throughput": pred_throughput,
        "status": "success"
    })

if __name__ == '__main__':
    print("Starting Digital Twin ML API Server on port 5000...")
    app.run(host='0.0.0.0', port=5000)
