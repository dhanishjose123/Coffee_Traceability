import os
import pandas as pd
import numpy as np

# Define directories
results_dir = r"c:\Users\hp\Desktop\dhanish\fabric_2\results"
throughput_results_dir = os.path.join(results_dir, "throughtput_results")
combined_folder = os.path.join(throughput_results_dir, "combined")

print(f"Results directory: {results_dir}")
print(f"Throughput results directory: {throughput_results_dir}")
print(f"Combined folder: {combined_folder}")

# Create combined folder if it doesn't exist
os.makedirs(combined_folder, exist_ok=True)

# We will collect dataframes
dfs = []

# 1. Load any files in the root of throughtput_results that are inputs
root_input_files = ["../data/throughput_results_all_1.xlsx", "../data/throughput_results_all_2.xlsx", "../data/throughput_results_test.xlsx", "../data/throughput_results_new.xlsx"]
for filename in root_input_files:
    locations = [
        os.path.join(throughput_results_dir, filename),
        os.path.join(combined_folder, filename),
        os.path.join(results_dir, "xboost_general", filename),
        os.path.join(results_dir, filename)
    ]
    filepath = None
    for loc in locations:
        if os.path.exists(loc):
            filepath = loc
            break
            
    if filepath:
        print(f"\nProcessing root input file: {filepath}")
        try:
            xl = pd.ExcelFile(filepath)
            sheet_names = xl.sheet_names
            
            all_sheet = None
            for sheet in sheet_names:
                if sheet.lower() == 'all':
                    all_sheet = sheet
                    break
            
            if all_sheet:
                print(f"    Found '{all_sheet}' sheet. Reading only this sheet.")
                df = xl.parse(all_sheet)
                if 'totalTransactions' in df.columns:
                    df = df.rename(columns={'totalTransactions': 'txno'})
                df['source_file'] = f"root/{filename}/{all_sheet}"
                dfs.append(df)
                print(f"    Loaded {df.shape} from '{all_sheet}' sheet.")
            else:
                print(f"    No 'All' sheet found. Concatenating all sheets: {sheet_names}")
                for sheet in sheet_names:
                    sheet_df = xl.parse(sheet)
                    if 'totalTransactions' in sheet_df.columns:
                        sheet_df = sheet_df.rename(columns={'totalTransactions': 'txno'})
                    sheet_df['source_file'] = f"root/{filename}/{sheet}"
                    dfs.append(sheet_df)
                    print(f"      Loaded {sheet_df.shape} from sheet '{sheet}'")
        except Exception as e:
            print(f"    Error processing root input file {filename}: {e}")

# 2. List subdirectories in throughput_results and process them
subdirs = [d for d in os.listdir(throughput_results_dir) if os.path.isdir(os.path.join(throughput_results_dir, d)) and d != "combined"]
print(f"\nFound subdirectories: {subdirs}")

for subdir in subdirs:
    subdir_path = os.path.join(throughput_results_dir, subdir)
    # Find all Excel files in this subdirectory
    files = [f for f in os.listdir(subdir_path) if f.endswith(('.xlsx', '.xls'))]
    print(f"\nProcessing subdirectory: {subdir}")
    
    for file in files:
        file_path = os.path.join(subdir_path, file)
        print(f"  Reading file: {file}")
        
        try:
            xl = pd.ExcelFile(file_path)
            sheet_names = xl.sheet_names
            
            # Check if there is an 'All' sheet (case-insensitive)
            all_sheet = None
            for sheet in sheet_names:
                if sheet.lower() == 'all':
                    all_sheet = sheet
                    break
            
            if all_sheet:
                print(f"    Found '{all_sheet}' sheet. Reading only this sheet.")
                df = xl.parse(all_sheet)
                if 'totalTransactions' in df.columns:
                    df = df.rename(columns={'totalTransactions': 'txno'})
                df['source_file'] = f"{subdir}/{file}/{all_sheet}"
                dfs.append(df)
                print(f"    Loaded {df.shape} from '{all_sheet}' sheet.")
            else:
                print(f"    No 'All' sheet found. Concatenating all sheets: {sheet_names}")
                file_dfs = []
                for sheet in sheet_names:
                    sheet_df = xl.parse(sheet)
                    if 'totalTransactions' in sheet_df.columns:
                        sheet_df = sheet_df.rename(columns={'totalTransactions': 'txno'})
                    sheet_df['source_file'] = f"{subdir}/{file}/{sheet}"
                    file_dfs.append(sheet_df)
                    print(f"      Loaded {sheet_df.shape} from sheet '{sheet}'")
                if file_dfs:
                    combined_file_df = pd.concat(file_dfs, ignore_index=True, sort=False)
                    dfs.append(combined_file_df)
                    print(f"    Total loaded from file: {combined_file_df.shape}")
        except Exception as e:
            print(f"    Error processing file {file}: {e}")

