# Digital Twin Simulators

This folder contains the Hyperledger Fabric digital twin simulators for the agricultural supply-chain network.

The current design uses separate entry points for each stage:

- `run_conflict_key_detection.js`
- `identify_conflict_keys.js`
- `run_queued_simulation.js`
- `run_function_experiment.js`
- `run_rl_simulation.js` optional RL experiment

Both scripts use the same simulation engine:

- `run_simulation.js`

## Purpose

The digital twin has two stages.

1. Detect MVCC-prone conflict keys.
2. Queue only transactions that touch active learned conflict keys.

Conflict keys are identified from transaction inputs and internal subfunction inputs. If an internal helper such as `_transfer(fromWallet, toWallet, amount)` touches extra wallet keys, those wallet participants are included unless they are already present in the main function arguments. Duplicate keys are ignored.

For example:

```text
submitProduce(User1 -> User3)
```

creates candidate conflict keys:

```text
submitProduce:participant:farmers/User1
submitProduce:participant:aggregators/User3
```

If consecutive transactions share a key and the later transaction fails, that key is learned as MVCC-prone.

Learned participant keys are generalized by argument role. For example, a concrete failure on `participant:farmers/User1` is exported as `participant:farmers`, so the queued scheduler can apply the finding to any farmer argument in that function.

The current default conflict-key matrix is:

```text
submitProduce:
  farmer
  aggregator
  because _transfer(farmers.farmerId, aggregators.aggregatorId, fee)

testCoffee:
  lot
  no wallet-transfer subfunction

makeOffer:
  lot
  retailer
  because the retailer wallet is read for balance validation

acceptOffer:
  lot
  retailer
  farmer
  because _transfer(retailers.selectedRetailerId, farmers.lot.farmerId, amount)

packLotIntoPackets:
  lot
  no wallet-transfer subfunction

purchasePacket:
  packet
  consumer
  retailer
  because _transfer(consumers.customerId, retailers.packet.owner, price)
```

## 1. Conflict-Key Detection Simulator

For manuscript experiments, use `run_function_experiment.js` to identify conflict keys one function at a time. In `detect` mode it now uses existing ledger assets by default instead of running all previous functions.

```bash
cd ~/fabric_2/backend/digital-twin
TARGET_FUNCTION=submitProduce EXPERIMENT_MODE=detect TARGET_TPS=20 node run_function_experiment.js
TARGET_FUNCTION=testCoffee EXPERIMENT_MODE=detect TARGET_TPS=20 node run_function_experiment.js
TARGET_FUNCTION=makeOffer EXPERIMENT_MODE=detect TARGET_TPS=20 node run_function_experiment.js
TARGET_FUNCTION=acceptOffer EXPERIMENT_MODE=detect TARGET_TPS=20 node run_function_experiment.js
TARGET_FUNCTION=packLotIntoPackets EXPERIMENT_MODE=detect TARGET_TPS=20 node run_function_experiment.js
TARGET_FUNCTION=purchasePacket EXPERIMENT_MODE=detect TARGET_TPS=20 node run_function_experiment.js
```

To test consumer wallet conflict for purchase, force consecutive purchase attempts through the same consumer:

```bash
FIXED_PURCHASE_CONSUMER=User2 TARGET_FUNCTION=purchasePacket EXPERIMENT_MODE=detect TARGET_TPS=20 node run_function_experiment.js
```

In `detect` mode, `run_function_experiment.js` enables:

```text
PAIRWISE_DETECTION=true
FORCE_SHARED_CONFLICT_KEYS=true
```

This means the detector submits two transactions at a time and deliberately makes the pair share the key under test. The shared role is controlled by:

```text
DETECTION_SHARED_KEY
```

Examples:

```bash
TARGET_FUNCTIONS=testCoffee DETECTION_SHARED_KEY=lot node identify_conflict_keys.js
TARGET_FUNCTIONS=purchasePacket DETECTION_SHARED_KEY=retailer node identify_conflict_keys.js
TARGET_FUNCTIONS=submitProduce DETECTION_SHARED_KEY=farmer node identify_conflict_keys.js
```

For `purchasePacket` with `DETECTION_SHARED_KEY=retailer`, the simulator selects different packets owned by the same retailer when possible and lets consumers vary. This isolates the retailer wallet key from the packet and consumer keys.

If `DETECTION_SHARED_KEY` is not provided, `identify_conflict_keys.js` sweeps the default matrix above, running one experiment for each function/key pair.

For large ledgers, `run_function_experiment.js` sets `VERIFY_COMMIT_BY_QUERY=false` by default. This avoids full `getAllProduce` verification queries that can exceed the gRPC response limit.

Existing asset requirements:

