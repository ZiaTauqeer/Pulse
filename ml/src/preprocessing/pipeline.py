"""
Preprocessing pipeline shared between training and inference.

This is the piece that prevents train/serve skew: `build_preprocessor()`
returns an unfit sklearn ColumnTransformer. It gets `.fit()` once during
training (on the training split only - never on val/test) and is then
serialized as part of the registered model artifact. Inference loads that
exact fitted object and calls `.transform()` - it never re-fits, so a
customer's feature row is guaranteed to go through the identical
imputation/scaling/encoding logic that produced the training data the
model actually learned from.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from features.definitions import CATEGORICAL_FEATURES, NUMERIC_FEATURES, SENTINEL_FILLED_FEATURES, SENTINEL_VALUE_DAYS  # noqa: E402


def build_preprocessor() -> ColumnTransformer:
    # Sentinel-filled features (days_since_last_*) already carry their
    # "no such event" value from build_features.py - they should NOT get
    # a statistical median imputation, only scaling.
    numeric_needs_impute = [c for c in NUMERIC_FEATURES if c not in SENTINEL_FILLED_FEATURES]
    numeric_no_impute = [c for c in NUMERIC_FEATURES if c in SENTINEL_FILLED_FEATURES]

    numeric_impute_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    # Sentinel columns should never actually contain NaN by the time they
    # reach here (build_features.py fills them explicitly) - this
    # constant-fill imputer is a defensive fallback, not the intended path.
    # It exists so a future bug upstream fails loudly downstream (a wrong
    # but finite number breaks a model with a clear stack trace) rather
    # than silently propagating NaN into StandardScaler, which does not
    # itself raise on NaN input.
    numeric_no_impute_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="constant", fill_value=SENTINEL_VALUE_DAYS)),
            ("scaler", StandardScaler()),
        ]
    )
    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ]
    )

    return ColumnTransformer(
        transformers=[
            ("num_impute", numeric_impute_pipeline, numeric_needs_impute),
            ("num_no_impute", numeric_no_impute_pipeline, numeric_no_impute),
            ("cat", categorical_pipeline, CATEGORICAL_FEATURES),
        ],
        remainder="drop",
    )


def get_output_feature_names(preprocessor: ColumnTransformer) -> list[str]:
    """Human-readable names for the transformed columns, post-fit. Used by
    explainability to map SHAP values back onto interpretable feature names."""
    return list(preprocessor.get_feature_names_out())