if not dfs:
    print("No data loaded. Exiting.")
    exit(1)

# Concatenate all loaded dataframes
combined_df = pd.concat(dfs, ignore_index=True, sort=False)
print(f"\nInitial combined shape: {combined_df.shape}")

# Filter out functions containing 'makeofferall' or 'mvcc' (case-insensitive)
combined_df['function_lower'] = combined_df['function'].astype(str).str.lower()
filter_out_mask = combined_df['function_lower'].str.contains('makeofferall') | combined_df['function_lower'].str.contains('mvcc')
print(f"Removing {filter_out_mask.sum()} rows containing 'makeofferall' or 'mvcc' from the dataset...")
combined_df = combined_df[~filter_out_mask].copy()
combined_df = combined_df.drop(columns=['function_lower'])
print(f"Shape after filtering out makeofferall/mvcc: {combined_df.shape}")

# Remove duplicates
key_cols = ['chaincode', 'folder', 'function', 'round', 'load', 'numFarmers', 'numAggregators', 'numRetailers', 'numConsumers', 'numBankUsers', 'totalParticipants', 'networkLatencyMs']
key_cols = [c for c in key_cols if c in combined_df.columns]
match_cols = key_cols + [c for c in ['txno', 'success', 'failures', 'throughput'] if c in combined_df.columns]
print(f"Dropping duplicates based on columns: {match_cols}")

before_drop = len(combined_df)
combined_df = combined_df.drop_duplicates(subset=match_cols, keep='first')
after_drop = len(combined_df)
print(f"Dropped {before_drop - after_drop} duplicate rows. Remaining: {after_drop}")

# Now apply filter: total txno = success + failures
combined_df['success'] = pd.to_numeric(combined_df['success'], errors='coerce').fillna(0)
combined_df['failures'] = pd.to_numeric(combined_df['failures'], errors='coerce').fillna(0)
combined_df['load'] = pd.to_numeric(combined_df['load'], errors='coerce').fillna(0)
combined_df['sendRate'] = pd.to_numeric(combined_df['sendRate'], errors='coerce').fillna(0)
combined_df['sendRate'] = combined_df['sendRate'].replace([np.inf, -np.inf], 9999999)
combined_df['throughput'] = pd.to_numeric(combined_df['throughput'], errors='coerce').fillna(0)

# Compute computed_txno
combined_df['computed_txno'] = combined_df['success'] + combined_df['failures']

# Compute threshold based on source file:
# For throughput_results_all_1.xlsx, throughput_results_all_2.xlsx, and throughput_results_test.xlsx, threshold = 0.6 * 5 * load
# For other files, threshold = 0.8 * 5 * sendRate
is_new_filtered_file = combined_df['source_file'].astype(str).str.contains('../data/throughput_results_all_1.xlsx|throughput_results_all_2.xlsx|throughput_results_test.xlsx', case=False, na=False)
combined_df['threshold'] = np.where(
    is_new_filtered_file,
    0.6 * 5 * combined_df['load'],
    0.8 * 5 * combined_df['sendRate']
)

# Check how many rows fail the condition or have throughput == 0
low_tx_mask = combined_df['computed_txno'] < combined_df['threshold']
zero_tp_mask = combined_df['throughput'] == 0
filter_mask = low_tx_mask | zero_tp_mask

print(f"Number of rows to omit based on dynamic threshold: {low_tx_mask.sum()}")
print(f"Number of rows to omit based on zero throughput: {zero_tp_mask.sum()}")
print(f"Total rows to omit: {filter_mask.sum()}")

