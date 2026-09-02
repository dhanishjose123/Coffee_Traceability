#!/usr/bin/env bash
set -euo pipefail

FUNCTIONS=(
  submitProduce
  testCoffee
  makeOffer
  acceptOffer
  packLotIntoPackets
  purchasePacket
)

TARGET_TPS="${TARGET_TPS:-20}"
SETUP_TPS="${SETUP_TPS:-5}"
DURATION_SEC="${DURATION_SEC:-20}"

cd "$(dirname "$0")"

echo "=== Digital twin manuscript experiments ==="
echo "TARGET_TPS=${TARGET_TPS}"
echo "SETUP_TPS=${SETUP_TPS}"
echo "DURATION_SEC=${DURATION_SEC}"
echo

echo "=== Phase 1: conflict identification, no scheduling ==="
for function_name in "${FUNCTIONS[@]}"; do
  echo
  echo "--- Detecting conflict keys for ${function_name} ---"
  TARGET_FUNCTION="${function_name}" \
  EXPERIMENT_MODE=detect \
  TARGET_TPS="${TARGET_TPS}" \
  SETUP_TPS="${SETUP_TPS}" \
  DURATION_SEC="${DURATION_SEC}" \
  node run_function_experiment.js
done

echo
echo "=== Exporting learned conflict keys ==="
node identify_conflict_keys.js

echo
echo "=== Phase 2: queued digital twin scheduling ==="
for function_name in "${FUNCTIONS[@]}"; do
  echo
  echo "--- Queued scheduling for ${function_name} ---"
  TARGET_FUNCTION="${function_name}" \
  EXPERIMENT_MODE=queue \
  TARGET_TPS="${TARGET_TPS}" \
  SETUP_TPS="${SETUP_TPS}" \
  DURATION_SEC="${DURATION_SEC}" \
  node run_function_experiment.js
done

echo
echo "=== Writing result tables ==="
node summarize_experiment_results.js

echo
echo "Done. Tables are in logs/tables/."
