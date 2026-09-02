# Digital Twin Based Transaction Admission Control for Hyperledger Fabric

## Project Idea

This project proposes a digital twin for a Hyperledger Fabric based coffee supply-chain network. The goal is not only to benchmark the network, but to predict transaction failure risk and control transaction submission before failures occur.

The digital twin observes benchmark data, learns the relationship between workload conditions and failures, and then acts as a transaction admission controller.

## Problem

In Hyperledger Fabric, failures such as `MVCC_READ_CONFLICT`, endorsement errors, and timeout failures increase when many concurrent transactions update the same ledger keys.

Examples:

- Many retailers bidding on the same lot in `makeOffer`
- Multiple accept operations touching the same lot or wallet keys in `acceptOffer`
- Multiple consumers trying to buy the same packet in `purchase`
- Wallet transfer updates inside `submitProduce`, `acceptOffer`, and `purchase`

Sending transactions blindly at high TPS can increase failure rate even when the network is still accepting requests.

## Digital Twin Objective

The digital twin predicts:

- Transaction failure probability
- MVCC conflict risk
- Expected throughput
- Expected latency
- Safe transaction load for each function

Then it adjusts transaction submission by queuing, delaying, or rate-limiting risky transactions.

## Why Not Backend HTTP Simulation

Backend API calls are slower than Caliper because they add:

- HTTP overhead
- Express routing
- JSON parsing
- Middleware and CORS
- Wallet lookup
- Gateway connection handling
- Application response serialization

If the digital twin is tested only through backend HTTP calls, the experiment may measure backend bottlenecks instead of Fabric transaction behavior.

Therefore, the better simulation point is inside the Caliper workload or a direct Fabric Gateway load generator.

## Recommended Architecture

```text
Caliper Workload
      |
      v
Digital Twin Scheduler
      |
      v
Fabric Gateway Submit
      |
      v
Hyperledger Fabric Network
```

The Caliper workload still generates high transaction load, but before submitting a transaction, it asks the digital twin scheduler whether to submit immediately or wait.

## Digital Twin Features

Useful input features:

- Function name
- TPS / send rate
- Number of Caliper workers
- Number of farmers
- Number of aggregators
- Number of retailers
- Number of consumers
- Network latency
- Ledger reads
- Ledger writes
- Hot key writes
- Hot participants
- Payload size
- Recent failure rate
- Recent MVCC conflict rate
- Queue length for the same conflict key

Prediction targets:

- Failure rate
- MVCC conflict probability
- Throughput
- Latency
- Safe / risky class

## Queue Keys

Each transaction should be queued based on the ledger keys it may conflict on.

| Function | Suggested Queue Key |
|---|---|
| `submitProduce` | `farmerId:aggregatorId` |
| `testCoffee` | `lotId` or `aggregatorId` |
| `makeOffer` | `lotId` |
| `acceptOffer` | `lotId` |
| `pack` | `retailerId:lotId` |
| `purchase` | `packetId` |

Transactions with the same queue key are likely to touch the same ledger state and should be serialized or slowed down.

## Rule-Based Scheduler First

A simple first version can be rule based:

```js
if (functionName === "makeOffer") {
    queueBy(`lot:${lotId}`);
}

if (functionName === "acceptOffer") {
    queueBy(`lot:${lotId}`);
}

if (functionName === "purchase") {
    queueBy(`packet:${packetId}`);
}

if (recentMvccRate > 0.2) {
    reduceSubmissionRate();
}
```

This can reduce MVCC conflicts even before ML is added.

## ML-Based Scheduler

After collecting benchmark data, train models such as:

- XGBoost regressor for failure rate
- XGBoost regressor for throughput
- XGBoost classifier for safe/risky execution

Example decision:

```js
const risk = model.predict(features);

if (risk < 0.1) {
    submitNow();
} else if (risk < 0.4) {
    delay(200);
} else {
    queueUntilRiskDrops();
}
```

## Caliper Workload Integration

Add a scheduler module, for example:

```text
workload_9_cached/twin-scheduler.js
```

Example scheduler:

```js
const activeKeys = new Set();

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function submit(key, submitFn) {
    while (activeKeys.has(key)) {
        await sleep(10);
    }

    activeKeys.add(key);

    try {
        return await submitFn();
    } finally {
        activeKeys.delete(key);
    }
}

module.exports = { submit };
```

Inside a workload:

```js
const scheduler = require("./twin-scheduler");

const key = `lot:${lotId}`;

if (process.env.TWIN_QUEUE_MODE === "1") {
    await scheduler.submit(key, () => this.sutAdapter.sendRequests(tx));
} else {
    await this.sutAdapter.sendRequests(tx);
}
```

## Experiment Design

Run the same workload twice.

Baseline:

```bash
TWIN_QUEUE_MODE=0 node run.js
```

Digital twin queue:

```bash
TWIN_QUEUE_MODE=1 node run.js
```

Compare:

- Success count
- Failure count
- Failure rate
- MVCC conflict count
- Throughput
- Average latency
- Queue waiting time

## Expected Tradeoff

The digital twin queue should:

- Reduce MVCC failures
- Improve success rate
- Stabilize throughput
- Increase waiting time slightly
- Possibly reduce raw throughput at very high load

This is acceptable because the aim is reliable transaction execution, not only maximum send rate.

## Report Contribution

The main contribution can be stated as:

> This work develops a digital twin based transaction admission controller for a Hyperledger Fabric supply-chain network. The twin predicts transaction failure risk using workload, network, and chaincode complexity features, and dynamically queues transactions to reduce MVCC conflicts and improve successful throughput.

## Suggested Title

Digital Twin Based Failure Prediction and Transaction Admission Control for Hyperledger Fabric Supply Chain Networks

