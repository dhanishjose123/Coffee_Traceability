#!/usr/bin/env python3
"""Model-agnostic predictor API for the digital twin scheduler.

The API loads joblib models for throughput and failure risk. It works with
Random Forest, XGBoost, or any scikit-learn compatible estimator exposing
predict() and optionally predict_proba().
"""

from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path

import joblib
import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MODEL_DIR = ROOT / "caliper-bench_9" / "predictive-benchmarking" / "manuscript_ML" / "Working" / "models"
THROUGHPUT_MODEL_PATH = Path(os.getenv("THROUGHPUT_MODEL", DEFAULT_MODEL_DIR / "throughput_model.joblib"))
FAILURE_MODEL_PATH = Path(os.getenv("FAILURE_MODEL", DEFAULT_MODEL_DIR / "failure_classifier_model.joblib"))
HOST = os.getenv("PREDICTOR_HOST", "127.0.0.1")
PORT = int(os.getenv("PREDICTOR_PORT", "5055"))

DEFAULT_FEATURES = [
    "load",
    "numCaliperWorkers",
    "hotParticipants",
    "latency",
    "ledgerWrites",
    "reads",
    "payloadBytes",
]


def load_model(path):
    if not path.exists():
        print(f"Model not found: {path}")
        return None
    model = joblib.load(path)
    print(f"Loaded {type(model).__name__}: {path}")
    return model


throughput_model = load_model(THROUGHPUT_MODEL_PATH)
failure_model = load_model(FAILURE_MODEL_PATH)


def feature_names_for(*models):
    for model in models:
        names = getattr(model, "feature_names_in_", None)
        if names is not None:
            return [str(name) for name in names]
    return DEFAULT_FEATURES


FEATURE_NAMES = feature_names_for(throughput_model, failure_model)


def build_frame(payload):
    row = {}
    for name in FEATURE_NAMES:
        default = 0
        if name in ("load", "hotParticipants", "numCaliperWorkers"):
            default = 1
        row[name] = payload.get(name, default)
    return pd.DataFrame([row], columns=FEATURE_NAMES)


def predict_failure(model, frame):
    if model is None:
        return 0.0
    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(frame)[0]
        classes = list(getattr(model, "classes_", range(len(proba))))
        if 1 in classes:
            return float(proba[classes.index(1)])
        return float(max(proba))
    value = float(model.predict(frame)[0])
    return max(0.0, min(1.0, value))


def predict_throughput(model, frame, fallback_load):
    if model is None:
        return float(fallback_load)
    return max(0.0, float(model.predict(frame)[0]))


class Handler(BaseHTTPRequestHandler):
    def _json(self, status, body):
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path != "/health":
            self._json(404, {"error": "not found"})
            return
        self._json(200, {
            "status": "ok",
            "features": FEATURE_NAMES,
            "throughputModel": str(THROUGHPUT_MODEL_PATH),
            "failureModel": str(FAILURE_MODEL_PATH),
            "throughputModelLoaded": throughput_model is not None,
            "failureModelLoaded": failure_model is not None,
        })

    def do_POST(self):
        if self.path != "/predict":
            self._json(404, {"error": "not found"})
            return

        length = int(self.headers.get("content-length", "0"))
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            frame = build_frame(payload)
            predicted_failure_rate = predict_failure(failure_model, frame)
            predicted_throughput = predict_throughput(throughput_model, frame, payload.get("load", 1))

            self._json(200, {
                "status": "success",
                "modelType": {
                    "throughput": type(throughput_model).__name__ if throughput_model else None,
                    "failure": type(failure_model).__name__ if failure_model else None,
                },
                "features": frame.iloc[0].to_dict(),
                "predictedFailureRate": predicted_failure_rate,
                "predictedThroughput": predicted_throughput,
                "risk": "high" if predicted_failure_rate >= 0.2 else "normal",
            })
        except Exception as exc:
            self._json(500, {"status": "error", "error": str(exc)})

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    print(f"Digital twin predictor listening on http://{HOST}:{PORT}")
    print(f"Feature schema: {FEATURE_NAMES}")
    HTTPServer((HOST, PORT), Handler).serve_forever()
