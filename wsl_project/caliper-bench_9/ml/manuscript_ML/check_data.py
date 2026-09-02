import pandas as pd
import sys

try:
    df = pd.read_excel('/home/dhanish/fabric_2/caliper-bench_9/ml/manuscript_ML/throughput_results_all.xlsx')
    print("Columns:", df.columns.tolist())
    
    # Filter for packLotIntoPackets and print latency values
    pack_df = df[df['function_display'] == 'pack']
    if pack_df.empty:
        pack_df = df[df['function'] == 'pack']
    print("Latencies found for pack:", pack_df['networkLatencyMs'].unique())
    print("Loads found:", pack_df['load'].unique())
    
except Exception as e:
    print(e)
