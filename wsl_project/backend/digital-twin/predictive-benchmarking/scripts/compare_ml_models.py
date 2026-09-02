import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from xgboost import XGBRegressor

def evaluate_model(model, X_train, y_train, X_test, y_test, name):
    model.fit(X_train, y_train)
    # Clip predictions as before (throughput >= 0, failure rate between 0 and 1)
    y_pred = model.predict(X_test)
    if 'Failure Rate' in name:
        y_pred = y_pred.clip(min=0, max=1)
    else:
        y_pred = y_pred.clip(min=0)
        
    r2 = r2_score(y_test, y_pred)
    mae = mean_absolute_error(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    
    return {'Model': name, 'R2': r2, 'MAE': mae, 'RMSE': rmse}

def main():
    print("Loading data...")
    df = pd.read_excel('../data/C:/Users/hp/Desktop/dhanish/fabric_2/results/combining/throughput_results_all_combined.xlsx')
    
    # Filter for latency <= 100ms
    df = df[df['latency'] <= 100].copy()

    # Clean columns
    for col in ['load', 'numCaliperWorkers', 'hotParticipants', 'ledgerWrites', 'reads', 'payloadBytes', 'latency', 'throughput', 'failureRate']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        else:
            df[col] = 0

    features = ['load', 'hotParticipants', 'latency', 'ledgerWrites', 'reads', 'payloadBytes']

    target_throughput = 'throughput'
    target_failurerate = 'failureRate'

    df = df.dropna(subset=features + [target_throughput, target_failurerate])
    
    X = df[features]
    y_throughput = df[target_throughput]
    y_failurerate = df[target_failurerate]

    X_train, X_test, y_train_tp, y_test_tp, y_train_fr, y_test_fr = train_test_split(
        X, y_throughput, y_failurerate, test_size=0.2, random_state=42)

    rf_tp = RandomForestRegressor(n_estimators=100, random_state=42)
    rf_fr = RandomForestRegressor(n_estimators=100, random_state=42)
    
    lr_tp = LinearRegression()
    lr_fr = LinearRegression()

    results = []

    print("\nTraining and Evaluating Random Forest for Throughput...")
    res_tp = evaluate_model(rf_tp, X_train, y_train_tp, X_test, y_test_tp, 'Random Forest (Throughput)')
    results.append(res_tp)
        
    print("Training and Evaluating Random Forest for Failure Rate...")
    res_fr = evaluate_model(rf_fr, X_train, y_train_fr, X_test, y_test_fr, 'Random Forest (Failure Rate)')
    results.append(res_fr)

    print("\nTraining and Evaluating Linear Regression for Throughput...")
    res_lr_tp = evaluate_model(lr_tp, X_train, y_train_tp, X_test, y_test_tp, 'Linear Regression (Throughput)')
    results.append(res_lr_tp)
        
    print("Training and Evaluating Linear Regression for Failure Rate...")
    res_lr_fr = evaluate_model(lr_fr, X_train, y_train_fr, X_test, y_test_fr, 'Linear Regression (Failure Rate)')
    results.append(res_lr_fr)

    results_df = pd.DataFrame(results)
    
    print("\n--- Model Comparison Summary ---")
    print(results_df.to_string(index=False))

    print("\n--- Random Forest Feature Importances ---")
    df_imp = pd.DataFrame({
        'Feature': features,
        'Throughput_Importance': rf_tp.feature_importances_,
        'FailureRate_Importance': rf_fr.feature_importances_
    })
    
    print("\nThroughput Model Importances:")
    print(df_imp[['Feature', 'Throughput_Importance']].sort_values(by='Throughput_Importance', ascending=False).to_string(index=False))
    
    print("\nFailure Rate Model Importances:")
    print(df_imp[['Feature', 'FailureRate_Importance']].sort_values(by='FailureRate_Importance', ascending=False).to_string(index=False))

    # Save Results and Feature Importances to CSV
    results_filename = '../data/random_forest_comparison_results.csv'
    results_df.to_csv(results_filename, index=False)
    
    importance_filename = '../data/random_forest_feature_importances.csv'
    df_imp.to_csv(importance_filename, index=False)
    
    print(f"\nResults successfully saved to {results_filename}")
    print(f"Feature importances successfully saved to {importance_filename}")

if __name__ == "__main__":
    main()
