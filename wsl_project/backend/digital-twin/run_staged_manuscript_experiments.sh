#!/usr/bin/env bash
set -euo pipefail

STAGES=(${STAGES:-submitProduce testCoffee makeOffer})
TARGET_TPS="${TARGET_TPS:-20}"
SETUP_TPS="${SETUP_TPS:-5}"
DURATION_SEC="${DURATION_SEC:-20}"

cd "$(dirname "$0")"

echo "=== Staged digital twin experiments ==="
echo "Stages: ${STAGES[*]}"
echo "TARGET_TPS=${TARGET_TPS}"
echo "SETUP_TPS=${SETUP_TPS}"
echo "DURATION_SEC=${DURATION_SEC}"
echo

echo "============================================================"
echo "Phase 1: conflict identification for all selected functions"
echo "============================================================"

for function_name in "${STAGES[@]}"; do
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
echo "=== Exporting conflict keys after identification phase ==="
node identify_conflict_keys.js

echo
echo "=== Updating tables after conflict identification ==="
node summarize_experiment_results.js

echo
echo "============================================================"
echo "Phase 2: queued scheduling comparison by function"
echo "============================================================"

for function_name in "${STAGES[@]}"; do
  echo
  echo "--- Queued comparison test: ${function_name} ---"
  TARGET_FUNCTION="${function_name}" \
  EXPERIMENT_MODE=queue \
  TARGET_TPS="${TARGET_TPS}" \
  SETUP_TPS="${SETUP_TPS}" \
  DURATION_SEC="${DURATION_SEC}" \
  node run_function_experiment.js

  echo
  echo "--- Updating result tables after ${function_name} comparison ---"
  node summarize_experiment_results.js

  echo
  echo "Comparison for ${function_name} completed."
done

echo
echo "All staged experiments completed."
echo "CSV/Markdown tables are in logs/tables/."
echo "Run export_results_excel.ps1 to create/update the Excel workbook."
