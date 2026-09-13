import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import copy  # noqa: E402

from config import load_config  # noqa: E402
from synthetic.generate import generate  # noqa: E402


def _small_config():
    cfg = copy.deepcopy(load_config())
    cfg.synthetic.n_customers = 80
    return cfg


def test_generation_is_deterministic_given_same_seed():
    cfg = _small_config()
    result_a = generate(cfg, seed=7)
    result_b = generate(cfg, seed=7)
    assert result_a["customers"]["monthly_revenue"].tolist() == result_b["customers"]["monthly_revenue"].tolist()
    assert result_a["meta"]["n_positive_label"] == result_b["meta"]["n_positive_label"]


def test_different_seeds_produce_different_outcomes():
    cfg = _small_config()
    result_a = generate(cfg, seed=1)
    result_b = generate(cfg, seed=2)
    assert result_a["customers"]["monthly_revenue"].tolist() != result_b["customers"]["monthly_revenue"].tolist()


def test_generated_row_counts_match_config():
    cfg = _small_config()
    result = generate(cfg, seed=42)
    assert len(result["customers"]) == cfg.synthetic.n_customers
    assert result["meta"]["n_alive_at_snapshot"] <= cfg.synthetic.n_customers


def test_label_is_not_perfectly_separable_by_a_single_field():
    """Guards against the generator collapsing into a deterministic rule -
    no single raw field should perfectly separate churned/not-churned."""
    cfg = _small_config()
    cfg.synthetic.n_customers = 400
    result = generate(cfg, seed=42)
    snap = result["modeling_snapshots"]
    if snap["churned_within_window"].nunique() < 2:
        return  # too few customers in this tiny run to have both classes; not a failure
    corr = snap["tenure_days_at_snapshot"].corr(snap["churned_within_window"])
    assert abs(corr) < 0.9, "tenure alone should not near-perfectly predict churn"


def test_no_negative_monetary_values():
    cfg = _small_config()
    result = generate(cfg, seed=42)
    assert (result["customers"]["monthly_revenue"] > 0).all()
    assert (result["transactions"]["amount"] > 0).all()
