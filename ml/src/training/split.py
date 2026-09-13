"""
Train / validation / test split.

Stratified on the target by default (configurable to "temporal" if you
later move to a rolling multi-snapshot dataset). The test set is written
once and never touched again until evaluation - train.py only ever reads
train.csv and val.csv.

Run with:
    python -m pipeline.split
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import PulseMLConfig, load_config  # noqa: E402


def split_data(feature_matrix: pd.DataFrame, cfg: PulseMLConfig) -> dict[str, pd.DataFrame]:
    target = cfg.target.column
    id_col = cfg.target.customer_id_column

    if cfg.split.strategy != "stratified":
        raise NotImplementedError(
            f"Split strategy '{cfg.split.strategy}' is not implemented. "
            "Only 'stratified' is currently supported - see split.py to add 'temporal'."
        )

    train_val, test = train_test_split(
        feature_matrix,
        test_size=cfg.split.test_size,
        stratify=feature_matrix[target],
        random_state=cfg.random_seed,
    )
    train, val = train_test_split(
        train_val,
        test_size=cfg.split.val_size,
        stratify=train_val[target],
        random_state=cfg.random_seed,
    )

    # Same-customer-across-splits guard. Trivial with one row per customer
    # today, but kept as a real assertion so it fails loudly if the dataset
    # ever moves to multiple snapshots per customer without updating split logic.
    train_ids, val_ids, test_ids = set(train[id_col]), set(val[id_col]), set(test[id_col])
    overlap = (train_ids & val_ids) | (train_ids & test_ids) | (val_ids & test_ids)
    if overlap:
        raise ValueError(f"{len(overlap)} customer_id(s) leaked across splits: {list(overlap)[:5]}...")

    return {"train": train, "val": val, "test": test}


def main():
    cfg = load_config()
    processed_dir = cfg.paths.resolve("processed_dir")
    feature_matrix = pd.read_csv(processed_dir / "feature_matrix.csv")

    splits = split_data(feature_matrix, cfg)

    summary = {}
    for name, df in splits.items():
        df.to_csv(processed_dir / f"{name}.csv", index=False)
        summary[name] = {
            "rows": len(df),
            "positive_rate": round(float(df[cfg.target.column].mean()), 4),
        }

    out_path = cfg.paths.resolve("metadata_dir") / "split_summary.json"
    with open(out_path, "w") as f:
        json.dump(summary, f, indent=2)

    print(f"Split summary written to {out_path}")
    for name, s in summary.items():
        print(f"  {name}: {s['rows']} rows, positive_rate={s['positive_rate']}")


if __name__ == "__main__":
    main()
