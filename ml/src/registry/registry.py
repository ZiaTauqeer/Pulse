"""
Model registry.

Takes the trained + evaluated + explained candidate bundle and writes a
permanent, versioned artifact to artifacts/models/<model_id>/<version>/,
plus an entry in artifacts/metadata/model_registry.json.

A new version is always registered with status="candidate". Promotion to
"production" is a separate, explicit action (--promote) gated on the
evaluation report actually meeting a minimum bar - a model is never
promoted just because it finished training, per spec section 43.

Run with:
    python -m pipeline.register
    python -m pipeline.register --promote          # also attempt promotion
    python -m pipeline.register --promote --force  # promote even if below bar (not recommended)
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import PulseMLConfig, load_config  # noqa: E402
from utils.artifact_io import load_candidate  # noqa: E402

# Minimum bar for automatic promotion. Deliberately conservative and
# documented here rather than buried in a conditional - change this if
# your risk tolerance for promoting a new model version differs.
MIN_PROMOTION_ROC_AUC = 0.55


def registry_path(cfg: PulseMLConfig) -> Path:
    return cfg.paths.resolve("metadata_dir") / "model_registry.json"


def load_registry(cfg: PulseMLConfig) -> dict:
    path = registry_path(cfg)
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {"model_id": cfg.versioning.model_id, "versions": []}


def next_version(registry: dict) -> str:
    existing = [v["version"] for v in registry["versions"]]
    patch_numbers = []
    for v in existing:
        try:
            patch_numbers.append(int(v.split(".")[-1]))
        except (ValueError, IndexError):
            continue
    next_patch = (max(patch_numbers) + 1) if patch_numbers else 0
    return f"v1.{0}.{next_patch}"


def register(cfg: PulseMLConfig) -> dict:
    bundle = load_candidate(cfg)

    eval_report_path = cfg.paths.resolve("reports_dir") / "evaluation_report.json"
    explain_report_path = cfg.paths.resolve("reports_dir") / "explainability_report.json"
    if not eval_report_path.exists():
        raise FileNotFoundError("No evaluation_report.json found. Run `python -m pipeline.evaluate` before registering.")

    with open(eval_report_path) as f:
        eval_report = json.load(f)

    registry = load_registry(cfg)
    version = next_version(registry)
    version_dir = cfg.paths.resolve("models_dir") / version
    version_dir.mkdir(parents=True, exist_ok=True)

    joblib.dump(
        {
            "preprocessor": bundle["preprocessor"],
            "model": bundle["model"],
            "calibrated_model": bundle["calibrated_model"],
            "feature_columns": bundle["feature_columns"],
        },
        version_dir / "pipeline.joblib",
    )

    if explain_report_path.exists():
        shutil.copy(explain_report_path, version_dir / "explainability_report.json")
    shutil.copy(eval_report_path, version_dir / "evaluation_report.json")
    with open(version_dir / "training_report.json", "w") as f:
        json.dump(bundle["training_report"], f, indent=2, default=str)

    entry = {
        "version": version,
        "model_id": cfg.versioning.model_id,
        "algorithm": bundle["training_report"]["selection"]["winner_model_type"],
        "dataset_version": cfg.versioning.dataset_version,
        "feature_version": cfg.versioning.feature_version,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "metrics": eval_report["metrics_at_default_threshold"],
        "recommended_threshold": eval_report["metrics_at_recommended_threshold"]["threshold"],
        "risk_bands": bundle["training_report"]["risk_bands"],
        "status": "candidate",
        "artifact_path": str(version_dir.relative_to(cfg.paths.resolve("artifacts_dir").parent)),
    }
    registry["versions"].append(entry)

    with open(registry_path(cfg), "w") as f:
        json.dump(registry, f, indent=2, default=str)

    return entry


def promote(cfg: PulseMLConfig, version: str, force: bool = False) -> dict:
    registry = load_registry(cfg)
    matches = [v for v in registry["versions"] if v["version"] == version]
    if not matches:
        raise ValueError(f"Version {version} not found in registry.")
    entry = matches[0]

    roc_auc = entry["metrics"]["roc_auc"]
    if roc_auc < MIN_PROMOTION_ROC_AUC and not force:
        entry["status"] = "candidate"
        entry["promotion_note"] = (
            f"NOT promoted: test roc_auc={roc_auc:.4f} is below the minimum bar "
            f"({MIN_PROMOTION_ROC_AUC}). Re-run with --force to override (not recommended)."
        )
    else:
        for v in registry["versions"]:
            if v["status"] == "production":
                v["status"] = "retired"
        entry["status"] = "production"
        entry["promotion_note"] = f"Promoted: test roc_auc={roc_auc:.4f} >= {MIN_PROMOTION_ROC_AUC}" + (" (forced)" if force and roc_auc < MIN_PROMOTION_ROC_AUC else "")

    with open(registry_path(cfg), "w") as f:
        json.dump(registry, f, indent=2, default=str)

    return entry


def main():
    parser = argparse.ArgumentParser(description="Register (and optionally promote) the trained candidate model.")
    parser.add_argument("--promote", action="store_true", help="Attempt to promote the newly registered version to production.")
    parser.add_argument("--force", action="store_true", help="Force promotion even below the minimum ROC-AUC bar.")
    args = parser.parse_args()

    cfg = load_config()
    entry = register(cfg)
    print(f"Registered {entry['model_id']} {entry['version']} (status={entry['status']})")
    print(f"  algorithm: {entry['algorithm']}")
    print(f"  test roc_auc: {entry['metrics']['roc_auc']:.4f}")
    print(f"  artifact: {entry['artifact_path']}")

    if args.promote:
        result = promote(cfg, entry["version"], force=args.force)
        print(f"  promotion: {result['promotion_note']}")


if __name__ == "__main__":
    main()
