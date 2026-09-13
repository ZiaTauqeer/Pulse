"""
Save/load helpers for the "candidate" model bundle that flows between
pipeline stages: train.py produces it, evaluate.py / explain.py read it,
register.py reads it and writes the final versioned artifact.

Kept as plain joblib + JSON rather than a database so every stage can be
run and re-run independently from the command line, per the reproducibility
requirement in ml/README.md.
"""
from __future__ import annotations

import json
from pathlib import Path

import joblib

CANDIDATE_DIRNAME = "_candidate"


def candidate_dir(cfg) -> Path:
    d = cfg.paths.resolve("models_dir") / CANDIDATE_DIRNAME
    d.mkdir(parents=True, exist_ok=True)
    return d


def save_candidate(cfg, preprocessor, model, calibrated_model, feature_columns: list[str], training_report: dict) -> Path:
    d = candidate_dir(cfg)
    joblib.dump(
        {
            "preprocessor": preprocessor,
            "model": model,
            "calibrated_model": calibrated_model,
            "feature_columns": feature_columns,
        },
        d / "bundle.joblib",
    )
    with open(d / "training_report.json", "w") as f:
        json.dump(training_report, f, indent=2, default=str)
    return d


def load_candidate(cfg) -> dict:
    d = candidate_dir(cfg)
    bundle_path = d / "bundle.joblib"
    if not bundle_path.exists():
        raise FileNotFoundError(f"No trained candidate found at {bundle_path}. Run `python -m pipeline.train` first.")
    bundle = joblib.load(bundle_path)
    with open(d / "training_report.json") as f:
        bundle["training_report"] = json.load(f)
    return bundle
