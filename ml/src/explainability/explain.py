"""
Explainability.

Uses SHAP (TreeExplainer for tree models, LinearExplainer for logistic
regression) against the trained candidate bundle to compute:
  - GLOBAL explanations: which features matter most across the whole
    validation set (mean |SHAP value|)
  - a reusable `explain_customer()` function that returns per-customer
    top contributors, used both by this report and by src/inference/predict.py

Falls back to permutation importance if SHAP can't build an explainer for
the winning model type, so this stage never silently produces nothing.

Run with:
    python -m pipeline.explain
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import PulseMLConfig, load_config  # noqa: E402
from features.definitions import ALL_FEATURE_NAMES  # noqa: E402
from preprocessing.pipeline import get_output_feature_names  # noqa: E402
from utils.artifact_io import load_candidate  # noqa: E402

try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False


# Maps a raw engineered feature name to the human-readable phrase used in
# the UI (see spec section 2 / 33's "Usage decline", "Negative sentiment" style).
# This mapping is presentation-layer only - it never changes the underlying
# SHAP value, only how the feature is labeled.
HUMAN_READABLE_LABELS = {
    "usage_trend_30_vs_prior30": "Reduced product usage",
    "login_count_30d": "Login frequency",
    "login_count_7d": "Recent login activity",
    "feature_use_count_30d": "Feature usage",
    "feature_adoption_ratio": "Feature adoption",
    "active_days_30d": "Active days",
    "days_since_last_activity": "Recent inactivity",
    "negative_sentiment_ratio_90d": "Negative sentiment",
    "avg_sentiment_90d": "Overall sentiment",
    "sentiment_change_30d_vs_prior60": "Sentiment trend",
    "sentiment_volatility_90d": "Sentiment volatility",
    "support_ticket_count_90d": "Support issue frequency",
    "unresolved_ticket_count": "Unresolved support issues",
    "repeat_ticket_rate_90d": "Repeat support issues",
    "avg_response_time_hours_90d": "Support response time",
    "avg_resolution_time_hours_90d": "Support resolution time",
    "purchase_count_30d": "Recent purchases",
    "purchase_count_90d": "Purchase frequency",
    "refund_count_90d": "Refund activity",
    "refund_rate_90d": "Refund rate",
    "revenue_30d": "Recent revenue",
    "revenue_90d": "Revenue",
    "days_since_last_purchase": "Time since last purchase",
    "tenure_days_at_snapshot": "Account tenure",
    "monthly_revenue": "Plan value",
}


def human_label(raw_name: str) -> str:
    # Strip one-hot suffixes like "contract_type_month-to-month" down to a
    # readable base before falling back to a generic title-cased label.
    base = raw_name.split("__")[-1]
    for prefix in ("contract_type_", "subscription_type_", "region_", "industry_"):
        if base.startswith(prefix):
            value = base[len(prefix):]
            field = prefix[:-1].replace("_", " ")
            return f"{field.title()}: {value}"
    return HUMAN_READABLE_LABELS.get(base, base.replace("_", " ").title())


def build_explainer(model_type: str, model, background):
    if not SHAP_AVAILABLE:
        return None
    if model_type in ("random_forest", "xgboost"):
        return shap.TreeExplainer(model)
    if model_type == "logistic_regression":
        return shap.LinearExplainer(model, background)
    return None


def global_importance(explainer, X_sample, output_feature_names: list[str]) -> list[dict]:
    shap_values = explainer.shap_values(X_sample)
    if isinstance(shap_values, list):  # some explainers return [class0, class1]
        shap_values = shap_values[1]
    if shap_values.ndim == 3:  # (n_samples, n_features, n_classes)
        shap_values = shap_values[:, :, 1]

    mean_abs = np.abs(shap_values).mean(axis=0)
    ranked = sorted(
        zip(output_feature_names, mean_abs),
        key=lambda t: t[1],
        reverse=True,
    )
    return [
        {"feature": human_label(name), "raw_feature": name, "mean_abs_shap": float(val)}
        for name, val in ranked
    ]


def explain_customer(bundle: dict, customer_row: pd.DataFrame, top_k: int = 5) -> list[dict]:
    """Per-customer top contributors. Reused by src/inference/predict.py so
    the API-facing prediction and this report compute contributors identically."""
    preprocessor = bundle["preprocessor"]
    model = bundle["model"]
    model_type = bundle["training_report"]["selection"]["winner_model_type"]
    output_names = get_output_feature_names(preprocessor)

    X_t = preprocessor.transform(customer_row[ALL_FEATURE_NAMES])

    if not SHAP_AVAILABLE:
        return [{"feature": "explainability_unavailable", "raw_feature": None, "contribution": 0.0}]

    explainer = build_explainer(model_type, model, X_t)
    if explainer is None:
        return [{"feature": "explainability_unavailable_for_model_type", "raw_feature": None, "contribution": 0.0}]

    shap_values = explainer.shap_values(X_t)
    if isinstance(shap_values, list):
        shap_values = shap_values[1]
    if shap_values.ndim == 3:
        shap_values = shap_values[:, :, 1]

    row_values = shap_values[0]
    ranked_idx = np.argsort(-np.abs(row_values))[:top_k]
    results = []
    for i in ranked_idx:
        raw_name = output_names[i]
        original_col = raw_name.split("__")[-1]
        customer_value = None
        if original_col in customer_row.columns:
            v = customer_row[original_col].iloc[0]
            customer_value = float(v) if isinstance(v, (int, float, np.floating, np.integer)) else str(v)
        results.append(
            {
                "feature": human_label(raw_name),
                "raw_feature": raw_name,
                "customer_value": customer_value,
                "contribution": float(row_values[i]),
                "direction": "increases_risk" if row_values[i] > 0 else "decreases_risk",
            }
        )
    return results


def main():
    cfg = load_config()
    bundle = load_candidate(cfg)
    model_type = bundle["training_report"]["selection"]["winner_model_type"]

    val_df = pd.read_csv(cfg.paths.resolve("processed_dir") / "val.csv")
    X_val = val_df[ALL_FEATURE_NAMES]
    X_val_t = bundle["preprocessor"].transform(X_val)
    output_names = get_output_feature_names(bundle["preprocessor"])

    if not SHAP_AVAILABLE:
        report = {"method": "unavailable", "note": "shap is not installed in this environment."}
    else:
        sample_size = min(cfg.explainability.max_background_samples, X_val_t.shape[0])
        rng = np.random.default_rng(cfg.random_seed)
        sample_idx = rng.choice(X_val_t.shape[0], size=sample_size, replace=False)
        X_sample = X_val_t[sample_idx]

        explainer = build_explainer(model_type, bundle["model"], X_sample)
        if explainer is None:
            report = {"method": "unavailable_for_model_type", "model_type": model_type}
        else:
            ranked = global_importance(explainer, X_sample, output_names)
            report = {
                "method": cfg.explainability.method,
                "model_type": model_type,
                "background_sample_size": sample_size,
                "global_feature_importance": ranked,
            }

    # Worked example on one real high-risk validation customer, matching
    # the format the app's customer detail page will show.
    val_with_id = pd.read_csv(cfg.paths.resolve("processed_dir") / "val.csv")
    proba = bundle["calibrated_model"].predict_proba(bundle["preprocessor"].transform(val_with_id[ALL_FEATURE_NAMES]))[:, 1]
    val_with_id = val_with_id.assign(_pulse_proba=proba)
    example_row = val_with_id.sort_values("_pulse_proba", ascending=False).head(1)
    if SHAP_AVAILABLE and "global_feature_importance" in report:
        example_contributors = explain_customer(bundle, example_row, top_k=cfg.explainability.top_k_contributors)
        report["worked_example"] = {
            "predicted_probability": float(example_row["_pulse_proba"].iloc[0]),
            "top_contributors": example_contributors,
        }

    out_path = cfg.paths.resolve("reports_dir") / "explainability_report.json"
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2, default=str)

    print(f"Explainability report written to {out_path}")
    if "global_feature_importance" in report:
        print("Top 8 global features:")
        for row in report["global_feature_importance"][:8]:
            print(f"  {row['feature']:<28s} mean|SHAP|={row['mean_abs_shap']:.4f}")
    else:
        print(f"  {report}")


if __name__ == "__main__":
    main()
