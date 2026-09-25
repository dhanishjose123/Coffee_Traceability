# Data behind the manuscript tables and figures

This folder contains the data for "A Blockchain Digital Twin Architecture for Traceable Coffee Supply Chains and MVCC Conflict Mitigation".

| Manuscript item | File(s) in this folder |
|---|---|
| Caliper baseline results (50, 100 and 200 TPS, n = 3 runs) | `caliper_baseline_multirun_raw.csv` (one row per Caliper run) and `caliper_baseline_multirun_summary.csv` (means and standard deviations) |
| Identified conflict keys, with failures and transactions submitted | `conflict-keys.json`, `conflict-keys-table.csv` and the `conflict-identification` rows of `all-experiment-results.csv` |
| Digital twin queued-scheduler results (single deployment, n = 2 runs) | `digital_twin_queued_tworun_raw.csv` (the 24 runs used) and `digital_twin_queued_tworun_summary.csv` (means and standard deviations) |
| All recorded queued-scheduler runs | `digital_twin_queued_all_runs.csv` |
| Figure: baseline versus digital twin at 200 TPS | `make_fig_baseline_vs_twin.py`, which reads the Caliper summary file and `digital_twin_queued_tworun_summary.csv` |

`README_digital_twin_multirun.md` explains how the digital twin runs were selected (same-deployment runs with recorded throughput), and the earlier `multirun` files it supersedes.

To redraw the figure:

```bash
cd data
python3 make_fig_baseline_vs_twin.py
```
