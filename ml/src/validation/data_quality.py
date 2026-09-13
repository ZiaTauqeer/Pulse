"""
Data quality + leakage validation.

Produces a data-quality report (missing values, duplicates, class balance)
and enforces the excluded-features / leakage list from training.yaml
programmatically: if a caller ever tries to build a feature matrix that
includes an excluded column, `assert_no_leakage` raises instead of
silently proceeding. This is imported by the training stage, not just
run standalone.

Run with:
    python -m pipeline.validate
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import PulseMLConfig, load_config  # noqa: E402
from ingestion.loader import load_synthetic_tables  # noqa: E402


class LeakageError(Exception):
    pass


def assert_no_leakage(feature_columns: list[str], cfg: PulseMLConfig) -> None:
    """Raise LeakageError if any excluded/target column made it into the feature set."""
    offenders = sorted(set(feature_columns) & set(cfg.excluded_features))
    if offenders:
        raise LeakageError(
            f"Excluded/leaky columns present in feature matrix: {offenders}. "
            "These are listed in configs/training.yaml -> excluded_features "
            "because they encode post-outcome or identifying information. "
            "See ml/src/features/excluded_features.py for the reasoning."
        )


def class_distribution(snapshots: pd.DataFrame, target_col: str) -> dict:
    counts = snapshots[target_col].value_counts().to_dict()
    total = len(snapshots)
    return {
        "total_rows": int(total),
        "counts": {str(k): int(v) for k, v in counts.items()},
        "positive_rate": round(float(snapshots[target_col].mean()), 4),
        "imbalance_ratio": round(float(counts.get(0, 0) / max(counts.get(1, 1), 1)), 2),
    }


def missing_value_report(df: pd.DataFrame) -> dict:
    nulls = df.isna().sum()
    return {col: int(n) for col, n in nulls.items() if n > 0}


def duplicate_report(df: pd.DataFrame, key: str | None = None) -> dict:
    exact_dupes = int(df.duplicated().sum())
    key_dupes = int(df.duplicated(subset=[key]).sum()) if key and key in df.columns else None
    return {"exact_duplicate_rows": exact_dupes, "duplicate_key_rows": key_dupes}


def run_validation(cfg: PulseMLConfig) -> dict:
    tables = load_synthetic_tables(cfg)
    target_col = cfg.target.column

    report = {
        "class_distribution": class_distribution(tables["modeling_snapshots"], target_col),
        "missing_values": {name: missing_value_report(df) for name, df in tables.items()},
        "duplicates": {
            "customers": duplicate_report(tables["customers"], key="customer_id"),
            "modeling_snapshots": duplicate_report(tables["modeling_snapshots"], key="customer_id"),
            "support_tickets": duplicate_report(tables["support_tickets"], key="ticket_id"),
        },
        "customer_id_referential_integrity": _check_referential_integrity(tables),
        "excluded_features_declared": cfg.excluded_features,
    }

    # This is informational only: the raw modeling_snapshots table is
    # EXPECTED to contain columns like snapshot_date and customer_id that
    # are deliberately excluded before the feature matrix is built (see
    # excluded_features in training.yaml). The enforced check that actually
    # blocks leakage happens in ml/src/features/build_features.py, which
    # calls assert_no_leakage() against the *final* feature matrix columns
    # right before writing it to disk - that call raises LeakageError
    # (not a soft warning) if it ever fails.
    raw_cols = [c for c in tables["modeling_snapshots"].columns if c != target_col]
    report["raw_snapshot_columns_requiring_exclusion"] = sorted(
        set(raw_cols) & set(cfg.excluded_features)
    )
    report["leakage_enforcement_note"] = (
        "Programmatic leakage assertion runs at feature-build time "
        "(pipeline.build_features), not here - see build_features.py."
    )

    return report


def _check_referential_integrity(tables: dict[str, pd.DataFrame]) -> dict:
    valid_ids = set(tables["customers"]["customer_id"])
    result = {}
    for name in ["customer_events", "transactions", "support_tickets", "sentiment_results", "modeling_snapshots"]:
        df = tables[name]
        orphan_count = int((~df["customer_id"].isin(valid_ids)).sum())
        result[name] = {"orphan_customer_id_rows": orphan_count}
    return result


def main():
    cfg = load_config()
    report = run_validation(cfg)

    out_path = cfg.paths.resolve("reports_dir") / "data_quality_report.json"
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2, default=str)

    print(f"Data quality report written to {out_path}")
    print(f"  Class distribution: {report['class_distribution']}")
    print(f"  Columns requiring exclusion before modeling: {report['raw_snapshot_columns_requiring_exclusion']}")
    missing_nonzero = {k: v for k, v in report["missing_values"].items() if v}
    print(f"  Tables with missing values: {list(missing_nonzero.keys())}")


if __name__ == "__main__":
    main()
