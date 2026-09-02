#!/usr/bin/env bash
set -euo pipefail

FUNCTIONS=(${FUNCTIONS:-submitProduce testCoffee makeOffer})
TARGET_TPS="${TARGET_TPS:-20}"
SETUP_TPS="${SETUP_TPS:-5}"
DURATION_SEC="${DURATION_SEC:-20}"

cd "$(dirname "$0")"

echo "=== Queued scheduling comparison tests ==="
echo "Functions: ${FUNCTIONS[*]}"
echo "TARGET_TPS=${TARGET_TPS}"
echo "SETUP_TPS=${SETUP_TPS}"
echo "DURATION_SEC=${DURATION_SEC}"

if [[ ! -f logs/conflict-keys.json ]]; then
  echo "logs/conflict-keys.json not found. Run run_conflict_identification_all.sh first."
  exit 1
fi

for function_name in "${FUNCTIONS[@]}"; do
  echo
  echo "--- No-queue baseline test: ${function_name} ---"
  TARGET_FUNCTION="${function_name}" \
  EXPERIMENT_MODE=baseline \
  TARGET_TPS="${TARGET_TPS}" \
  SETUP_TPS="${SETUP_TPS}" \
  DURATION_SEC="${DURATION_SEC}" \
  node run_function_experiment.js

  echo
  echo "--- Queued comparison test: ${function_name} ---"
  TARGET_FUNCTION="${function_name}" \
  EXPERIMENT_MODE=queue \
  TARGET_TPS="${TARGET_TPS}" \
  SETUP_TPS="${SETUP_TPS}" \
  DURATION_SEC="${DURATION_SEC}" \
  node run_function_experiment.js

  echo
  echo "--- Updating result tables after ${function_name} ---"
  node summarize_experiment_results.js
done

echo
echo "Comparison tests completed."
echo "CSV/Markdown tables are in logs/tables/."
echo "Run export_results_excel.ps1 to create/update the Excel workbook."