# Keep rows where filter conditions are satisfied
clean_df = combined_df[~filter_mask].copy()
print(f"Cleaned dataset shape: {clean_df.shape}")

# Clean up helper columns from combined_df and clean_df for saving
def clean_cols(df):
    df_temp = df.copy()
    for col in ['source_file', 'computed_txno', 'threshold']:
        if col in df_temp.columns:
            df_temp = df_temp.drop(columns=[col])
    return df_temp

raw_save_df = clean_cols(combined_df)
clean_save_df = clean_cols(clean_df)

# Helper function to save df with category sheets
def save_with_category_sheets(df, path):
    df_temp = df.copy()
    # Get categories
    df_temp['category'] = df_temp['function'].astype(str).apply(lambda x: x.split('_')[0])
    categories = sorted(df_temp['category'].dropna().unique())
    
    with pd.ExcelWriter(path, engine='openpyxl') as writer:
        df_all = df_temp.drop(columns=['category']) if 'category' in df_temp.columns else df_temp
        df_all.to_excel(writer, sheet_name='All', index=False)
        
        for cat in categories:
            df_cat = df_temp[df_temp['category'] == cat]
            df_cat_to_save = df_cat.drop(columns=['category']) if 'category' in df_cat.columns else df_cat
            df_cat_to_save.to_excel(writer, sheet_name=cat, index=False)

# Save raw and filtered to combined folder
print(f"\nSaving raw data to combined folder...")
save_with_category_sheets(raw_save_df, os.path.join(combined_folder, "../data/throughput_raw.xlsx"))

print(f"Saving filtered data to combined folder...")
save_with_category_sheets(clean_save_df, os.path.join(combined_folder, "../data/throughput_filtered.xlsx"))

# Save to existing destinations to avoid breaking downstream scripts
destinations = [
    os.path.join(throughput_results_dir, "../data/throughput_results_all.xlsx"),
    os.path.join(throughput_results_dir, "../data/throughput_combined.xlsx"),
    os.path.join(results_dir, "../data/throughput_results_all.xlsx"),
    os.path.join(results_dir, "xboost", "../data/throughput_results_all.xlsx"),
    os.path.join(results_dir, "xboost_function_wise", "../data/throughput_results_all.xlsx"),
    os.path.join(results_dir, "xboost_general", "../data/throughput_results_all.xlsx")
]

for dest in destinations:
    dest_dir = os.path.dirname(dest)
    if os.path.exists(dest_dir):
        print(f"Saving to Excel: {dest}")
        save_with_category_sheets(clean_save_df, dest)

csv_destinations = [
    os.path.join(results_dir, "../data/throughput_results_all.csv")
]

for dest in csv_destinations:
    dest_dir = os.path.dirname(dest)
    if os.path.exists(dest_dir):
        print(f"Saving to CSV: {dest}")
        clean_save_df.to_csv(dest, index=False)

# ---- Save 0ms Latency Filtered Subset ----
print("\nSaving 0ms latency filtered subset...")
df_0ms = clean_save_df[clean_save_df['networkLatencyMs'] == 0].copy()

excel_0ms_dests = [
    os.path.join(combined_folder, '../data/throughput_filtered_0ms.xlsx'),
    os.path.join(throughput_results_dir, '../data/throughput_filtered_0ms.xlsx'),
    os.path.join(results_dir, '../data/throughput_filtered_0ms.xlsx'),
    os.path.join(results_dir, 'xboost_general', '../data/throughput_latency_0.xlsx'),
    os.path.join(results_dir, 'xboost_general', '../data/throughput_filtered.xlsx')
]

for dest in excel_0ms_dests:
    dest_dir = os.path.dirname(dest)
    if os.path.exists(dest_dir):
        print(f"Saving 0ms Excel to: {dest}")
        save_with_category_sheets(df_0ms, dest)

csv_0ms_dest = os.path.join(results_dir, '../data/throughput_filtered_0ms.csv')
if os.path.exists(os.path.dirname(csv_0ms_dest)):
    print(f"Saving 0ms CSV to: {csv_0ms_dest}")
    df_0ms.to_csv(csv_0ms_dest, index=False)

print("\nDone combining, filtering, and storing raw & filtered datasets!")
