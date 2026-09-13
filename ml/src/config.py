"""
Central configuration loader for the PULSE ML pipeline.

Every pipeline stage imports `load_config()` from here instead of reading
YAML or hardcoding values itself. This is the *only* file that knows how
to turn `configs/training.yaml` into typed, validated Python objects.

If you add a new config section to training.yaml, add a matching Pydantic
model here so a typo or missing field fails loudly at startup instead of
silently at inference time.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel, Field

# ml/ package root (this file lives at ml/src/config.py)
ML_ROOT = Path(__file__).resolve().parent.parent


class PathsConfig(BaseModel):
    raw_dir: str
    interim_dir: str
    processed_dir: str
    synthetic_dir: str
    artifacts_dir: str
    models_dir: str
    reports_dir: str
    metadata_dir: str

    def resolve(self, key: str) -> Path:
        rel = getattr(self, key)
        p = ML_ROOT / rel
        p.mkdir(parents=True, exist_ok=True)
        return p


class TrajectoryMix(BaseModel):
    declining: float
    stable: float
    growing: float


class SyntheticConfig(BaseModel):
    n_customers: int
    simulation_days: int
    snapshot_day: int
    observation_window_days: int
    prediction_window_days: int
    min_tenure_days_for_churn: int
    base_daily_churn_hazard: float
    trajectory_mix: TrajectoryMix
    contract_types: list[str]
    subscription_types: list[str]
    regions: list[str]
    industries: list[str]


class TargetConfig(BaseModel):
    column: str
    positive_label: int
    customer_id_column: str


class SplitConfig(BaseModel):
    strategy: str
    test_size: float
    val_size: float
    stratify_on: str


class ImbalanceConfig(BaseModel):
    strategy: str


class ModelSpec(BaseModel):
    type: str
    enabled: bool
    params: dict = Field(default_factory=dict)


class ModelsConfig(BaseModel):
    baseline: ModelSpec
    logistic_regression: ModelSpec
    random_forest: ModelSpec
    gradient_boosting: ModelSpec

    def enabled_items(self) -> list[tuple[str, "ModelSpec"]]:
        return [(name, spec) for name, spec in self.__dict__.items() if spec.enabled]


class TuningConfig(BaseModel):
    enabled: bool
    method: str
    n_iter: int
    cv_folds: int
    scoring: str
    param_distributions_by_type: dict[str, dict]

    def space_for(self, model_type: str) -> dict | None:
        return self.param_distributions_by_type.get(model_type)


class SelectionConfig(BaseModel):
    primary_metric: str
    secondary_metric: str


class CalibrationConfig(BaseModel):
    enabled: bool
    method: str


class ExplainabilityConfig(BaseModel):
    method: str
    max_background_samples: int
    top_k_contributors: int


class VersioningConfig(BaseModel):
    model_id: str
    feature_version: str
    dataset_version: str


class PulseMLConfig(BaseModel):
    random_seed: int
    paths: PathsConfig
    synthetic: SyntheticConfig
    target: TargetConfig
    excluded_features: list[str]
    split: SplitConfig
    imbalance: ImbalanceConfig
    models: ModelsConfig
    tuning: TuningConfig
    selection: SelectionConfig
    calibration: CalibrationConfig
    explainability: ExplainabilityConfig
    versioning: VersioningConfig


_CONFIG_CACHE: Optional[PulseMLConfig] = None


def config_path() -> Path:
    override = os.environ.get("PULSE_ML_CONFIG")
    if override:
        return Path(override)
    return ML_ROOT / "configs" / "training.yaml"


def load_config(force_reload: bool = False) -> PulseMLConfig:
    """Load and validate configs/training.yaml (cached after first call)."""
    global _CONFIG_CACHE
    if _CONFIG_CACHE is not None and not force_reload:
        return _CONFIG_CACHE

    path = config_path()
    if not path.exists():
        raise FileNotFoundError(
            f"Training config not found at {path}. "
            "Set PULSE_ML_CONFIG to point at a valid training.yaml."
        )

    with open(path, "r") as f:
        raw = yaml.safe_load(f)

    cfg = PulseMLConfig(**raw)
    _CONFIG_CACHE = cfg
    return cfg
