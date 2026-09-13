"""
Inference.

Loads the current "production" artifact from the registry and scores one
or more customers. This module NEVER fits/trains anything - it only calls
.transform() and .predict_proba() on objects that were already fit during
training, which is what keeps a normal prediction request cheap and fast
in a real API route.

In the deployed app, the Next.js API route would fetch a customer's raw
event/ticket/transaction rows from Postgres, compute the same feature
aggregations as ml/src/features/build_features.py (via a small TypeScript
port of that logic, or by calling this module as a subprocess/service),
and pass the resulting feature row in here. For this ML-pipeline demo,
`predict_for_customer` pulls the row straight from the already-built
data/processed/feature_matrix.csv to keep the two systems decoupled.

Run with:
    python -m pipeline.predict --customer_id CUS-100000
    python -m pipeline.predict --top_risk 10
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import joblib
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import PulseMLConfig, load_config  # noqa: E402
from explainability.explain import explain_customer  # noqa: E402
from features.definitions import ALL_FEATURE_NAMES  # noqa: E402


def risk_level(probability: float, risk_bands: dict) -> str:
    if probability < risk_bands["low_max"]:
        return "LOW"
    if probability < risk_bands["medium_max"]:
        return "MEDIUM"
    if probability < risk_bands["high_max"]:
        return "HIGH"
    return "CRITICAL"


def load_production_bundle(cfg: PulseMLConfig) -> tuple[dict, dict]:
    registry_path = cfg.paths.resolve("metadata_dir") / "model_registry.json"
    if not registry_path.exists():
        raise FileNotFoundError("No model_registry.json found. Run the full pipeline through `pipeline.register` first.")
    with open(registry_path) as f:
        registry = json.load(f)

    production = [v for v in registry["versions"] if v["status"] == "production"]
    if not production:
        raise RuntimeError("No production model in the registry. Run `python -m pipeline.register --promote`.")
    entry = sorted(production, key=lambda v: v["trained_at"])[-1]

    artifact_dir = cfg.paths.resolve("models_dir").parent.parent / entry["artifact_path"]
    bundle = joblib.load(artifact_dir / "pipeline.joblib")
    with open(artifact_dir / "training_report.json") as f:
        bundle["training_report"] = json.load(f)

    return bundle, entry


def predict_for_customer(cfg: PulseMLConfig, bundle: dict, model_entry: dict, customer_id: str) -> dict:
    feature_matrix = pd.read_csv(cfg.paths.resolve("processed_dir") / "feature_matrix.csv")
    row = feature_matrix[feature_matrix["customer_id"] == customer_id]
    if row.empty:
        raise ValueError(f"customer_id '{customer_id}' not found in the current feature matrix.")

    X = row[ALL_FEATURE_NAMES]
    X_t = bundle["preprocessor"].transform(X)
    probability = float(bundle["calibrated_model"].predict_proba(X_t)[:, 1][0])

    contributors = explain_customer(bundle, row, top_k=cfg.explainability.top_k_contributors)

    return {
        "customer_id": customer_id,
        "churn_probability": round(probability, 4),
        "risk_level": risk_level(probability, model_entry["risk_bands"]),
        "model_id": model_entry["model_id"],
        "model_version": model_entry["version"],
        "recommended_threshold": model_entry["recommended_threshold"],
        "top_contributors": contributors,
    }


def predict_from_features(cfg: PulseMLConfig, bundle: dict, model_entry: dict, features: dict, customer_id: str | None = None) -> dict:
    """
    Score a single customer from a raw feature dict rather than a row
    already present in feature_matrix.csv - this is the path a brand new
    customer entered through the app's onboarding form takes, since they
    have no event history for build_features.py to aggregate yet.

    `features` must use the exact keys in ALL_FEATURE_NAMES (see
    ml/src/features/definitions.py - this is the single source of truth
    for the feature schema; the onboarding form on the app side is built
    against this same list, not a second copy of it). Any feature key
    that's missing or explicitly null is left as NaN and handled by the
    SAME imputer fit during training (median for most numeric features,
    most-frequent for categoricals) - never a second, inconsistent
    default defined in TypeScript.

    Sentinel-filled features (days_since_last_activity,
    days_since_last_purchase) are the one exception: if the caller omits
    them, they're filled with the sentinel value here (matching
    build_features.py's own behavior for "no such event observed"),
    not passed through as NaN.
    """
    from features.definitions import SENTINEL_FILLED_FEATURES, SENTINEL_VALUE_DAYS

    row = {}
    for key in ALL_FEATURE_NAMES:
        value = features.get(key, None)
        if value is None and key in SENTINEL_FILLED_FEATURES:
            value = SENTINEL_VALUE_DAYS
        row[key] = value

    X = pd.DataFrame([row])[ALL_FEATURE_NAMES]
    # Ensure numeric columns are actually numeric dtype (not object) so the
    # preprocessor's imputer/scaler behave identically to training-time
    # data - a JSON payload with mixed None/number/string values can
    # otherwise land as an object dtype column.
    from features.definitions import NUMERIC_FEATURES

    for col in NUMERIC_FEATURES:
        X[col] = pd.to_numeric(X[col], errors="coerce")

    X_t = bundle["preprocessor"].transform(X)
    probability = float(bundle["calibrated_model"].predict_proba(X_t)[:, 1][0])
    contributors = explain_customer(bundle, X, top_k=cfg.explainability.top_k_contributors)

    return {
        "customer_id": customer_id,
        "churn_probability": round(probability, 4),
        "risk_level": risk_level(probability, model_entry["risk_bands"]),
        "model_id": model_entry["model_id"],
        "model_version": model_entry["version"],
        "recommended_threshold": model_entry["recommended_threshold"],
        "top_contributors": contributors,
    }


def export_all_predictions(cfg: PulseMLConfig, bundle: dict, model_entry: dict, out_path: str) -> int:
    """Score every customer in the current feature matrix and write one row
    per customer (probability, risk level, and top contributors as a JSON
    string) to a CSV. This is what prisma/seed.ts shells out to in order to
    sync predictions into Postgres without reimplementing model inference
    in TypeScript - training and inference stay in Python, the app layer
    only ever reads already-computed results."""
    feature_matrix = pd.read_csv(cfg.paths.resolve("processed_dir") / "feature_matrix.csv")
    X = feature_matrix[ALL_FEATURE_NAMES]
    X_t = bundle["preprocessor"].transform(X)
    proba = bundle["calibrated_model"].predict_proba(X_t)[:, 1]

    rows = []
    for i, (customer_id, p) in enumerate(zip(feature_matrix["customer_id"], proba)):
        row = feature_matrix.iloc[[i]]
        contributors = explain_customer(bundle, row, top_k=cfg.explainability.top_k_contributors)
        rows.append(
            {
                "customer_id": customer_id,
                "churn_probability": round(float(p), 4),
                "risk_level": risk_level(float(p), model_entry["risk_bands"]),
                "model_id": model_entry["model_id"],
                "model_version": model_entry["version"],
                "recommended_threshold": model_entry["recommended_threshold"],
                "top_contributors_json": json.dumps(contributors),
            }
        )

    out_df = pd.DataFrame(rows)
    out_df.to_csv(out_path, index=False)
    return len(out_df)


def main():
    parser = argparse.ArgumentParser(description="Score customers using the production PULSE-CHURN model.")
    parser.add_argument("--customer_id", type=str, default=None)
    parser.add_argument("--top_risk", type=int, default=None, help="Print the N highest-risk customers instead of one lookup.")
    parser.add_argument("--export-csv", type=str, default=None, help="Score every customer and write results to this CSV path (used by prisma/seed.ts).")
    parser.add_argument("--from-json", type=str, default=None, help="Path to a JSON file of {feature_name: value} to score a customer not in feature_matrix.csv (used by the customer-onboarding API route).")
    args = parser.parse_args()

    cfg = load_config()
    bundle, entry = load_production_bundle(cfg)

    if args.export_csv:
        n = export_all_predictions(cfg, bundle, entry, args.export_csv)
        print(f"Exported {n} predictions to {args.export_csv}")
        return

    if args.from_json:
        with open(args.from_json) as f:
            payload = json.load(f)
        result = predict_from_features(cfg, bundle, entry, payload.get("features", {}), payload.get("customer_id"))
        print(json.dumps(result, indent=2))
        return

    if args.customer_id:
        result = predict_for_customer(cfg, bundle, entry, args.customer_id)
        print(json.dumps(result, indent=2))
        return

    n = args.top_risk or 10
    feature_matrix = pd.read_csv(cfg.paths.resolve("processed_dir") / "feature_matrix.csv")
    X = feature_matrix[ALL_FEATURE_NAMES]
    X_t = bundle["preprocessor"].transform(X)
    proba = bundle["calibrated_model"].predict_proba(X_t)[:, 1]
    feature_matrix = feature_matrix.assign(churn_probability=proba)
    top = feature_matrix.sort_values("churn_probability", ascending=False).head(n)

    print(f"Top {n} highest-risk customers (model {entry['model_id']} {entry['version']}):")
    for _, r in top.iterrows():
        print(f"  {r['customer_id']}  p={r['churn_probability']:.4f}  risk={risk_level(r['churn_probability'], entry['risk_bands'])}")


if __name__ == "__main__":
    main()
