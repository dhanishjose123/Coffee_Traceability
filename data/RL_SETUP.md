# Digital Twin Conflict-Key Detection and Queued Scheduling

The recommended setup does not require RL. It uses separate scripts for conflict-key detection, conflict-key export, and deterministic queued scheduling.

1. `run_conflict_key_detection.js`
2. `identify_conflict_keys.js`
3. `run_queued_simulation.js`

The first simulator detects MVCC-prone conflict keys. The export script writes those keys to a separate JSON file. The queued simulator uses that file and queues only later transactions that touch currently active learned keys.

## 1. Conflict-Key Detection

Run this first:

```bash
cd ~/fabric_2/backend/digital-twin
node run_conflict_key_detection.js
```

This mode disables RL and disables scheduling:

```text
ENABLE_RL_SCHEDULER=false
ENABLE_WALLET_QUEUE=false
LOAD_LEARNED_CONFLICT_KEYS=false
```

The purpose is to observe transactions and identify keys that are likely to create MVCC conflicts.

For `submitProduce`, the simulator identifies keys such as:

```text
submitProduce:participant:farmers/User1
submitProduce:participant:aggregators/User3
```

If two consecutive `submitProduce` attempts share a key and the second one fails, that shared key is learned as MVCC-prone.

Example:

```text
Tx1: User1 -> User2
Tx2: User1 -> User3
Tx2 fails
```

Learned key:

```text
submitProduce:participant:farmers/User1
```

The learned keys are saved in:

```text
backend/digital-twin/logs/simulation-runs.jsonl
```

Export them to a dedicated file:

```bash
node identify_conflict_keys.js
```

Output:

```text
backend/digital-twin/logs/conflict-keys.json
```

## 2. Deterministic Queued Scheduling

Run:

```bash
cd ~/fabric_2/backend/digital-twin
node run_queued_simulation.js
```

This mode uses:

```text
ENABLE_RL_SCHEDULER=false
ENABLE_WALLET_QUEUE=true
LOAD_LEARNED_CONFLICT_KEYS=true
```

For each transaction, the simulator checks:

```text
functionName
candidate conflict keys
learned conflict keys
currently active conflict keys
```

If the transaction touches a learned key that is already active, the simulator queues it until the active transaction finishes commit verification.

## 3. Optional RL Scheduling

Start the RL agent server:

```bash
cd ~/fabric_2/backend/digital_twin_RL
python3 rl_environment.py
```

In another terminal, run the RL simulator:

```bash
cd ~/fabric_2/backend/digital-twin
node run_rl_simulation.js
```

This mode enables RL and loads the previously learned conflict keys:

```text
ENABLE_RL_SCHEDULER=true
ENABLE_WALLET_QUEUE=true
LOAD_LEARNED_CONFLICT_KEYS=true
```

For each transaction, the simulator sends this state to the RL agent:

```text
functionName
tps
hasActiveConflictKey
hasLearnedConflictKey
```

The RL agent chooses one action:

```text
submit_now
queue_conflict_key
```

If `queue_conflict_key` is selected, the simulator queues the transaction until the learned conflict key is no longer active.

## 3. Reward

The RL reward uses only completed throughput and failure rate.

Formula:

```text
reward = (completedTps / targetThroughput) * throughputReward
         - failureRate * failurePenalty
```

The reward logic is in:

```text
backend/digital_twin_RL/reward.py
```

The RL action list is in:

```text
backend/digital_twin_RL/config.json
```

## 4. TPS

The deterministic queued scheduler does not directly change the target TPS.

TPS is still controlled by environment variables:

```bash
SUBMIT_TPS=100 node run_queued_simulation.js
```

The scheduler can reduce effective pressure by queuing transactions that touch active learned conflict keys, but the configured target TPS remains fixed.

## 5. RL Actions

Actions are configured in:

```text
backend/digital_twin_RL/config.json
```

Current actions:

```json
[
  "submit_now",
  "queue_conflict_key"
]
```

No fixed delay action is used. RL only decides whether to submit immediately or queue when a learned conflict key is active.

## 6. Recommended Workflow

Run detection:

```bash
cd ~/fabric_2/backend/digital-twin
node run_conflict_key_detection.js
```

Confirm learned keys appear in the dashboard:

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

Optional RL comparison:

```bash
cd ~/fabric_2/backend/digital_twin_RL
python3 rl_environment.py
cd ~/fabric_2/backend/digital-twin
node run_rl_simulation.js
```

Compare normal detection results and RL scheduling results using:

```text
Success
Failure
Completed load
Queued
Learned MVCC-prone conflict keys
```