```text
testCoffee        uses existing SUBMITTED lots
makeOffer           uses existing APPROVED lots
acceptOffer         uses existing APPROVED lots that already have an offer
packLotIntoPackets  uses existing SOLD or ACCEPTED lots
purchasePacket      uses existing AVAILABLE, PACKED, or FOR_SALE packets
```

So for `purchasePacket`, create packets separately first, then run only `purchasePacket` detection. The simulator selects purchasable packets from the ledger and keeps packet IDs only in memory for that run. If no packets with status `AVAILABLE`, `PACKED`, or `FOR_SALE` are found, the simulator reports that no purchase workload can start.

To use the old setup-chain behavior, disable existing assets:

```bash
USE_EXISTING_ASSETS=false TARGET_FUNCTION=purchasePacket EXPERIMENT_MODE=detect TARGET_TPS=20 node run_function_experiment.js
```

Run this first:

```bash
cd ~/fabric_2/backend/digital-twin
node run_conflict_key_detection.js
```

This mode disables RL and scheduling:

```text
ENABLE_RL_SCHEDULER=false
ENABLE_WALLET_QUEUE=false
LOAD_LEARNED_CONFLICT_KEYS=false
ENABLE_CONFLICT_KEY_LEARNING=true
```

The goal is only to observe transaction outcomes and learn conflict keys.

The dashboard shows:

```text
Recently identified conflict keys
Learned MVCC-prone conflict keys
```

Learned keys are saved in:

```text
backend/digital-twin/logs/simulation-runs.jsonl
```

Export the learned keys to a dedicated conflict-key file:

```bash
node identify_conflict_keys.js
```

To detect one function only:

```bash
TARGET_FUNCTIONS=testCoffee node identify_conflict_keys.js
```

By default, this replaces old exported keys for the selected function while preserving keys for other functions. This is useful after correcting a function's conflict-key model. To disable replacement and export only the latest run window, use:

```bash
REPLACE_FUNCTION_KEYS=false TARGET_FUNCTIONS=testCoffee node identify_conflict_keys.js
```

To choose the duration and TPS from the identification script:

```bash
DETECTION_TARGET_TPS=20 DETECTION_DURATION_SEC=30 node identify_conflict_keys.js
```

The exported keys are saved in:

```text
backend/digital-twin/logs/conflict-keys.json
```

## 2. Deterministic Queued Simulator

Run this after conflict-key detection and export:

```bash
cd ~/fabric_2/backend/digital-twin
node run_queued_simulation.js
```

By default, `run_queued_simulation.js` runs a TPS sweep for the selected function list:

```text
50 TPS
100 TPS
200 TPS
```

The selected functions are executed one by one. The default order is:

```text
submitProduce
testCoffee
makeOffer
acceptOffer
packLotIntoPackets
purchasePacket
```

For each function, the script runs all TPS values before moving to the next function.

The default values are controlled inside the script:

```js
const DEFAULT_TPS_VALUES = [50, 100, 200];
const DEFAULT_TARGET_FUNCTIONS = [
  'submitProduce',
  'testCoffee',
  'makeOffer',
  'acceptOffer',
  'packLotIntoPackets',
  'purchasePacket'
];
```

You can also override them from the terminal:

```bash
TPS_VALUES=50,100,200 TARGET_FUNCTIONS=submitProduce node run_queued_simulation.js
TPS_VALUES=50,100,200 TARGET_FUNCTIONS=makeOffer node run_queued_simulation.js
TPS_VALUES=50,100,200 TARGET_FUNCTIONS=testCoffee,makeOffer node run_queued_simulation.js
```

This mode does not use RL:

```text
ENABLE_RL_SCHEDULER=false
ENABLE_WALLET_QUEUE=true
LOAD_LEARNED_CONFLICT_KEYS=true
ENABLE_CONFLICT_KEY_LEARNING=false
USE_EXISTING_ASSETS=true
```

It loads `logs/conflict-keys.json`, checks whether a transaction touches a learned key, and queues only when that key is currently active in another in-flight transaction.

Queue locks are concrete and cross-function. For example, if `makeOffer` and `purchasePacket` both touch `participant:retailers/User1`, the second transaction waits even though the functions are different. Different concrete keys, such as `participant:retailers/User2`, can still run in parallel.

For `makeOffer`, queued simulation now forces all makeOffer transactions to use the same approved lot during the run:

```text
MAKE_OFFER_SAME_LOT=true
```

This is enabled automatically by `run_queued_simulation.js`. It is useful for manuscript experiments because the `makeOffer` conflict key is the lot state, especially the highest-offer state. The bid value is calculated after the transaction gets the queue lock, using `MAKE_OFFER_PRICE_GAP`, so consecutive offers are different bids on the same lot without using a stale pre-queue price.

