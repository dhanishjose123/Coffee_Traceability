# Digital twin queued-scheduler results (manuscript Table 6 and Figure 5)

## Files

- `digital_twin_queued_tworun_raw.csv`: the 24 runs used in Table 6 (2 runs x 4 functions x 3 load levels).
- `digital_twin_queued_tworun_summary.csv`: mean and standard deviation per function and load (n = 2). These are the values reported in Table 6.
- `digital_twin_queued_all_runs.csv`: every queued-scheduler run recorded, copied unchanged from `fabric_cardamom_throughput_results/digital-twin/digital-twin-throughput-details.csv`.
- `make_fig_baseline_vs_twin.py`: regenerates Figure 5 from `caliper_baseline_multirun_summary.csv` and `digital_twin_queued_tworun_summary.csv`.
- `digital_twin_queued_multirun_raw.csv` / `digital_twin_queued_multirun_summary.csv`: superseded n = 3, cross-deployment selection, kept only for provenance. Not used by the manuscript or by `make_fig_baseline_vs_twin.py` any more.

## How the runs were selected (revised September 2026)

An earlier version of this table averaged the three most recent runs with recorded throughput per function and load level. Two problems with that selection were identified during review:

1. Some of the three selected runs had not completed all 500 requested transactions (for example, one of the three `acceptOffer` runs at 100 TPS completed only 455 of 500). Averaging completed and partial runs together without disclosure is not a valid statistical summary.
2. The selected runs were drawn from two different chaincode deployments and channels (`cardamom_9` on `agrochannel1707`, July 2026, and `coffee_9` on `agrochannel10091`, September 2026). Relabelling one deployment's chaincode field to match the other does not establish that the two deployments are equivalent, so averaging across them was not justified.

The table now uses only runs from a single chaincode deployment -- chaincode `cardamom_9` on channel `agrochannel1707`, recorded 20-21 July 2026 -- so no cross-deployment mixing occurs. Within that deployment, every run with recorded nonzero throughput for a given function and load level is used (completeness of the transaction count is not required, since throughput is already a rate measurement; only runs where throughput was never recorded, i.e. wall time 0 or no transactions executed, are excluded as measurement artefacts, not partial-but-valid runs). Applying this to the full log (`digital_twin_queued_all_runs.csv`) leaves exactly two qualifying runs for each of the four functions (`submitProduce`, `makeOffer`, `acceptOffer`, `purchasePacket`) at each of the three load levels (50, 100, 200 TPS) -- 24 runs in total, n = 2 for every row.

`testCoffee` and `packLotIntoPackets` were not exercised in this deployment at all (their queued-scheduler runs exist only in the later `coffee_9` / `agrochannel10091` deployment), so they are omitted from Table 6 rather than mixed in from a different deployment.

## Limitation

With n = 2 per setting, the reported standard deviations are estimated from a single pairwise difference and should be read as indicative rather than as precise variance estimates. This is smaller than the Caliper baseline's n = 3 runs. This is stated as a limitation in the manuscript.

## Chaincode label (superseded)

The note below describes the earlier, superseded selection and is kept for provenance only. Runs from July 2026 appear as `cardamom_9` in `digital_twin_queued_all_runs.csv`. The same runs, with the same timestamps, are recorded as `coffee_9` in `all-experiment-results.csv`. The `chaincode` column in the old `digital_twin_queued_multirun_raw.csv` used the coffee label, with the original label kept in `chaincode_label_in_source`; the current `digital_twin_queued_tworun_raw.csv` reports the chaincode label as recorded in the source log, with no relabelling.
