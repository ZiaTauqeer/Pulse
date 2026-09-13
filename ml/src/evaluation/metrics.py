"""
Metrics used across model comparison (validation set) and final evaluation
(test set). Centralized here so both stages compute things identically -
no metric gets defined two different ways in two different files.
"""
from __future__ import annotations

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)


def classification_metrics(y_true, y_proba, threshold: float = 0.5) -> dict:
    y_pred = (y_proba >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()

    return {
        "threshold": threshold,
        "roc_auc": float(roc_auc_score(y_true, y_proba)),
        "pr_auc": float(average_precision_score(y_true, y_proba)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "brier_score": float(brier_score_loss(y_true, y_proba)),
        "confusion_matrix": {
            "true_negative": int(tn),
            "false_positive": int(fp),
            "false_negative": int(fn),
            "true_positive": int(tp),
        },
        "false_positive_rate": float(fp / max(fp + tn, 1)),
        "false_negative_rate": float(fn / max(fn + tp, 1)),
        "n_samples": int(len(y_true)),
        "n_positive": int(np.sum(y_true)),
    }


def threshold_sweep(y_true, y_proba, thresholds=None) -> list[dict]:
    """Precision/recall/F1 at a range of thresholds, so a real trade-off
    decision (not a fixed 0.5 cutoff) can be documented and defended."""
    if thresholds is None:
        thresholds = [round(t, 2) for t in np.arange(0.1, 0.95, 0.05)]
    return [
        {
            "threshold": t,
            **{k: v for k, v in classification_metrics(y_true, y_proba, t).items() if k in ("precision", "recall", "f1", "false_positive_rate", "false_negative_rate")},
        }
        for t in thresholds
    ]


def calibration_curve_data(y_true, y_proba, n_bins: int = 10) -> list[dict]:
    """Bucket predictions into probability bins and compare predicted vs
    observed positive rate per bin - the raw material for a calibration plot."""
    y_true = np.asarray(y_true)
    y_proba = np.asarray(y_proba)
    bins = np.linspace(0, 1, n_bins + 1)
    bin_idx = np.digitize(y_proba, bins) - 1
    bin_idx = np.clip(bin_idx, 0, n_bins - 1)

    rows = []
    for b in range(n_bins):
        mask = bin_idx == b
        if mask.sum() == 0:
            continue
        rows.append(
            {
                "bin_range": f"{bins[b]:.2f}-{bins[b + 1]:.2f}",
                "n_samples": int(mask.sum()),
                "mean_predicted_probability": float(y_proba[mask].mean()),
                "observed_positive_rate": float(y_true[mask].mean()),
            }
        )
    return rows
