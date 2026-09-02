import pandas as pd

df = pd.read_excel('throughput_results_all.xlsx')

# Calculate failure rate
df['failure_rate'] = (df['failures'] / df['txno'] * 100).fillna(0).round(1)

# Ensure necessary columns exist
if 'hotParticipants' in df.columns:
    df['hot_key_participants'] = df['hotParticipants']
else:
    df['hot_key_participants'] = df['numCaliperWorkers'] * df['hotKeyWrites']

# Format function names for presentation
df['function_display'] = df['function'].apply(lambda x: str(x).split('_')[0])

# 1. Baseline Table (Latency == 0)
df_0 = df[df['networkLatencyMs'] == 0].copy()

# Select representative rows (e.g., low load, medium load, high load for each major function)
selected_rows_0 = []
for func in ['submitproduce', 'acceptoffer', 'pack']:
    func_df = df_0[df_0['function_display'] == func].sort_values(by='load')
    if len(func_df) > 0:
        selected_rows_0.append(func_df.iloc[0]) # Low load
        selected_rows_0.append(func_df.iloc[len(func_df)//2]) # Med load
        selected_rows_0.append(func_df.iloc[-1]) # High load

df_baseline = pd.DataFrame(selected_rows_0)

cols_to_print = ['function_display', 'numCaliperWorkers', 'hot_key_participants', 'load', 'throughput', 'failure_rate']
print("=== Baseline Table (Latency = 0) ===")
print(df_baseline[cols_to_print].to_string(index=False))

# 2. Latency Table (Latency > 0)
df_lat = df[df['networkLatencyMs'] > 0].copy()
selected_rows_lat = []
for lat in sorted(df_lat['networkLatencyMs'].unique()):
    lat_df = df_lat[(df_lat['networkLatencyMs'] == lat) & (df_lat['function_display'] == 'submitproduce')].sort_values(by='load')
    if len(lat_df) > 0:
        selected_rows_lat.append(lat_df.iloc[0])
        selected_rows_lat.append(lat_df.iloc[-1])

df_latency = pd.DataFrame(selected_rows_lat)
cols_lat = ['function_display', 'networkLatencyMs', 'numCaliperWorkers', 'load', 'throughput', 'failure_rate']
print("\n=== Latency Table (Latency > 0) ===")
if not df_latency.empty:
    print(df_latency[cols_lat].to_string(index=False))
else:
    print("No latency data found.")

