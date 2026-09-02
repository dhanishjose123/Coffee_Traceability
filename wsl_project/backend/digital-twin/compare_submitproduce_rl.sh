#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SIMULATOR="$ROOT_DIR/backend/digital-twin/run_simulation.js"

RUNS="${RUNS:-5}"
MIN_TPS="${MIN_TPS:-1}"
MAX_TPS="${MAX_TPS:-20}"
DURATION_SEC="${DURATION_SEC:-20}"
NUM_USERS="${NUM_USERS:-5}"
MAX_IN_FLIGHT="${MAX_IN_FLIGHT:-10}"

echo "SubmitProduce normal vs RL comparison"
echo "Runs: $RUNS | random TPS range: $MIN_TPS..$MAX_TPS"
echo "Duration per run: ${DURATION_SEC}s | users: $NUM_USERS"
echo ""

if command -v curl >/dev/null 2>&1; then
  if ! curl -fsS http://127.0.0.1:5060/health >/dev/null 2>&1; then
    echo "Warning: RL API is not responding at http://127.0.0.1:5060/health"
    echo "Start it in another terminal for RL scheduling:"
    echo "  cd $ROOT_DIR && python3 backend/digital_twin_RL/rl_environment.py"
    echo ""
  fi
fi

run_one() {
  local mode="$1"
  local tps="$2"
  local rl_enabled="$3"

  echo "=== $mode | submitProduce TPS=$tps ==="
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
    ENABLE_RL_SCHEDULER="$rl_enabled" \
    node "$SIMULATOR"
  )
  echo ""
}

for ((i = 1; i <= RUNS; i++)); do
  tps=$(( RANDOM % (MAX_TPS - MIN_TPS + 1) + MIN_TPS ))
  echo "######## Pair $i/$RUNS: random TPS=$tps ########"
  run_one "NORMAL" "$tps" "false"
  run_one "RL_SCHEDULER" "$tps" "true"
done

echo "Comparison completed."
echo "Simple training CSV: $ROOT_DIR/backend/digital-twin/logs/training-data.csv"
echo "Full run records: $ROOT_DIR/backend/digital-twin/logs/simulation-runs.jsonl"
