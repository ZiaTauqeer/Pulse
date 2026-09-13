import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from features.definitions import ALL_FEATURE_NAMES, CATEGORICAL_FEATURES, NUMERIC_FEATURES  # noqa: E402
from preprocessing.pipeline import build_preprocessor, get_output_feature_names  # noqa: E402


def _synthetic_frame(n=30, with_nulls=True, null_sentinel_cols_too=False) -> pd.DataFrame:
    from features.definitions import SENTINEL_FILLED_FEATURES

    rng = np.random.default_rng(0)
    data = {}
    for col in NUMERIC_FEATURES:
        values = rng.normal(size=n)
        col_can_be_null = null_sentinel_cols_too or col not in SENTINEL_FILLED_FEATURES
        if with_nulls and col_can_be_null:
            values[rng.random(n) < 0.2] = np.nan
        data[col] = values
    for col in CATEGORICAL_FEATURES:
        options = ["alpha", "beta", "gamma"]
        data[col] = rng.choice(options, size=n)
    return pd.DataFrame(data)[ALL_FEATURE_NAMES]


def test_preprocessor_fit_transform_produces_no_nulls():
    """Realistic missing-data pattern: NaN only where build_features.py can
    actually produce it (rate/average columns with a zero denominator).
    Sentinel columns (days_since_last_*) are excluded here because
    build_features.py guarantees they're always a finite number."""
    df = _synthetic_frame(with_nulls=True, null_sentinel_cols_too=False)
    pre = build_preprocessor()
    transformed = pre.fit_transform(df)
    assert not np.isnan(transformed).any(), "preprocessor output should never contain NaN after imputation"


def test_preprocessor_defensively_handles_unexpected_nulls_in_sentinel_columns():
    """Even if the days_since_last_* contract from build_features.py were
    ever violated upstream, the preprocessor must not silently emit NaN -
    it has its own constant-fill fallback (see build_preprocessor)."""
    df = _synthetic_frame(with_nulls=True, null_sentinel_cols_too=True)
    pre = build_preprocessor()
    transformed = pre.fit_transform(df)
    assert not np.isnan(transformed).any(), "defensive fallback imputer should prevent NaN even on contract violation"


def test_preprocessor_output_shape_matches_expected_columns():
    df = _synthetic_frame(with_nulls=False)
    pre = build_preprocessor()
    transformed = pre.fit_transform(df)
    output_names = get_output_feature_names(pre)
    assert transformed.shape[1] == len(output_names)
    assert transformed.shape[0] == len(df)


def test_preprocessor_handles_unseen_categorical_value_at_inference():
    """A category never seen during fit (e.g. a new region added later)
    must not crash inference - OneHotEncoder(handle_unknown='ignore') should
    just zero out that customer's categorical columns rather than raising."""
    train_df = _synthetic_frame(n=40, with_nulls=False)
    pre = build_preprocessor()
    pre.fit(train_df)

    inference_df = train_df.iloc[:1].copy()
    inference_df[CATEGORICAL_FEATURES[0]] = "a_category_never_seen_in_training"
    transformed = pre.transform(inference_df)  # should not raise
    assert transformed.shape[0] == 1


def test_sentinel_filled_features_are_not_median_imputed():
    """days_since_last_activity / days_since_last_purchase already carry
    their own explicit 'no event observed' sentinel from build_features.py
    and must only be scaled, never statistically imputed."""
    from features.definitions import SENTINEL_FILLED_FEATURES

    pre = build_preprocessor()
    numeric_no_impute_cols = pre.transformers[1][2]
    assert set(numeric_no_impute_cols) == SENTINEL_FILLED_FEATURES
