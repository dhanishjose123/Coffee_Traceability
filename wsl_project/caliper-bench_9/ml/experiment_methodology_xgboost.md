# Caliper Experiment Methodology and XGBoost Failure Prediction

## Objective

This experiment benchmarks the Coffee supply-chain chaincode under different participant combinations and transaction loads. The extracted Caliper results are then used to train an XGBoost model to predict transaction failures and failure rate.

The main goal is to understand how throughput and failures change when:

- Transaction load increases.
- The number of participating stakeholders changes.
- Different chaincode functions are invoked.
- Function complexity, ledger reads, ledger writes, and hot-key pressure differ.
- Optional network latency, jitter, and packet loss are applied.

## Runtime Setup

The Fabric network is started using `channel-stack.sh`. The benchmark runner is `caliper-bench/run.js`.

Typical setup:

```bash
./channel-stack.sh <channel-name> fresh+deploy+server+start <chaincode-name> <latency-ms> <jitter-ms> <loss-percent> auto <user-count>
```

Example:

```bash
./channel-stack.sh agrochannel31052 fresh+deploy+server+start coffee_9 0 0 0 auto 100
```

Important runtime values from `run.js`:

- Chaincode name: from `CHAINCODE_NAME`, default `coffee_9`.
- Channel name: from `CHANNEL_NAME`.
- Workload folder: selected from chaincode suffix, for example `coffee_9` uses `workload_9`.
- Default transaction duration: `5` seconds.
- `makeofferall` duration: `100` seconds.
- Transaction count per round: `500`.
- Caliper rate control: fixed-rate TPS.
- Multi-round benchmark generation: enabled by default.

## Transaction Loads

Each workload is tested using the following fixed-rate TPS levels:

```text
1, 2, 4, 8, 10, 20, 50, 100, 200, 400, 500
```

For each TPS value, Caliper records:

- Submitted transactions.
- Successful transactions.
- Failed transactions.
- Send rate.
- Maximum, minimum, and average latency.
- Throughput.

## Strategic Participant Matrix

Instead of testing every possible participant pair, the experiment uses strategic participant counts from low to high load:

```text
1, 2, 5, 10, 15, 20, 24
```

The two-dimensional pair matrix is:

```text
(1,1), (1,2), (1,5), (1,10), (1,15), (1,20), (1,24)
(2,2), (2,5), (2,10), (2,15), (2,20), (2,24)
(5,5), (5,10), (5,15), (5,20), (5,24)
(10,10), (10,15), (10,20), (10,24)
(15,15), (15,20), (15,24)
(20,20), (20,24)
(24,24)
```

This avoids duplicate reverse pairs such as `(1,2)` and `(2,1)` while still covering balanced and imbalanced cases.

## Workload Functions

The current full matrix, excluding submitproduce, includes:

- `testcoffee_aN`
- `makeoffer_rN`
- `makeofferall`
- `acceptoffer_fX_rY`
- `pack_rN`

The submitproduce matrix is also defined in `run.js`:

- `submitproduce_fX_aY`

At the time of this setup, submitproduce is excluded from the active benchmark list because it was already run separately.

## Worker Mapping

Caliper workers are generated dynamically based on the workload name.

| Workload | Meaning | Caliper workers |
|---|---|---:|
| `submitproduce_fX_aY` | X farmers submit produce to random aggregators from 1 to Y | X |
| `testcoffee_aN` | N aggregators test lots | N |
| `makeoffer_rN` | N retailers bid concurrently | N |
| `makeofferall` | Bids all available unbid lots | 5 |
| `acceptoffer_fX_rY` | X farmers accept offers from retailer range 1 to Y | X |
| `pack_rN` | N retailers pack accepted lots | N |

For submitproduce, the farmer count controls the number of Caliper workers. The aggregator count controls the random target range used inside the workload.

For example:

```text
submitproduce_f5_a24
```

means:

- 5 Caliper workers are created.
- The workers act as farmers.
- Each farmer can submit to a randomly selected aggregator from `User1` to `User24`.

## Dynamic Caliper Network Generation

For each workload, `run.js` generates a workload-specific Caliper network file:

```text
caliper-bench/generated/caliper-network-<channel>-<function>.yaml
```

The generated network file includes only the required organizations and only the required identity range.

Examples:

| Workload | Required organizations | Identity limit |
|---|---|---:|
| `submitproduce_f5_a24` | Farmers, Aggregators | `User1..User24` |
| `testcoffee_a10` | Aggregators | `User1..User10` |
| `makeoffer_r15` | Retailers | `User1..User15` |
| `acceptoffer_f10_r24` | Farmers, Retailers | `User1..User24` |
| `pack_r20` | Retailers | `User1..User20` |

