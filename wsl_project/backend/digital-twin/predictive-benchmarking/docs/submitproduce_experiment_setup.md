# SubmitProduce Caliper Experiment Setup

This experiment varies the number of farmers and aggregators used by the `submitProduce` workload in Hyperledger Caliper.

## Workload Matrix

The matrix is generated in `caliper-bench/run.js`.

Current matrix:

```text
f1_a1, f1_a2, ..., f1_a9
f2_a2, f2_a3, ..., f2_a9
...
f9_a9
```

Only one direction is included. For example, `f1_a2` is included, but `f2_a1` is skipped.

Total combinations:

```text
45 workload combinations
```

## Worker Selection

For submitproduce matrix workloads, the Caliper worker count is generated dynamically from the farmer count.

Rule:

```text
workers = farmerCount
```

Examples:

```text
submitproduce_f1_a1 -> 1 worker
submitproduce_f3_a5 -> 3 workers
submitproduce_f7_a8 -> 7 workers
submitproduce_f9_a9 -> 9 workers
```

This logic is in `run.js`:

```js
const submitProduceMatch = String(functionName).match(/^submitproduce_f(\d+)_a(\d+)$/i);
if (submitProduceMatch) {
    const farmerCount = Number(submitProduceMatch[1]);
    return farmerCount;
}
```

## Farmer Selection

Each Caliper worker is assigned to one farmer.

Rule:

```text
farmerIndex = (workerIndex % farmerCount) + 1
```

Example for `submitproduce_f3_a5`:

```text
Worker 0 -> farmers.User1
Worker 1 -> farmers.User2
Worker 2 -> farmers.User3
```

The same worker keeps the same farmer for all transactions in the round.

The selected farmer is also used as the transaction invoker identity.

## Aggregator Selection

Aggregators are selected randomly for every transaction.

Rule:

```text
aggregatorIndex = random integer from 1 to aggregatorCount
```

Example for `submitproduce_f3_a5`:

```text
farmers.User1 can submit to aggregators.User1, User2, User3, User4, or User5
farmers.User2 can submit to aggregators.User1, User2, User3, User4, or User5
farmers.User3 can submit to aggregators.User1, User2, User3, User4, or User5
```

So farmers are deterministic per worker, while aggregators are random per transaction.

## TPS Rounds

`run.js` currently generates multi-round benchmark YAML files by default.

Current TPS levels:

```text
1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 50, 100, 200, 300, 400, 500
```

Each workload gets one benchmark file with all TPS levels inside it.

Example:

```text
benchmark-submitproduce_f3_a5-multi.yaml
```

## Round Duration

The benchmark generator uses duration-based rounds when `txDurationSeconds` is set.

Current value in `run.js`:

```text
txDurationSeconds = 5
```

Generated YAML uses:

```yaml
txDuration: 5
```

This means each TPS level runs for 5 seconds.

## Generated YAML Arguments

For a workload like:

```text
submitproduce_f3_a5
```

the generated benchmark YAML passes:

```yaml
farmerCount: 3
aggregatorCount: 5
```

The workload module then uses these values for farmer and aggregator selection.

## Summary

For `submitproduce_f3_a5`:

```text
Workers: 3
Farmers used: farmers.User1 to farmers.User3
Aggregator candidates: aggregators.User1 to aggregators.User5
Farmer selection: fixed per worker
Aggregator selection: random per transaction
TPS rounds: multi-round in one YAML file
Round duration: 5 seconds per TPS level
```

