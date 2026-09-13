"""
Ingestion: load raw tables and inspect their schema before anything
downstream touches them.

Primary source is PULSE's own synthetic generator output
(data/synthetic/*.csv). The loader is also able to ingest an arbitrary
external CSV (e.g. IBM Telco Customer Churn) via `load_external_dataset`,
inspecting its columns/dtypes/missing values/class balance without
assuming a fixed schema - this is what section 18 of the spec calls for.
PULSE does not ship a normalization mapping for a specific public dataset
because none was supplied at build time; `inspect_external_schema` is the
hook a developer would extend with a real column-mapping once they add one
(see ml/README.md, "Adding a public dataset").

Run with:
    python -m pipeline.ingest
    python -m pipeline.ingest --external /path/to/telco.csv
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import PulseMLConfig, load_config  # noqa: E402

SYNTHETIC_TABLES = [
    "customers",
    "customer_events",
    "transactions",
    "support_tickets",
    "sentiment_results",
    "modeling_snapshots",
]


def load_synthetic_tables(cfg: PulseMLConfig) -> dict[str, pd.DataFrame]:
    synth_dir = cfg.paths.resolve("synthetic_dir")
    tables = {}
    missing = []
    for name in SYNTHETIC_TABLES:
        path = synth_dir / f"{name}.csv"
        if not path.exists():
            missing.append(name)
            continue
        tables[name] = pd.read_csv(path)
    if missing:
        raise FileNotFoundError(
            f"Missing synthetic tables {missing} in {synth_dir}. "
            "Run `python -m pipeline.generate_synthetic` first."
        )
    return tables


def inspect_table(name: str, df: pd.DataFrame) -> dict:
    """Schema inspection for one table: columns, dtypes, nulls, duplicates."""
    report = {
        "table": name,
        "row_count": int(len(df)),
        "column_count": int(df.shape[1]),
        "columns": {},
        "duplicate_rows": int(df.duplicated().sum()),
    }
    for col in df.columns:
        series = df[col]
        col_report = {
            "dtype": str(series.dtype),
            "null_count": int(series.isna().sum()),
            "null_pct": round(float(series.isna().mean()) * 100, 2),
            "n_unique": int(series.nunique(dropna=True)),
        }
        if pd.api.types.is_numeric_dtype(series):
            col_report["min"] = _safe_float(series.min())
            col_report["max"] = _safe_float(series.max())
            col_report["mean"] = _safe_float(series.mean())
        else:
            top = series.value_counts(dropna=True).head(5)
            col_report["top_values"] = {str(k): int(v) for k, v in top.items()}
        report["columns"][col] = col_report
    return report


def inspect_external_schema(path: str) -> dict:
    """
    Load and inspect an arbitrary external CSV (e.g. a public churn dataset)
    without assuming its schema. Returns the same inspection shape as
    inspect_table so it can be diffed against the canonical PULSE schema
    by a developer deciding how to map its columns in.
    """
    df = pd.read_csv(path)
    report = inspect_table(Path(path).stem, df)
    report["candidate_target_columns"] = [
        c for c in df.columns if df[c].nunique() == 2 or "churn" in c.lower()
    ]
    report["candidate_id_columns"] = [
        c for c in df.columns if df[c].nunique() == len(df) and df[c].dtype == object
    ]
    report["candidate_date_columns"] = [
        c for c in df.columns if "date" in c.lower() or "time" in c.lower()
    ]
    return report


def _safe_float(v) -> float | None:
    try:
        f = float(v)
        return f if f == f else None  # filters NaN
    except (TypeError, ValueError):
        return None


def main():
    parser = argparse.ArgumentParser(description="Ingest and inspect PULSE raw data sources.")
    parser.add_argument("--external", type=str, default=None, help="Path to an external CSV to inspect (schema-only, not merged automatically).")
    args = parser.parse_args()

    cfg = load_config()
    tables = load_synthetic_tables(cfg)

    report = {"source": "synthetic", "tables": {}}
    for name, df in tables.items():
        report["tables"][name] = inspect_table(name, df)

    if args.external:
        report["external_inspection"] = inspect_external_schema(args.external)

    out_path = cfg.paths.resolve("reports_dir") / "ingestion_report.json"
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2, default=str)

    print(f"Ingestion report written to {out_path}")
    for name, t in report["tables"].items():
        print(f"  {name}: {t['row_count']} rows, {t['column_count']} cols, {t['duplicate_rows']} dup rows")


if __name__ == "__main__":
    main()
