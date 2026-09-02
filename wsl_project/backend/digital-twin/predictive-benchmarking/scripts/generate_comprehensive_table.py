import pandas as pd

df = pd.read_excel('../data/throughput_results_all.xlsx')

df['failure_rate'] = (df['failures'] / df['txno'] * 100).fillna(0).round(1)
df['function_display'] = df['function'].apply(lambda x: str(x).split('_')[0])

def get_hot_keys(row):
    return row['numCaliperWorkers'] * row['hotKeyWrites']

df['hot_key_participants'] = df.apply(get_hot_keys, axis=1)

df_0 = df[(df['networkLatencyMs'] == 0) & (df['function_display'] != 'makeofferall')].copy()

# Select rows for workers 1, 10, 24 at load 500
selected_rows = []
functions = ['submitproduce', 'testcoffee', 'makeoffer', 'acceptoffer', 'pack', 'purchase']
workers = [1, 10, 24]

for func in functions:
    for w in workers:
        func_df = df_0[(df_0['function_display'] == func) & (df_0['numCaliperWorkers'] == w) & (df_0['load'] == 500)]
        if len(func_df) > 0:
            selected_rows.append(func_df.iloc[0])

df_baseline = pd.DataFrame(selected_rows)

cols_to_print = ['function_display', 'numCaliperWorkers', 'hot_key_participants', 'load', 'throughput', 'failure_rate']
print(df_baseline[cols_to_print].to_string(index=False))

# Generate LaTeX table string
latex_str = r"""\begin{table}[ht]
\centering
\caption{Comprehensive Baseline Network Performance Profiles (0ms Latency)}
\label{tab:baseline_performance}
\resizebox{\columnwidth}{!}{%
\begin{tabular}{|l|c|c|c|c|c|}
\hline
\textbf{Function} & \textbf{Caliper Workers} & \textbf{Hot-Keys} & \textbf{Target Load (TPS)} & \textbf{Throughput (TPS)} & \textbf{Failure Rate} \\
\hline
"""

prev_func = ""
for _, row in df_baseline.iterrows():
    f = row['function_display']
    if f != prev_func and prev_func != "":
        latex_str += "\\hline\n"
    prev_func = f
    
    latex_str += f"{f} & {row['numCaliperWorkers']} & {int(row['hot_key_participants'])} & {row['load']} & {row['throughput']} & {row['failure_rate']}\\% \\\\\n"

latex_str += r"""\hline
\end{tabular}%
}
\end{table}"""

print("\n--- LATEX ---")
print(latex_str)
