# Caliper Bench 9 Layout

This folder keeps active benchmark entrypoints at the root so existing commands continue to work.

## Root

- `run.js`, `run-alternate.js`: main benchmark runners.
- `run-latency-*.js`, `experiment-matrix*.js`, `generatebench*.js`: runner/generator scripts that depend on root-relative paths.
- `caliper-network.yaml`: base Caliper network config.
- `package.json`, `package-lock.json`, `node_modules/`: Node dependencies.

## Workloads

- `workload_9*`, `workload_10`, `workload_modified`, `workload_pre_optim`, `workload_twin`: workload modules used by Caliper.

## Outputs

- `artifacts/data/`: generated CSV/XLSX files from experiments and extraction.
- `artifacts/reports/`: generated HTML/Markdown reports.
- `results/`: structured benchmark result workbooks and extracted result sets.
- `logs_*`: raw run logs.

## Helpers

- `scripts/maintenance/`: one-off patch/fix scripts.
- `api/`: digital-twin API helper code.
- `ml/`: predictive benchmarking / machine-learning work.
- `generated/`: generated benchmark/config files.
- `archived-runners/`: older runner variants.
