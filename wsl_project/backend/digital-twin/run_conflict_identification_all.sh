#!/usr/bin/env bash
set -euo pipefail

FUNCTIONS=(${FUNCTIONS:-submitProduce testCoffee makeOffer acceptOffer packLotIntoPackets purchasePacket})
TARGET_TPS="${TARGET_TPS:-20}"
SETUP_TPS="${SETUP_TPS:-5}"
DURATION_SEC="${DURATION_SEC:-20}"

cd "$(dirname "$0")"

echo "=== Conflict identification for all selected functions ==="
echo "Functions: ${FUNCTIONS[*]}"
echo "TARGET_TPS=${TARGET_TPS}"
echo "SETUP_TPS=${SETUP_TPS}"
echo "DURATION_SEC=${DURATION_SEC}"

for function_name in "${FUNCTIONS[@]}"; do
  echo
  echo "--- Conflict identification: ${function_name} ---"
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
echo "=== Updating result tables ==="
node summarize_experiment_results.js

echo
echo "Conflict identification phase completed."