Because `makeOffer` needs an existing approved lot, `run_queued_simulation.js` preloads ledger assets by default. If the run still shows `Started: 0`, there are no approved lots available for the selected users on the current channel. Create or approve lots first, then rerun the queued simulation.

The run output prints:

```text
makeOffer lot selection: same approved lot
```

To compare no-queue and queued digital twin runs with the same settings:

```bash
cd ~/fabric_2/backend/digital-twin
FUNCTIONS="submitProduce testCoffee makeOffer" TARGET_TPS=20 DURATION_SEC=20 bash run_comparison_tests.sh
```

This runs each function twice:

```text
baseline  no queue
queue     learned conflict-key queue enabled
```

## Optional RL Scheduling Simulator

Start the RL server:

```bash
cd ~/fabric_2/backend/digital_twin_RL
python3 rl_environment.py
```

Then run the RL simulator in another terminal:

```bash
cd ~/fabric_2/backend/digital-twin
node run_rl_simulation.js
```

This mode enables RL and loads the learned conflict keys:

```text
ENABLE_RL_SCHEDULER=true
ENABLE_WALLET_QUEUE=true
LOAD_LEARNED_CONFLICT_KEYS=true
ENABLE_CONFLICT_KEY_LEARNING=false
```

The RL state includes:

```text
functionName
tps
hasActiveConflictKey
hasLearnedConflictKey
```

The RL actions are:

```text
submit_now
queue_conflict_key
```

If RL chooses `queue_conflict_key`, the simulator waits until the learned conflict key is no longer active before submitting the transaction.

## Reward

The RL reward uses only completed throughput and failure rate.

Formula:

```text
reward = (completedTps / targetThroughput) * throughputReward
         - failureRate * failurePenalty
```

Reward logic:

```text
backend/digital_twin_RL/reward.py
```

RL config:

```text
backend/digital_twin_RL/config.json
```

## Main Files

```text
run_simulation.js              Shared simulator engine
run_conflict_key_detection.js  Pairwise MVCC conflict-key detection entry point
identify_conflict_keys.js      Exports learned conflict keys to logs/conflict-keys.json
run_queued_simulation.js       Deterministic queued scheduling entry point
run_function_experiment.js     Per-function detect/queue runner
run_manuscript_experiments.sh  Runs all baseline and queued manuscript experiments
run_conflict_identification_all.sh Runs pairwise no-scheduling conflict identification one function at a time
run_comparison_tests.sh        Runs queued scheduling comparison tests for selected functions
run_staged_manuscript_experiments.sh Runs identification first, then comparison tests
summarize_experiment_results.js Builds CSV/Markdown result tables
run_rl_simulation.js           Optional RL scheduling entry point
RL_SETUP.md                    Detailed RL setup notes
logs/simulation-runs.jsonl     Run history and learned conflict keys
logs/conflict-keys.json        Exported conflict-key file used by queue/RL runs
logs/training-data.csv         Summary rows: functionName, TPS, success, failure
logs/tables/                   Generated manuscript result tables
```

## TPS

TPS is configured by environment variables. The deterministic queued simulator does not let RL change TPS.

Example:

```bash
TARGET_FUNCTIONS=submitProduce TPS_VALUES=50,100,200 node run_queued_simulation.js
```

Useful TPS variables:

```text
SUBMIT_TPS
TEST_TPS
MAKE_OFFER_TPS
ACCEPT_TPS
PACK_TPS
PURCHASE_TPS
```

When using `run_queued_simulation.js`, prefer:

```text
TARGET_FUNCTIONS   selected function or comma-separated functions
TPS_VALUES         comma-separated TPS sweep values
TARGET_TPS         single TPS value for one run inside the sweep
```

For submitProduce-only experiments:

```bash
TARGET_FUNCTIONS=submitProduce TPS_VALUES=50,100,200 node run_queued_simulation.js
```

For makeOffer same-lot experiments:

```bash
TARGET_FUNCTIONS=makeOffer TPS_VALUES=50,100,200 node run_queued_simulation.js
```

## Fixed Transaction Count

`run_queued_simulation.js` now has an editable default transaction count:

```text
const DEFAULT_TARGET_TX_COUNT = 500;
```

Set it to `0` to use duration mode:

```text
DURATION_SEC=20
```

With the default fixed count, each TPS value runs until 500 transactions have started, then waits until all of them complete. In the queued script, strict completion is enabled by:

```text
MAX_DRAIN_SEC=0
NO_WORK_TIMEOUT_SEC=0
```

Therefore, a completed fixed-count run should satisfy:

```text
Started = 500
Success + Failure = 500
In flight = 0
```

You can still override the count from the terminal:

```bash
TARGET_TX_COUNT=100 TARGET_FUNCTIONS=makeOffer TPS_VALUES=50,100,200 node run_queued_simulation.js
```

