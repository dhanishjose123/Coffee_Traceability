# Digital Twin Review Repository

This repository contains the manuscript, result files, and WSL-side code required to review the study:

**A Digital Twin Framework for Conflict-Key Identification and Transaction Scheduling in Blockchain-Based Agricultural Auctions**

## Folder Structure

- `manuscript/`
  - LaTeX source, bibliography, manuscript PDF, and figure files required to compile the paper.

- `figures/`
  - Standalone copies of the manuscript figures, including the digital-twin conflict-identification and scheduling workflow.

- `data/`
  - Experiment tables, CSV files, Excel workbook, and result summaries used in the manuscript.
  - `data/digital-twin-tables/` contains the exported digital-twin experiment tables from the WSL backend logs.

- `supplementary/`
  - Supporting build files and compiled figure output.

- `wsl_project/`
  - Reproducibility files copied from the WSL Fabric workspace.
  - `wsl_project/backend/` contains the Node.js backend utilities, Fabric connection files, and digital-twin implementation.
  - `wsl_project/backend/digital-twin/` contains the conflict-key detector, queued scheduler, simulation runner, experiment scripts, result exporters, and digital-twin README.
  - `wsl_project/caliper-bench_9/` contains Caliper benchmark runners, workload scripts, experiment matrices, and analysis scripts.
  - `wsl_project/network/` contains the Fabric network, channel, connection, and deployment scripts used in the local WSL environment.

## Main Digital Twin Files

- `wsl_project/backend/digital-twin/run_simulation.js`
  - Core simulator for baseline, conflict-identification, and queued-scheduling modes.

- `wsl_project/backend/digital-twin/identify_conflict_keys.js`
  - Runs or summarizes conflict-key identification experiments and exports learned conflict keys.

- `wsl_project/backend/digital-twin/run_queued_simulation.js`
  - Runs the deterministic queued scheduler using learned conflict keys.

- `wsl_project/backend/digital-twin/summarize_experiment_results.js`
  - Updates CSV, Markdown, and Excel tables from the simulation logs.

- `wsl_project/backend/digital-twin/logs/tables/`
  - Contains the final exported experiment tables and workbook used for the manuscript.

## Compile the Manuscript

Open a terminal in:

```text
Digital_Twin_git/manuscript
```

Then run:

```bash
pdflatex -interaction=nonstopmode manuscript.tex
bibtex manuscript
pdflatex -interaction=nonstopmode manuscript.tex
pdflatex -interaction=nonstopmode manuscript.tex
```

The compiled output is `manuscript.pdf`.

## Reproducing the Digital Twin Experiments

The experiment scripts are intended to be run from the WSL backend digital-twin folder after the Fabric network, channel, wallet identities, and chaincode deployment are available.

Example location in the original WSL workspace:

```bash
cd ~/fabric_2/backend/digital-twin
```

Typical workflow:

```bash
node identify_conflict_keys.js
node run_queued_simulation.js
node summarize_experiment_results.js
```

The scripts write result records and tables under:

```text
backend/digital-twin/logs/
backend/digital-twin/logs/tables/
```

## Dependencies

Node.js dependencies are not bundled. Install them in the relevant copied folders before running scripts:

```bash
npm install
```

The Fabric network must be available separately through the WSL Fabric environment. Connection profiles and deployment helper scripts are included under `wsl_project/network/` and `wsl_project/backend/connections/`.

## Note on Chaincode Source

This package includes the backend, Caliper workloads, network/deployment scripts, Fabric connection files, and all digital-twin experiment code available in the reviewed WSL workspace. If the authored smart-contract source is maintained in a separate chaincode folder outside this workspace, add that folder under `wsl_project/chaincode/` before public release.
