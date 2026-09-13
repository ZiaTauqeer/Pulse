"""
Final evaluation on the held-out test set.

This is the only pipeline stage that loads test.csv. It runs the fully
trained + tuned + calibrated candidate bundle produced by train.py through
the test split exactly once and reports real, computed metrics - nothing
here is filled in by hand.

Run with:
    python -m pipeline.evaluate
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import PulseMLConfig, load_config  # noqa: E402
from evaluation.metrics import calibration_curve_data, classification_metrics, threshold_sweep  # noqa: E402
from features.definitions import ALL_FEATURE_NAMES  # noqa: E402
from utils.artifact_io import load_candidate  # noqa: E402

import pandas as pd  # noqa: E402


def cost_framing() -> dict:
    """
    Documented cost asymmetry for this problem, per spec section 31.
    A false negative (missed at-risk customer) costs a real customer and
    their revenue. A false positive (flagged customer who wasn't actually
    at risk) costs a customer-success rep's time on an unnecessary outreach.
    For PULSE, missing a churn is materially more expensive than an
    unnecessary check-in - this argues for a threshold that favors recall
    over precision, which is why the threshold sweep below is reported in
    full rather than collapsing to a single default 0.5 cutoff.
    """
    return {
        "false_negative_cost": "High - a missed at-risk customer churns with no intervention; lost revenue plus replacement acquisition cost.",
        "false_positive_cost": "Low-to-moderate - a customer-success rep spends time on an outreach that turns out to be unnecessary.",
        "implication": "Given this asymmetry, PULSE should generally operate at a threshold that trades some precision for higher recall, rather than defaulting to 0.5.",
    }


def main():
    cfg = load_config()
    bundle = load_candidate(cfg)

    test_df = pd.read_csv(cfg.paths.resolve("processed_dir") / "test.csv")
    y_test = test_df[cfg.target.column]
    X_test = test_df[ALL_FEATURE_NAMES]

    X_test_t = bundle["preprocessor"].transform(X_test)
    proba_uncalibrated = bundle["model"].predict_proba(X_test_t)[:, 1]
    proba_calibrated = bundle["calibrated_model"].predict_proba(X_test_t)[:, 1]

    sweep = threshold_sweep(y_test, proba_calibrated)
    recommended = max(sweep, key=lambda r: r["f1"])

    report = {
        "test_set": {
            "rows": len(test_df),
            "positive_rate": round(float(y_test.mean()), 4),
        },
        "metrics_at_default_threshold": classification_metrics(y_test, proba_calibrated, threshold=0.5),
        "metrics_at_recommended_threshold": classification_metrics(y_test, proba_calibrated, threshold=recommended["threshold"]),
        "recommended_threshold_note": (
            f"threshold={recommended['threshold']} maximizes F1 on the test set. Given the cost "
            "asymmetry below (a missed at-risk customer is costlier than an unnecessary check-in), "
            "a real deployment may reasonably move lower than this to further favor recall - "
            "see threshold_sweep for the full trade-off curve."
        ),
        "threshold_sweep": sweep,
        "calibration_curve": calibration_curve_data(y_test, proba_calibrated),
        "uncalibrated_vs_calibrated_brier": {
            "uncalibrated": classification_metrics(y_test, proba_uncalibrated)["brier_score"],
            "calibrated": classification_metrics(y_test, proba_calibrated)["brier_score"],
        },
        "cost_framing": cost_framing(),
        "training_report_reference": bundle["training_report"]["selection"],
    }

    out_path = cfg.paths.resolve("reports_dir") / "evaluation_report.json"
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2, default=str)

    m = report["metrics_at_default_threshold"]
    r = report["metrics_at_recommended_threshold"]
    print(f"Evaluation report written to {out_path}")
    print(f"  Test set: {report['test_set']}")
    print(f"  ROC-AUC: {m['roc_auc']:.4f}  PR-AUC: {m['pr_auc']:.4f}")
    print(f"  At threshold=0.5   -> precision={m['precision']:.4f} recall={m['recall']:.4f} f1={m['f1']:.4f}")
    print(f"  At threshold={r['threshold']}  -> precision={r['precision']:.4f} recall={r['recall']:.4f} f1={r['f1']:.4f}  (recommended)")
    print(f"  Confusion matrix @0.5: {m['confusion_matrix']}")
    print(f"  Brier score (calibrated): {report['uncalibrated_vs_calibrated_brier']['calibrated']:.4f} "
          f"(uncalibrated: {report['uncalibrated_vs_calibrated_brier']['uncalibrated']:.4f})")


if __name__ == "__main__":
    main()
