import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from config import load_config  # noqa: E402
from features.definitions import (  # noqa: E402
    ALL_FEATURE_NAMES,
    CATEGORICAL_FEATURES,
    FEATURE_MANIFEST,
    NUMERIC_FEATURES,
)

FEATURE_MATRIX_PATH = Path(__file__).resolve().parent.parent / "data" / "processed" / "feature_matrix.csv"


def test_feature_manifest_names_are_unique():
    names = [f["name"] for f in FEATURE_MANIFEST]
    assert len(names) == len(set(names))


def test_numeric_and_categorical_partition_covers_every_feature():
    assert set(NUMERIC_FEATURES) | set(CATEGORICAL_FEATURES) == set(ALL_FEATURE_NAMES)
    assert set(NUMERIC_FEATURES) & set(CATEGORICAL_FEATURES) == set()


def test_every_manifest_entry_has_required_fields():
    for entry in FEATURE_MANIFEST:
        for key in ("name", "category", "source", "transformation", "dtype"):
            assert key in entry, f"{entry.get('name')} missing '{key}'"


@pytest.mark.skipif(not FEATURE_MATRIX_PATH.exists(), reason="Run `python -m pipeline.build_features` first.")
def test_feature_matrix_contains_no_excluded_columns():
    cfg = load_config()
    df = pd.read_csv(FEATURE_MATRIX_PATH)
    feature_cols = [c for c in df.columns if c not in ("customer_id", cfg.target.column)]
    leaked = set(feature_cols) & set(cfg.excluded_features)
    assert not leaked, f"Excluded columns leaked into the feature matrix: {leaked}"


@pytest.mark.skipif(not FEATURE_MATRIX_PATH.exists(), reason="Run `python -m pipeline.build_features` first.")
def test_feature_matrix_columns_match_manifest():
    df = pd.read_csv(FEATURE_MATRIX_PATH)
    feature_cols = set(df.columns) - {"customer_id", "churned_within_window"}
    assert feature_cols == set(ALL_FEATURE_NAMES)


@pytest.mark.skipif(not FEATURE_MATRIX_PATH.exists(), reason="Run `python -m pipeline.build_features` first.")
def test_count_features_are_never_null():
    """Count-type features (e.g. login_count_30d) should always be a real
    number (0 if no events), never NaN - only rate/average features are
    allowed to be NaN when their denominator is zero."""
    df = pd.read_csv(FEATURE_MATRIX_PATH)
    always_populated = ["login_count_30d", "purchase_count_90d", "support_ticket_count_90d", "unresolved_ticket_count"]
    for col in always_populated:
        assert df[col].isna().sum() == 0, f"{col} should never be null"


@pytest.mark.skipif(not FEATURE_MATRIX_PATH.exists(), reason="Run `python -m pipeline.build_features` first.")
def test_target_is_binary():
    cfg = load_config()
    df = pd.read_csv(FEATURE_MATRIX_PATH)
    assert set(df[cfg.target.column].unique()) <= {0, 1}
