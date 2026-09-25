"""Regenerate Figure 5 (baseline Caliper vs queued digital twin at 200 TPS).

Inputs (same folder):
  caliper_baseline_multirun_summary.csv     - Caliper baseline, n = 3 runs
  digital_twin_queued_tworun_summary.csv    - queued digital twin, same-deployment nonzero-throughput runs (n = 2)
Outputs:
  failure_and_throughput_baseline_vs_twin_main.pdf   (right panel: useful committed throughput, linear axis)
  failure_and_throughput_baseline_vs_twin_peerj.pdf  (right panel: completed throughput, log axis)
"""
import csv
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
FUNCS = ["submitProduce", "makeOffer", "acceptOffer", "purchasePacket"]
TPS = 200
BLUE, ORANGE = "#2A78D6", "#EB6834"


def load(name, fcol, tcol, frcol):
    out = {}
    with open(os.path.join(HERE, name), newline="") as fh:
        for r in csv.DictReader(fh):
            if int(float(r["target_tps"])) == TPS:
                out[r["function"]] = (float(r[tcol]), float(r[frcol]))
    return out


base = load("caliper_baseline_multirun_summary.csv", "function", "throughput_mean", "failure_rate_mean_pct")
twin = load("digital_twin_queued_tworun_summary.csv", "function", "throughput_mean", "failure_rate_mean_pct")

b_fail = [base[f][1] for f in FUNCS]
t_fail = [twin[f][1] for f in FUNCS]
b_thr = [base[f][0] for f in FUNCS]
t_thr = [twin[f][0] for f in FUNCS]
b_use = [thr * (1 - fr / 100) for thr, fr in zip(b_thr, b_fail)]
t_use = [thr * (1 - fr / 100) for thr, fr in zip(t_thr, t_fail)]


def draw(right_vals_b, right_vals_t, ylabel, log, fname, family):
    plt.rcParams.update({"font.family": family, "font.size": 9})
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 3.9))
    x = range(len(FUNCS))
    w = 0.36
    for ax, bv, tv, title, yl, fmt in [
        (ax1, b_fail, t_fail, "Failure rate reduction", f"Failure rate (%) at {TPS} TPS target", "{:.1f}"),
        (ax2, right_vals_b, right_vals_t, "Throughput serialisation trade-off", ylabel, "{:.2f}"),
    ]:
        b1 = ax.bar([i - w / 2 for i in x], bv, w, color=BLUE, label="Baseline (Caliper)", edgecolor="white", linewidth=1)
        b2 = ax.bar([i + w / 2 for i in x], tv, w, color=ORANGE, label="Digital twin (queued)", edgecolor="white", linewidth=1)
        for bars, vals, f in [(b1, bv, "{:.1f}"), (b2, tv, fmt)]:
            for rect, v in zip(bars, vals):
                y = rect.get_height()
                ax.annotate(f.format(v), (rect.get_x() + rect.get_width() / 2, y),
                            xytext=(0, 3), textcoords="offset points", ha="center", va="bottom", fontsize=8)
        ax.set_xticks(list(x))
        ax.set_xticklabels(FUNCS)
        ax.set_title(title, fontsize=10)
        ax.set_ylabel(yl)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.grid(axis="y", color="#e5e5e5", linewidth=0.6)
        ax.set_axisbelow(True)
    ax1.set_ylim(0, 100)
    if log:
        ax2.set_yscale("log")
        ax2.set_ylim(0.2, 400)
    else:
        ax2.set_ylim(0, max(right_vals_b) * 1.15)
    h, l = ax1.get_legend_handles_labels()
    fig.legend(h, l, loc="upper center", ncol=2, frameon=False, bbox_to_anchor=(0.5, 1.02))
    fig.tight_layout(rect=(0, 0, 1, 0.93))
    fig.savefig(os.path.join(HERE, fname), bbox_inches="tight")
    plt.close(fig)


draw(b_use, t_use, f"Useful committed throughput (TPS)", False,
     "failure_and_throughput_baseline_vs_twin_main.pdf", "serif")
draw(b_thr, t_thr, f"Throughput (TPS, log scale) at {TPS} TPS target", True,
     "failure_and_throughput_baseline_vs_twin_peerj.pdf", "serif")
print("baseline useful:", [round(v, 1) for v in b_use])
print("twin:", [round(v, 2) for v in t_thr])
