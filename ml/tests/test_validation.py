"""
Run with: pytest tests/ -v   (from the ml/ directory)
"""
import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from config import load_config  # noqa: E402
from validation.data_quality import LeakageError, assert_no_leakage  # noqa: E402


def test_config_loads():
    cfg = load_config()
    assert cfg.random_seed == 42
    assert cfg.target.column == "churned_within_window"


def test_leakage_guard_raises_on_target_column():
    cfg = load_config()
    with pytest.raises(LeakageError):
        assert_no_leakage(["tenure_days_at_snapshot", cfg.target.column], cfg)


def test_leakage_guard_raises_on_customer_status():
    cfg = load_config()
    with pytest.raises(LeakageError):
        assert_no_leakage(["monthly_revenue", "customer_status"], cfg)


def test_leakage_guard_passes_clean_feature_list():
    cfg = load_config()
    clean_features = ["monthly_revenue", "login_count_30d", "avg_sentiment_90d"]
    assert_no_leakage(clean_features, cfg)  # should not raise


def test_excluded_features_all_documented():
    from features.excluded_features import EXCLUSION_RATIONALE

    cfg = load_config()
    for field in cfg.excluded_features:
        assert field in EXCLUSION_RATIONALE, f"{field} is excluded in training.yaml but undocumented in excluded_features.py"
