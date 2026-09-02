# Caliper Bench 9 Runner Files

This folder keeps only the current runner scripts in the root. Older or special-purpose runners have been moved to `archived-runners/`.

## Active runners

- `run.js` - Main benchmark runner used by the normal benchmark pipeline.
- `run-latency-preload-matrix.js` - Normal preload latency matrix runner.
- `run-alternate.js` - Alternate runner used by the 5-worker alternate pipeline.
- `run-latency-preload-matrix-alternate.js` - Alternate preload latency matrix entry point.
- `run-latency-preload-matrix-alternate-core.js` - Shared core used by the alternate preload matrix runner.

## Archived optional runners

Archived at `archived-runners/optional-2026-07-09/`:

- `runretrievalbenchmarks.js`
- `run-latency-preload-50kg.js`
- `run-latency-preload-100kg.js`
- `run-latency-preload-s1-setup.js`

## Older archived runners

Already archived at `archived-runners/`:

- `runall.js`
- `run-workload-10.js`
- `run-latency-custom.js`
- `run-latency-matrix.js`

Move a file back to the root only if that runner is needed again for an experiment.