This prevents unnecessary loading of all identities for small workloads such as `f1_a1`.

## Benchmark File Generation

For every workload, `run.js` calls `generatebench.js` to create a benchmark YAML file under:

```text
caliper-bench/benchmarks
```

With multi-round mode enabled, a single benchmark file contains all TPS rounds for that workload.

Example:

```text
benchmark-submitproduce_f5_a24-multi.yaml
```

Each round contains:

- Workload module path.
- Contract ID.
- Channel name.
- Participant arguments such as `farmerCount`, `aggregatorCount`, or `retailerCount`.
- Fixed-rate TPS value.
- Transaction duration.

## Log Structure

Logs are grouped by chaincode suffix and benchmark mode.

For `coffee_9`:

```text
caliper-bench/logs_9/logs_multi
```

If network impairment is enabled, logs are nested under a netem folder:

```text
caliper-bench/logs_9/netem_<latency>ms_<jitter>ms_<loss>pct/logs_multi
```

## Result Extraction

After running Caliper, `extractthroughput.js` parses the logs and writes results to:

```text
caliper-bench/results/throughput_results_all.csv
caliper-bench/results/throughput_results_all.xlsx
caliper-bench/results/throughput_results_by_function.xlsx
```

The same result files are copied to:

```text
/mnt/c/Users/hp/Desktop/dhanish/fabric_2/results
```

The extracted columns include:

```text
chaincode
folder
function
round
load
numFarmers
numAggregators
numRetailers
numConsumers
numBankUsers
totalParticipants
networkLatencyMs
networkJitterMs
packetLossPercent
txno
success
failures
dummyTransactions
packetsLoaded
packetsCreated
hotKeyWrites
hotKeyWritesXParticipants
totalWrites
totalReads
sendRate
maxLatency
minLatency
avgLatency
throughput
```

`txno` is calculated as:

```text
txno = success + failures
```

For the pack workload, the number of packets created per invocation is logged and extracted into `packetsCreated`.

## XGBoost Failure Prediction

The extracted throughput file is used as the machine-learning dataset.

XGBoost is suitable because transaction failure is affected by nonlinear interactions between:

- TPS load.
- Number of participants.
- Function type.
- Ledger reads and writes.
- Hot-key writes.
- Network latency, jitter, and packet loss.
- Packet count or lot count.

Recommended prediction targets:

| Target | Model type | Meaning |
|---|---|---|
| `failureOccurred = failures > 0` | `XGBClassifier` | Predict whether a round will fail |
| `failures` | `XGBRegressor` | Predict number of failed transactions |
| `failureRate = failures / txno` | `XGBRegressor` | Predict fraction of failed transactions |

Recommended input features:

```text
load
function
numFarmers
numAggregators
numRetailers
numConsumers
numBankUsers
totalParticipants
networkLatencyMs
networkJitterMs
packetLossPercent
packetsLoaded
packetsCreated
hotKeyWrites
hotKeyWritesXParticipants
totalWrites
totalReads
avgLatency
sendRate
```

The `function` column should be encoded categorically, for example using one-hot encoding.

## Training Workflow

1. Run Fabric and backend using `channel-stack.sh`.
2. Run Caliper using `node run.js`.
3. Extract results using:

```bash
cd /home/dhanish/fabric_2/caliper-bench
node extractthroughput.js
```

4. Load `throughput_results_all.csv` or `throughput_results_all.xlsx`.
5. Create the target column:

```text
failureOccurred = 1 if failures > 0 else 0
failureRate = failures / txno
```

6. Train XGBoost:

- Use `XGBClassifier` for failure/no-failure prediction.
- Use `XGBRegressor` for failure count or failure-rate prediction.

7. Evaluate:

- Classification: accuracy, precision, recall, F1-score, ROC-AUC.
- Regression: MAE, RMSE, R2.

8. Use feature importance or SHAP values to explain which parameters most influence failures.

## Report Usage

In the report, this experiment can be described as a controlled performance and failure-prediction study. Caliper provides the observed transaction behavior, while XGBoost learns the relationship between transaction load, participant count, chaincode function complexity, network conditions, and observed failures.

The main experimental variables are:

- TPS load.
- Function name.
- Farmer, aggregator, retailer, consumer, and bank participant counts.
- Ledger read/write complexity.
- Hot-key write pressure.
- Network impairment settings.

The main measured outcomes are:

- Throughput.
- Latency.
- Success count.
- Failure count.
- Failure rate.

The trained XGBoost model can be used to predict whether a planned workload configuration is likely to fail before running the full blockchain benchmark.
