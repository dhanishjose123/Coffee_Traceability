import pandas as pd
import numpy as np
import joblib
from sklearn.metrics import r2_score, mean_absolute_error

print("Loading true data from 'xboost' folder...")
df_true = pd.read_excel('xboost/throughput_results_all.xlsx')

print("Loading trained model from 'xboost_1' folder...")
model = joblib.load('xboost_1/general_matrix_model.joblib')

# Clean columns
for col in ['load', 'numFarmers', 'numAggregators', 'numRetailers', 'hotKeyWrites', 'throughput']:
    if col in df_true.columns:
        df_true[col] = pd.to_numeric(df_true[col], errors='coerce')
    else:
        df_true[col] = 0

df_true['category'] = df_true['function'].apply(lambda x: str(x).split('_')[0])

df_true['n_caliper_workers'] = 0
df_true['n_hot_key_participants'] = 0

mask_submit = df_true['category'] == 'submitproduce'
df_true.loc[mask_submit, 'n_caliper_workers'] = df_true.loc[mask_submit, 'numFarmers']
df_true.loc[mask_submit, 'n_hot_key_participants'] = (df_true.loc[mask_submit, 'numFarmers'] + df_true.loc[mask_submit, 'numAggregators']) * df_true.loc[mask_submit, 'hotKeyWrites']

mask_test = df_true['category'] == 'testcoffee'
df_true.loc[mask_test, 'n_caliper_workers'] = df_true.loc[mask_test, 'numAggregators']
df_true.loc[mask_test, 'n_hot_key_participants'] = df_true.loc[mask_test, 'numAggregators'] * df_true.loc[mask_test, 'hotKeyWrites']

mask_make = df_true['category'] == 'makeoffer'
df_true.loc[mask_make, 'n_caliper_workers'] = df_true.loc[mask_make, 'numRetailers']
df_true.loc[mask_make, 'n_hot_key_participants'] = df_true.loc[mask_make, 'numRetailers'] * df_true.loc[mask_make, 'hotKeyWrites']

mask_makeall = df_true['category'] == 'makeofferall'
df_true.loc[mask_makeall, 'n_caliper_workers'] = 5
df_true.loc[mask_makeall, 'n_hot_key_participants'] = 5 * df_true.loc[mask_makeall, 'hotKeyWrites']

df_true = pd.get_dummies(df_true, columns=['category'], prefix='func')

# Ensure all func columns expected by the model are present
model_features = model.feature_names_in_
for col in model_features:
    if col not in df_true.columns:
        df_true[col] = 0

# Drop any missing targets
df_eval = df_true.dropna(subset=list(model_features) + ['throughput']).copy()

print(f"Prepared {len(df_eval)} rows for evaluation.")

X_eval = df_eval[model_features]
y_true = df_eval['throughput']

y_pred = model.predict(X_eval).clip(min=0)

df_eval['predicted_throughput'] = y_pred

print("\n=== Cross-Folder Validation Results ===")
print("R2 Score:", r2_score(y_true, y_pred))
print("MAE:", mean_absolute_error(y_true, y_pred))

df_eval[['function', 'load', 'n_caliper_workers', 'n_hot_key_participants', 'throughput', 'predicted_throughput']].to_excel('xboost/cross_folder_comparison.xlsx', index=False)
print("\nDetailed comparison saved to 'xboost/cross_folder_comparison.xlsx'")
