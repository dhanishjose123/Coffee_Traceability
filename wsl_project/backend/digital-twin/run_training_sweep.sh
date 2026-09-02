#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SIMULATOR="$ROOT_DIR/backend/digital-twin/run_simulation.js"

START_TPS="${START_TPS:-1}"
END_TPS="${END_TPS:-20}"
STEP_TPS="${STEP_TPS:-1}"
DURATION_SEC="${DURATION_SEC:-20}"
NUM_USERS="${NUM_USERS:-5}"
MAX_IN_FLIGHT="${MAX_IN_FLIGHT:-10}"

echo "Digital twin training sweep"
echo "TPS: $START_TPS to $END_TPS step $STEP_TPS"
echo "Duration per run: ${DURATION_SEC}s"
echo "Users per stakeholder: $NUM_USERS"
echo ""

for ((tps = START_TPS; tps <= END_TPS; tps += STEP_TPS)); do
  echo "=== Training run: submitProduce TPS=$tps ==="
  (
    cd "$ROOT_DIR"
    DURATION_SEC="$DURATION_SEC" \
    NUM_USERS="$NUM_USERS" \
    SUBMIT_TPS="$tps" \
    TEST_TPS=0 \
    MAKE_OFFER_TPS=0 \
    ACCEPT_TPS=0 \
    PACK_TPS=0 \
    PURCHASE_TPS=0 \
    MAX_IN_FLIGHT="$MAX_IN_FLIGHT" \
    node "$SIMULATOR"
  )
  echo ""
done

echo "Training sweep completed."
echo "Training CSV: $ROOT_DIR/backend/digital-twin/logs/training-data.csv"
echo "Now train RL with:"
echo "  cd $ROOT_DIR && python3 backend/digital_twin_RL/train_from_csv.py"