In this mode, each TPS value runs until `TARGET_TX_COUNT` transactions have started, then the simulator enters the draining phase and waits for all in-flight transactions to finish before reading wallets and writing metrics.

If the target cannot be reached because no runnable assets remain, for example `purchasePacket` runs out of available packets, the simulator stops after:

```text
NO_WORK_TIMEOUT_SEC=30
```

and saves the partial run with a stop reason.

`NUM_TRANSACTIONS` is also accepted as an alias:

```bash
NUM_TRANSACTIONS=100 TARGET_FUNCTIONS=submitProduce TPS_VALUES=50 node run_queued_simulation.js
```

## Useful Runtime Variables

```text
DURATION_SEC                 Default run duration
TARGET_TX_COUNT             Fixed number of transactions to submit before draining
NUM_TRANSACTIONS            Alias for TARGET_TX_COUNT
NO_WORK_TIMEOUT_SEC         Stop fixed-count runs when no runnable work remains
NUM_USERS                    Number of users per stakeholder type
MAX_IN_FLIGHT                Local in-flight transaction limit
PAIRWISE_DETECTION           In detect mode, run exactly two transactions, then wait for both to finish
MAX_DRAIN_SEC                Max drain time after load window
COMMIT_VERIFY_TIMEOUT_MS     Ledger-query commit verification timeout
CAPACITY_WAIT_MS             Wait time before skipping when in-flight is full
ENABLE_RL_SCHEDULER          Enable RL decision layer
ENABLE_WALLET_QUEUE          Enable queue mechanism
LOAD_LEARNED_CONFLICT_KEYS   Load learned conflict keys from previous run history
ENABLE_CONFLICT_KEY_LEARNING Learn new conflict keys during this run
MAKE_OFFER_SAME_LOT          Reuse one approved lot for all makeOffer transactions
TPS_VALUES                   TPS sweep values for run_queued_simulation.js
TARGET_FUNCTIONS             Function list for run_queued_simulation.js
```

## Recommended Workflow

For manuscript-specific instructions, see:

```text
manuscript_digital_twin/README.md
```

Run detection:

```bash
cd ~/fabric_2/backend/digital-twin
node run_conflict_key_detection.js
```

Check dashboard for:

```text
Learned MVCC-prone conflict keys
```

Export keys:

```bash
node identify_conflict_keys.js
```

Run deterministic queued scheduling:

```bash
node run_queued_simulation.js
```

Run queued scheduling for makeOffer on the same lot:

```bash
TARGET_FUNCTIONS=makeOffer TPS_VALUES=50,100,200 node run_queued_simulation.js
```

Optional RL experiment:

```bash
cd ~/fabric_2/backend/digital_twin_RL
python3 rl_environment.py
cd ~/fabric_2/backend/digital-twin
node run_rl_simulation.js
```

Compare:

```text
Completed load
Success
Failed
Queued
Learned MVCC-prone conflict keys
```

## Caliper-Style Metrics

Each simulation run is saved to `logs/simulation-runs.jsonl` and summarized into CSV/Markdown/Excel tables. The main reported metrics are:

```text
targetFunctionTps   configured TPS for the selected function
totalTargetTps      total attempted target TPS across enabled functions
submittedTps        real submitted/tried TPS
achievedTps         completed TPS during the load window
endToEndAchievedTps completed TPS over full wall time, including drain
loadElapsedSec      seconds spent submitting the workload
wallElapsedSec      total run time including queueing, commit, drain, and finalization
drainElapsedSec     wall time after the load window stopped
avgLatencyMs        average observed transaction latency
minLatencyMs        minimum observed transaction latency
maxLatencyMs        maximum observed transaction latency
p95LatencyMs        95th percentile observed transaction latency
success             successful committed/accepted transactions
failure             failed transactions
successRatePct      success percentage
failureRatePct      failure percentage
queued              transactions that waited because a conflict key was active
skipped             transactions skipped because local capacity was full
conflictKeys        learned MVCC-prone keys used by the queued digital twin
```

Regenerate the tables:

```bash
node summarize_experiment_results.js
```

Generate the Excel workbook:

```bash
node export_results_excel.mjs
```

The queued simulator updates the Markdown/CSV tables automatically after each run:

```text
UPDATE_TABLES_AFTER_RUN=true
```

So after a `run_queued_simulation.js` sweep, check:

```text
logs/tables/queued-simulation-table.md
logs/tables/latest-experiment-results.csv
```

## Notes

The conflict-key detection stage is not RL. It is a deterministic online learner that identifies shared keys associated with failures.

The recommended scheduling stage is also not RL. It is a deterministic queue that serializes only transactions touching active learned conflict keys. The RL stage is optional if you later want to compare a learned action policy.

Detailed RL instructions are in:

```text
RL_SETUP.md
```
