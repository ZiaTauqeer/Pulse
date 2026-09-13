"""
Train candidate models, compare them on the validation set, tune and
calibrate the winner. The test set is never loaded here - only
evaluate.py touches test.csv, and only once.

Run with:
    python -m pipeline.train
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.frozen import FrozenEstimator
from sklearn.model_selection import RandomizedSearchCV

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import PulseMLConfig, load_config  # noqa: E402
from evaluation.metrics import classification_metrics  # noqa: E402
from features.definitions import ALL_FEATURE_NAMES  # noqa: E402
from models.candidates import build_model, compute_scale_pos_weight  # noqa: E402
from preprocessing.pipeline import build_preprocessor  # noqa: E402
from utils.artifact_io import save_candidate  # noqa: E402


def load_split(cfg: PulseMLConfig, name: str) -> tuple[pd.DataFrame, pd.Series]:
    df = pd.read_csv(cfg.paths.resolve("processed_dir") / f"{name}.csv")
    y = df[cfg.target.column]
    X = df[ALL_FEATURE_NAMES]
    return X, y


def compare_candidates(cfg: PulseMLConfig, preprocessor, X_train_t, y_train, X_val_t, y_val) -> list[dict]:
    class_weight = "balanced" if cfg.imbalance.strategy == "class_weight" else None
    scale_pos_weight = compute_scale_pos_weight(y_train) if cfg.imbalance.strategy == "class_weight" else 1.0

    results = []
    for name, spec in cfg.models.enabled_items():
        params = dict(spec.params)
        if spec.type == "xgboost" and class_weight is not None:
            params["scale_pos_weight"] = scale_pos_weight

        model = build_model(spec.type, params, class_weight if spec.type != "xgboost" else None, cfg.random_seed)

        start = time.time()
        model.fit(X_train_t, y_train)
        train_seconds = round(time.time() - start, 3)

        val_proba = model.predict_proba(X_val_t)[:, 1]
        metrics = classification_metrics(y_val, val_proba)

        results.append(
            {
                "candidate_name": name,
                "model_type": spec.type,
                "params": params,
                "train_seconds": train_seconds,
                "validation_metrics": metrics,
                "_fitted_model": model,
            }
        )
        print(f"  [{name:>20s}] roc_auc={metrics['roc_auc']:.4f} pr_auc={metrics['pr_auc']:.4f} f1={metrics['f1']:.4f} ({train_seconds}s)")

    return results


def tune_winner(cfg: PulseMLConfig, winner: dict, X_train_t, y_train) -> tuple[object, dict]:
    """Hyperparameter tuning uses the search space registered for the
    winner's model type in training.yaml -> tuning.param_distributions_by_type.
    A model type with no registered space is skipped with a note in the
    report rather than guessing at reasonable parameters to search."""
    if not cfg.tuning.enabled:
        return winner["_fitted_model"], {"tuning_applied": False, "reason": "tuning.enabled=false in training.yaml"}

    space = cfg.tuning.space_for(winner["model_type"])
    if space is None:
        return winner["_fitted_model"], {
            "tuning_applied": False,
            "reason": f"No search space registered for model_type='{winner['model_type']}' in "
                      f"training.yaml -> tuning.param_distributions_by_type. Add one to enable tuning.",
        }

    class_weight = "balanced" if cfg.imbalance.strategy == "class_weight" and winner["model_type"] != "xgboost" else None
    base_params = dict(winner["params"])
    base_model = build_model(winner["model_type"], base_params, class_weight, cfg.random_seed)

    search = RandomizedSearchCV(
        estimator=base_model,
        param_distributions=space,
        n_iter=min(cfg.tuning.n_iter, _space_size(space)),
        cv=cfg.tuning.cv_folds,
        scoring=cfg.tuning.scoring,
        random_state=cfg.random_seed,
        n_jobs=-1,
    )
    search.fit(X_train_t, y_train)

    return search.best_estimator_, {
        "tuning_applied": True,
        "method": cfg.tuning.method,
        "model_type_tuned": winner["model_type"],
        "n_iter": min(cfg.tuning.n_iter, _space_size(space)),
        "cv_folds": cfg.tuning.cv_folds,
        "scoring": cfg.tuning.scoring,
        "search_space": space,
        "best_params": search.best_params_,
        "best_cv_score": float(search.best_score_),
    }


def _space_size(space: dict) -> int:
    total = 1
    for v in space.values():
        total *= len(v)
    return total


def calibrate(cfg: PulseMLConfig, model, X_val_t, y_val):
    if not cfg.calibration.enabled:
        return model, {"calibration_applied": False}

    calibrated = CalibratedClassifierCV(FrozenEstimator(model), method=cfg.calibration.method)
    calibrated.fit(X_val_t, y_val)

    pre_metrics = classification_metrics(y_val, model.predict_proba(X_val_t)[:, 1])
    post_metrics = classification_metrics(y_val, calibrated.predict_proba(X_val_t)[:, 1])

    return calibrated, {
        "calibration_applied": True,
        "method": cfg.calibration.method,
        "brier_score_before": pre_metrics["brier_score"],
        "brier_score_after": post_metrics["brier_score"],
        "note": (
            "Calibration is fit on the validation set (the model itself never "
            "saw it during training) and evaluated for real, held-out "
            "calibration quality on the test set in evaluate.py."
        ),
    }


def compute_risk_bands(val_probabilities: np.ndarray) -> dict:
    """
    Risk bands are percentile cutoffs of the model's own calibrated output
    distribution on the validation set, not fixed fractions of [0, 1].
    A model whose predicted probabilities only ever reach ~0.35 (honest,
    given real-world churn is genuinely uncertain) would otherwise never
    produce a "HIGH" or "CRITICAL" label under fixed absolute cutoffs -
    these are recomputed per model version so the labels stay meaningful
    as the underlying score distribution shifts across retrains.
    """
    p70, p90, p97 = np.percentile(val_probabilities, [70, 90, 97])
    return {
        "method": "percentile_of_validation_distribution",
        "low_max": round(float(p70), 4),
        "medium_max": round(float(p90), 4),
        "high_max": round(float(p97), 4),
        "note": "LOW: below p70, MEDIUM: p70-p90, HIGH: p90-p97, CRITICAL: above p97 of validation-set predicted probabilities.",
    }


def main():
    cfg = load_config()

    X_train, y_train = load_split(cfg, "train")
    X_val, y_val = load_split(cfg, "val")

    preprocessor = build_preprocessor()
    X_train_t = preprocessor.fit_transform(X_train, y_train)
    X_val_t = preprocessor.transform(X_val)

    print("Comparing candidate models on the validation set:")
    candidates = compare_candidates(cfg, preprocessor, X_train_t, y_train, X_val_t, y_val)

    ranked = sorted(candidates, key=lambda c: c["validation_metrics"][cfg.selection.primary_metric], reverse=True)
    winner = ranked[0]
    print(f"\nSelected candidate: {winner['candidate_name']} "
          f"({cfg.selection.primary_metric}={winner['validation_metrics'][cfg.selection.primary_metric]:.4f})")

    tuned_model, tuning_report = tune_winner(cfg, winner, X_train_t, y_train)
    if tuning_report.get("tuning_applied"):
        tuned_val_metrics = classification_metrics(y_val, tuned_model.predict_proba(X_val_t)[:, 1])
        print(f"  Post-tuning validation roc_auc={tuned_val_metrics['roc_auc']:.4f} (best CV score={tuning_report['best_cv_score']:.4f})")
    else:
        tuned_val_metrics = winner["validation_metrics"]
        print(f"  Tuning skipped: {tuning_report['reason']}")

    calibrated_model, calibration_report = calibrate(cfg, tuned_model, X_val_t, y_val)

    risk_bands = compute_risk_bands(calibrated_model.predict_proba(X_val_t)[:, 1])

    training_report = {
        "selection": {
            "primary_metric": cfg.selection.primary_metric,
            "secondary_metric": cfg.selection.secondary_metric,
            "winner": winner["candidate_name"],
            "winner_model_type": winner["model_type"],
        },
        "candidates": [
            {
                "candidate_name": c["candidate_name"],
                "model_type": c["model_type"],
                "params": c["params"],
                "train_seconds": c["train_seconds"],
                "validation_metrics": c["validation_metrics"],
            }
            for c in candidates
        ],
        "tuning": tuning_report,
        "post_tuning_validation_metrics": tuned_val_metrics,
        "calibration": calibration_report,
        "risk_bands": risk_bands,
        "dataset": {
            "train_rows": len(X_train),
            "val_rows": len(X_val),
            "train_positive_rate": round(float(y_train.mean()), 4),
            "val_positive_rate": round(float(y_val.mean()), 4),
        },
        "imbalance_strategy": cfg.imbalance.strategy,
        "feature_version": cfg.versioning.feature_version,
        "random_seed": cfg.random_seed,
    }

    out_dir = save_candidate(cfg, preprocessor, tuned_model, calibrated_model, ALL_FEATURE_NAMES, training_report)
    print(f"\nCandidate bundle + training report written to {out_dir}")
    print("Test set was not loaded at any point in this run.")


if __name__ == "__main__":
    main()
