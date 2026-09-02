# Fabric Coffee Benchmarking Project

This workspace contains the Hyperledger Fabric coffee traceability network, Caliper benchmark suites, backend utilities, frontend code, and analysis outputs used to study transaction throughput, latency, and failure behavior under different participant counts and network delays.

## Project Goals

- Benchmark a multi-organization Hyperledger Fabric supply-chain workflow.
- Measure throughput, latency, failure rate, MVCC conflicts, and hot-key contention.
- Compare normal and alternate Caliper worker designs.
- Generate datasets for machine-learning and digital-twin models that predict failures and guide transaction queuing.
- Support manuscript figures, result workbooks, and experiment documentation.

## Main Folders

- `fabric-test/` - Hyperledger Fabric test-network source and chaincode deployment base.
- `channel-stack.sh` - Main helper for channel lifecycle, chaincode deployment, and network latency/netem control.
- `backend/` - Express/Fabric backend, query/count utilities, digital-twin simulator, wallet identities, and connection profiles.
- `frontend/` - Web frontend for the traceability application.
- `caliper-bench_9/` - Main Caliper benchmark workspace for `coffee_9`.
- `caliper-bench_11/` - Caliper benchmark workspace for `coffee_11`.
- `caliper-bench_10/` - Older/alternate Caliper workspace for `coffee_10`.
- `traceability-coffee/` - Packaged project copy containing app, backend, experiments, and Fabric pieces.
- `scripts/` - Supporting scripts.
- `DIGITAL_TWIN_TRANSACTION_QUEUE_PROJECT.md` - Design notes for the digital-twin transaction queue.

## Fabric Network

The benchmarked network includes supply-chain organizations such as:

- Farmers
- Aggregators
- Retailers
- Consumers
- Bank

Typical channel and chaincode operations are handled through:

```bash
./channel-stack.sh <channel-name> <command>
```

Network latency experiments use the same helper with `netem` commands. Always verify active latency before interpreting latency-sensitive benchmark results.

## Backend

The backend folder contains the active Fabric API server and supporting query scripts.

Important files:

- `backend/server.js` - Express backend server.
- `backend/getContract.js` - Shared Fabric gateway helper.
- `backend/run_simulation.js` - Digital-twin/live transaction simulation helper.
- `backend/count-lot-statuses.js` - Lot status summary script.
- `backend/count-packet-statuses.js` - Packet ownership/status summary script.
- `backend/connections/` - Fabric connection profiles.
- `backend/wallet/` - Local Fabric identities.

Archived debug and setup scripts are stored under:

```text
backend/archived-scripts/
```

## Caliper Benchmark Workspaces

### `caliper-bench_9`

This is the main experimental benchmark folder for `coffee_9`.

Important runner files:

- `run.js` - Main benchmark runner.
- `run-latency-preload-matrix.js` - Normal preload latency matrix.
- `run-alternate.js` - Alternate benchmark runner.
- `run-latency-preload-matrix-alternate.js` - Alternate 5-worker preload matrix.
- `run-latency-preload-matrix-alternate-core.js` - Shared alternate runner core.

Runner notes are documented in:

```text
caliper-bench_9/README_RUNNERS.md
```

Common folders:

- `workload_9/` - Original workload modules.
- `workload_9_cached/` - Preload/cache-oriented workload modules.
- `workload_9_cache_5/` - Alternate 5-worker workload/logging setup.
- `benchmarks/` - Generated Caliper benchmark YAML files.
- `generated/` - Generated Caliper network and connection files.
- `logs_9_cache_5/`, `logs_9/`, `logs_11/` - Benchmark logs.
- `results/` - Extracted throughput, missing-combination, and manuscript data.
- `ml/` - ML/manuscript-related analysis.

### `caliper-bench_11`

Benchmark folder for `coffee_11`.

Important runner files:

- `run.js`
- `run_latency_matrix.js`

Runner notes are documented in:

```text
caliper-bench_11/README_RUNNERS.md
```

## Benchmark Workflow

Typical workflow:

1. Start or restore the Fabric channel and chaincode.
2. Optionally apply network latency using `channel-stack.sh`.
3. Run the selected Caliper matrix.
4. Extract throughput and failure metrics from logs.
5. Regenerate missing-combination and function-presence workbooks.
6. Use the resulting Excel files for plots, ML training, and manuscript tables.

Example Caliper run from `caliper-bench_9`:

```bash
cd /home/dhanish/fabric_2/caliper-bench_9
CHANNEL_NAME=<channel> CHAINCODE_NAME=coffee_9 node run-latency-preload-matrix.js
```

For the alternate 5-worker setup:

```bash
cd /home/dhanish/fabric_2/caliper-bench_9
CHANNEL_NAME=<channel> CHAINCODE_NAME=coffee_9 node run-latency-preload-matrix-alternate.js
```

## Results and Extraction

Result workbooks are mainly under:

```text
caliper-bench_9/results/
```

Common result groups:

- `_1/` - Normal/original worker result set.
- `_5/` - Alternate 5-worker result set.
- `_2/` - Copied/placeholder-augmented result set.
- `combining/` - Combined normal and alternate results.
- `coffee_9/` - Manuscript and curated result archive.

Throughput extraction is handled by:

```bash
cd /home/dhanish/fabric_2/caliper-bench_9
node extractthroughput.js
```

The extractor creates or updates throughput workbooks, latency-specific workbooks, function-presence files, and missing-combination files.

## Digital Twin Direction

The project also supports a digital-twin style controller:

- Use benchmark data to predict throughput and failure probability.
- Estimate hot-key contention and MVCC risk for each transaction type.
- Queue or throttle backend transaction submissions before failure rates become high.
- Simulate real network conditions without relying only on Caliper.

See:

```text
DIGITAL_TWIN_TRANSACTION_QUEUE_PROJECT.md
backend/run_simulation.js
```

## Cleanup Notes

Archived runner files are kept instead of deleted:

- `caliper-bench_9/archived-runners/`
- `caliper-bench_11/archived-runners/`
- `backend/archived-scripts/`

Large generated folders such as `node_modules/`, wallets, logs, and generated benchmark files may be required for immediate reruns, but they are not usually needed in a clean results-only archive.
