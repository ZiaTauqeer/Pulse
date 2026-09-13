"""
Model candidates. Each factory function returns an unfit, sklearn-compatible
estimator built from the params in configs/training.yaml - no hyperparameters
are hardcoded here. Add a new candidate by adding a branch in `build_model`
and a corresponding block in training.yaml -> models.
"""
from __future__ import annotations

from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from xgboost import XGBClassifier


def build_model(model_type: str, params: dict, class_weight: str | None, random_seed: int):
    if model_type == "majority_class":
        return DummyClassifier(strategy="most_frequent", random_state=random_seed)

    if model_type == "logistic_regression":
        return LogisticRegression(
            random_state=random_seed,
            class_weight=class_weight,
            **params,
        )

    if model_type == "random_forest":
        return RandomForestClassifier(
            random_state=random_seed,
            class_weight=class_weight,
            **params,
        )

    if model_type == "xgboost":
        # XGBoost doesn't take sklearn's class_weight string - convert to
        # scale_pos_weight if imbalance handling is enabled by the caller.
        return XGBClassifier(
            random_state=random_seed,
            eval_metric="logloss",
            **params,
        )

    raise ValueError(f"Unknown model_type '{model_type}'. Add a branch in models/candidates.py.")


def compute_scale_pos_weight(y) -> float:
    """XGBoost's equivalent of class_weight='balanced'."""
    n_pos = (y == 1).sum()
    n_neg = (y == 0).sum()
    return float(n_neg / max(n_pos, 1))
