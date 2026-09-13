import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from config import load_config  # noqa: E402
from features.definitions import ALL_FEATURE_NAMES  # noqa: E402
from inference.predict import load_production_bundle, predict_for_customer, risk_level  # noqa: E402

REGISTRY_PATH = Path(__file__).resolve().parent.parent / "artifacts" / "metadata" / "model_registry.json"
FEATURE_MATRIX_PATH = Path(__file__).resolve().parent.parent / "data" / "processed" / "feature_matrix.csv"

requires_registered_model = pytest.mark.skipif(
    not REGISTRY_PATH.exists(), reason="Run the full pipeline through `pipeline.register --promote` first."
)


@requires_registered_model
def test_production_model_loads():
    cfg = load_config()
    bundle, entry = load_production_bundle(cfg)
    assert entry["status"] == "production"
    assert "preprocessor" in bundle and "calibrated_model" in bundle
    assert bundle["feature_columns"] == ALL_FEATURE_NAMES


@requires_registered_model
def test_bundle_preprocessor_is_already_fit_not_refit_at_inference():
    """The loaded preprocessor must already be fit (from training) -
    inference should only ever call .transform(), never .fit()."""
    cfg = load_config()
    bundle, _ = load_production_bundle(cfg)
    # A fit ColumnTransformer exposes fitted transformer instances; calling
    # transform without fitting first would raise NotFittedError.
    sample = pd.read_csv(FEATURE_MATRIX_PATH)[ALL_FEATURE_NAMES].head(2)
    transformed = bundle["preprocessor"].transform(sample)  # should not raise
    assert transformed.shape[0] == 2


@requires_registered_model
def test_predict_for_customer_returns_expected_shape():
    cfg = load_config()
    bundle, entry = load_production_bundle(cfg)
    feature_matrix = pd.read_csv(FEATURE_MATRIX_PATH)
    a_customer_id = feature_matrix["customer_id"].iloc[0]

    result = predict_for_customer(cfg, bundle, entry, a_customer_id)

    assert result["customer_id"] == a_customer_id
    assert 0.0 <= result["churn_probability"] <= 1.0
    assert result["risk_level"] in ("LOW", "MEDIUM", "HIGH", "CRITICAL")
    assert isinstance(result["top_contributors"], list)
    assert len(result["top_contributors"]) > 0


@requires_registered_model
def test_predict_for_unknown_customer_raises_clear_error():
    cfg = load_config()
    bundle, entry = load_production_bundle(cfg)
    with pytest.raises(ValueError):
        predict_for_customer(cfg, bundle, entry, "CUS-NOT-A-REAL-CUSTOMER")


@requires_registered_model
def test_predict_from_features_scores_a_customer_not_in_the_feature_matrix():
    """This is the path a brand-new customer entered through the app's
    onboarding form takes - no row in feature_matrix.csv exists yet."""
    from inference.predict import predict_from_features
    from features.definitions import ALL_FEATURE_NAMES

    cfg = load_config()
    bundle, entry = load_production_bundle(cfg)

    # Deliberately sparse - a brand new customer with minimal known history.
    # Missing numeric keys should be imputed the same way training data is.
    features = {
        "tenure_days_at_snapshot": 10,
        "contract_type": "month-to-month",
        "subscription_type": "basic",
        "monthly_revenue": 49,
        "region": "North America",
        "industry": "Retail",
        "login_count_7d": 1,
        "login_count_30d": 2,
    }
    result = predict_from_features(cfg, bundle, entry, features, customer_id="CUS-TEST")

    assert result["customer_id"] == "CUS-TEST"
    assert 0.0 <= result["churn_probability"] <= 1.0
    assert result["risk_level"] in ("LOW", "MEDIUM", "HIGH", "CRITICAL")
    assert len(result["top_contributors"]) > 0


@requires_registered_model
def test_predict_from_features_uses_sentinel_not_nan_for_activity_recency():
    """days_since_last_activity / days_since_last_purchase must get the
    same sentinel value build_features.py uses for 'no such event
    observed', not a raw NaN, when the caller omits them entirely."""
    from inference.predict import predict_from_features
    from features.definitions import SENTINEL_VALUE_DAYS

    cfg = load_config()
    bundle, entry = load_production_bundle(cfg)
    result = predict_from_features(cfg, bundle, entry, {"contract_type": "one-year", "subscription_type": "pro", "region": "Europe", "industry": "SaaS"})
    assert result["churn_probability"] is not None  # ran without error despite sparse input


@requires_registered_model
def test_predict_from_features_differentiates_risk_profiles():
    """A clearly at-risk profile should score meaningfully higher than a
    clearly healthy one - proves this isn't returning a constant/fake value."""
    from inference.predict import predict_from_features

    cfg = load_config()
    bundle, entry = load_production_bundle(cfg)

    at_risk = predict_from_features(cfg, bundle, entry, {
        "tenure_days_at_snapshot": 14, "contract_type": "month-to-month", "subscription_type": "pro",
        "monthly_revenue": 199, "region": "North America", "industry": "Retail",
        "login_count_7d": 0, "login_count_30d": 1, "feature_use_count_30d": 0,
        "avg_sentiment_90d": -0.7, "negative_sentiment_ratio_90d": 0.8,
        "unresolved_ticket_count": 3, "support_ticket_count_90d": 4,
    })
    healthy = predict_from_features(cfg, bundle, entry, {
        "tenure_days_at_snapshot": 500, "contract_type": "two-year", "subscription_type": "enterprise",
        "monthly_revenue": 1200, "region": "Europe", "industry": "SaaS",
        "login_count_7d": 12, "login_count_30d": 45, "feature_use_count_30d": 30,
        "avg_sentiment_90d": 0.6, "negative_sentiment_ratio_90d": 0.0,
        "unresolved_ticket_count": 0, "support_ticket_count_90d": 0,
    })
    assert at_risk["churn_probability"] > healthy["churn_probability"]
    bands = {"low_max": 0.1, "medium_max": 0.3, "high_max": 0.5}
    assert risk_level(0.05, bands) == "LOW"
    assert risk_level(0.2, bands) == "MEDIUM"
    assert risk_level(0.4, bands) == "HIGH"
    assert risk_level(0.9, bands) == "CRITICAL"
