"""
PULSE synthetic data generator.

Simulates `n_customers` day-by-day over `simulation_days`, producing:
  - a latent, continuous "engagement" trajectory per customer (never exposed
    as a feature - it's the hidden ground truth driving behavior, the way a
    real customer's true satisfaction is never directly observable)
  - discrete, observable events sampled FROM that trajectory: logins,
    feature usage, purchases, refunds, support tickets, sentiment records
  - a stochastic (not rule-based) daily churn hazard, so churn is
    correlated with, but not a deterministic function of, any single
    signal. Two customers with identical observable behavior can still
    have different outcomes, same as in reality.

Two-phase design:
  Phase A - simulate continuous latent trajectories (engagement, mood) for
            every customer across every day. Pure vectorized numpy.
  Phase B - walk day-by-day, sample discrete events from those trajectories,
            track rolling state (inactivity streak, unresolved tickets,
            sentiment EMA), compute a daily churn hazard from that rolling
            state, and sample whether each customer churns today.

A "modeling snapshot" is then cut at `snapshot_day`: features may only use
data up to that day (observation window), and the label looks forward
`prediction_window_days` days - this is what prevents temporal leakage in
the training set produced downstream by ml/src/features.

Run with:
    python -m pipeline.generate_synthetic
    python -m pipeline.generate_synthetic --seed 7   # override the configured seed
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import PulseMLConfig, load_config  # noqa: E402
from synthetic.names import generate_company_names, generate_contact_names  # noqa: E402

# Fixed anchor so the simulation is reproducible regardless of the real
# wall-clock date. Day 0 of the simulation = this date. Change this if you
# want the demo dataset's dates to sit in a different window.
ANCHOR_DATE = date(2026, 1, 15)

SENTIMENT_TEMPLATES = {
    ("negative", "support"): [
        "Still waiting on a resolution, this is taking longer than expected.",
        "The same issue keeps recurring and it's affecting our workflow.",
        "Disappointed with how long this ticket has been open.",
        "This is the second time we've had to report the same problem.",
    ],
    ("negative", "feedback"): [
        "The product has felt unreliable the last few weeks.",
        "We're reconsidering our plan because of ongoing issues.",
        "Usage has dropped internally because the tool isn't fitting our workflow.",
        "Not seeing the value we expected from this subscription lately.",
    ],
    ("neutral", "support"): [
        "Following up on the status of our open ticket.",
        "Requesting clarification on the reported issue.",
        "Checking in on the timeline for a fix.",
    ],
    ("neutral", "feedback"): [
        "Things are working as expected this cycle.",
        "No major concerns to report right now.",
        "Usage has been steady, nothing notable to flag.",
    ],
    ("positive", "support"): [
        "Thanks for the quick turnaround on this, appreciated.",
        "Issue was resolved fast, great support experience.",
        "Support team was very responsive this time.",
    ],
    ("positive", "feedback"): [
        "The reporting feature has been genuinely useful for our team.",
        "Getting a lot of value out of the product lately.",
        "Rollout of the new workflow went smoothly for us.",
    ],
}

SENTIMENT_MODEL_VERSION = "synthetic-seed-v1"  # clearly not a live model - this is seed data


def sentiment_bucket(score: float) -> str:
    if score > 0.15:
        return "positive"
    if score < -0.15:
        return "negative"
    return "neutral"


def random_timestamp(day: date, rng: np.random.Generator) -> datetime:
    seconds = int(rng.integers(0, 86400))
    return datetime.combine(day, datetime.min.time()) + timedelta(seconds=seconds)


def simulate_latent_trajectories(
    n: int, days: int, trajectory: np.ndarray, tier_boost: np.ndarray, rng: np.random.Generator
) -> tuple[np.ndarray, np.ndarray]:
    """Phase A: continuous engagement + mood trajectories. Never exposed as features."""
    drift = np.empty(n)
    declining = trajectory == "declining"
    stable = trajectory == "stable"
    growing = trajectory == "growing"
    drift[declining] = rng.uniform(-0.0035, -0.0012, declining.sum())
    drift[stable] = rng.uniform(-0.0004, 0.0004, stable.sum())
    drift[growing] = rng.uniform(0.0012, 0.0035, growing.sum())

    engagement = np.empty((n, days))
    e0 = np.clip(rng.beta(2.2, 2.0, n) + tier_boost, 0.02, 0.98)
    engagement[:, 0] = e0
    noise_std = 0.018
    for t in range(1, days):
        step = drift + rng.normal(0, noise_std, n)
        engagement[:, t] = np.clip(engagement[:, t - 1] + step, 0.02, 0.98)

    mood = np.empty((n, days))
    mood[:, 0] = np.clip(rng.normal(0.1, 0.3, n), -1, 1)
    for t in range(1, days):
        target = (engagement[:, t] - 0.5) * 1.4
        mood[:, t] = np.clip(0.7 * mood[:, t - 1] + 0.3 * target + rng.normal(0, 0.06, n), -1, 1)

    return engagement, mood


def generate(cfg: PulseMLConfig, seed: int | None = None) -> dict:
    seed = seed if seed is not None else cfg.random_seed
    rng = np.random.default_rng(seed)
    sc = cfg.synthetic

    n = sc.n_customers
    days = sc.simulation_days
    snapshot_day = sc.snapshot_day
    obs_window = sc.observation_window_days
    pred_window = sc.prediction_window_days
    min_tenure = sc.min_tenure_days_for_churn
    base_hazard = sc.base_daily_churn_hazard

    if snapshot_day + pred_window > days:
        raise ValueError(
            "snapshot_day + prediction_window_days must be <= simulation_days "
            "so churn outcomes within the prediction window are actually observed."
        )

    # ---- static customer attributes -----------------------------------
    customer_ids = np.array([f"CUS-{100000 + i}" for i in range(n)])
    company_names = generate_company_names(n, rng)
    contact_names = generate_contact_names(n, rng)

    contract_type = rng.choice(sc.contract_types, size=n, p=_weights_for(sc.contract_types, "contract"))
    subscription_type = rng.choice(sc.subscription_types, size=n, p=_weights_for(sc.subscription_types, "subscription"))
    region = rng.choice(sc.regions, size=n)
    industry = rng.choice(sc.industries, size=n)

    tier_boost = np.where(subscription_type == "enterprise", 0.05, np.where(subscription_type == "basic", -0.03, 0.0))
    monthly_revenue = _revenue_for_tier(subscription_type, rng)

    signup_offset = rng.integers(30, 1500, size=n)  # days of tenure already accrued before day 0

    mix = sc.trajectory_mix
    trajectory = rng.choice(
        ["declining", "stable", "growing"], size=n, p=[mix.declining, mix.stable, mix.growing]
    )

    # ---- Phase A: latent trajectories -----------------------------------
    engagement, mood = simulate_latent_trajectories(n, days, trajectory, tier_boost, rng)

    # ---- Phase B: discrete event simulation + churn sampling ------------
    alive = np.ones(n, dtype=bool)
    churn_day = np.full(n, -1, dtype=int)
    inactivity_streak = np.zeros(n, dtype=int)
    unresolved_tickets = np.zeros(n, dtype=int)
    prior_ticket_count = np.zeros(n, dtype=int)
    ema_neg_sentiment = np.zeros(n)
    pending_resolutions: dict[int, list[int]] = {}

    events: list[tuple] = []
    transactions: list[tuple] = []
    tickets: list[tuple] = []
    sentiments: list[tuple] = []

    event_id = 0
    txn_id = 0
    ticket_id = 0
    sentiment_id = 0

    for t in range(days):
        if not alive.any():
            break

        day = ANCHOR_DATE + timedelta(days=t)
        e_full = engagement[:, t]
        m_full = mood[:, t]

        # daily decay of sentiment memory (fades if nothing new happens)
        ema_neg_sentiment *= 0.995

        # ---- logins / feature usage ----
        login_today = alive & (rng.random(n) < (0.15 + 0.70 * e_full))
        feature_today = login_today & (rng.random(n) < (0.30 + 0.60 * e_full))
        inactivity_streak[login_today] = 0
        inactivity_streak[alive & ~login_today] += 1

        for idx in np.where(login_today)[0]:
            event_id += 1
            events.append((f"EVT-{event_id}", customer_ids[idx], "login", random_timestamp(day, rng)))
        for idx in np.where(feature_today)[0]:
            event_id += 1
            events.append((f"EVT-{event_id}", customer_ids[idx], "feature_use", random_timestamp(day, rng)))

        # ---- resolve tickets scheduled to close today ----
        for idx in pending_resolutions.pop(t, []):
            unresolved_tickets[idx] = max(0, unresolved_tickets[idx] - 1)

        # ---- support tickets ----
        ticket_today = alive & (rng.random(n) < (0.004 + 0.02 * (1 - e_full)))
        for idx in np.where(ticket_today)[0]:
            ticket_id += 1
            repeat = bool(prior_ticket_count[idx] > 0)
            prior_ticket_count[idx] += 1
            tier = subscription_type[idx]
            resp_mult = 0.6 if tier == "enterprise" else (0.85 if tier == "pro" else 1.15)
            response_time_hours = float(np.clip(rng.lognormal(2.0, 0.5) * resp_mult, 0.5, 96))
            resolution_days = float(rng.lognormal(0.75, 0.65))
            resolved_at_day = t + resolution_days
            will_resolve = resolved_at_day <= days - 1
            opened_at = random_timestamp(day, rng)
            resolved_at_ts = (
                ANCHOR_DATE + timedelta(days=resolved_at_day) if will_resolve else None
            )
            tickets.append(
                (
                    f"TCK-{ticket_id}",
                    customer_ids[idx],
                    opened_at,
                    resolved_at_ts,
                    round(response_time_hours, 2),
                    round(resolution_days * 24, 2) if will_resolve else None,
                    will_resolve,
                    repeat,
                )
            )
            unresolved_tickets[idx] += 1
            if will_resolve:
                resolve_day_int = int(np.ceil(resolved_at_day))
                if resolve_day_int < days:
                    pending_resolutions.setdefault(resolve_day_int, []).append(idx)
                else:
                    unresolved_tickets[idx] = max(0, unresolved_tickets[idx] - 1)

            # sentiment tied to the ticket - frustration compounds on repeat tickets
            score = float(np.clip(m_full[idx] - (0.25 * rng.random() if repeat else 0.0), -1, 1))
            label = sentiment_bucket(score)
            sentiment_id += 1
            msg = rng.choice(SENTIMENT_TEMPLATES[(label, "support")])
            sentiments.append(
                (f"SNT-{sentiment_id}", customer_ids[idx], opened_at, "support", f"TCK-{ticket_id}", msg, label, round(score, 3), SENTIMENT_MODEL_VERSION)
            )
            ema_neg_sentiment[idx] = 0.8 * ema_neg_sentiment[idx] + 0.2 * (1.0 if label == "negative" else 0.0)

        # ---- standalone feedback sentiment (not tied to a ticket) ----
        feedback_today = alive & (rng.random(n) < 0.003)
        for idx in np.where(feedback_today)[0]:
            score = float(np.clip(m_full[idx] + rng.normal(0, 0.15), -1, 1))
            label = sentiment_bucket(score)
            sentiment_id += 1
            msg = rng.choice(SENTIMENT_TEMPLATES[(label, "feedback")])
            ts = random_timestamp(day, rng)
            sentiments.append(
                (f"SNT-{sentiment_id}", customer_ids[idx], ts, "feedback", None, msg, label, round(score, 3), SENTIMENT_MODEL_VERSION)
            )
            ema_neg_sentiment[idx] = 0.8 * ema_neg_sentiment[idx] + 0.2 * (1.0 if label == "negative" else 0.0)

        # ---- transactions: purchases + refunds ----
        purchase_today = alive & (rng.random(n) < (0.0015 + 0.004 * e_full))
        for idx in np.where(purchase_today)[0]:
            txn_id += 1
            amount = round(float(monthly_revenue[idx] * rng.uniform(0.05, 0.3)), 2)
            transactions.append((f"TXN-{txn_id}", customer_ids[idx], random_timestamp(day, rng), "purchase", amount))

        refund_today = alive & (rng.random(n) < (0.0004 + 0.0018 * (1 - e_full)))
        for idx in np.where(refund_today)[0]:
            txn_id += 1
            amount = round(float(monthly_revenue[idx] * rng.uniform(0.2, 1.0)), 2)
            transactions.append((f"TXN-{txn_id}", customer_ids[idx], random_timestamp(day, rng), "refund", amount))

        # ---- churn hazard + sampling ----
        lookback = max(0, t - 30)
        decline_30d = np.clip(engagement[:, lookback] - engagement[:, t], 0, 1)
        tenure_days_t = signup_offset + t

        hazard = base_hazard * np.exp(
            3.6 * decline_30d
            + 2.4 * ema_neg_sentiment
            + 0.55 * np.clip(unresolved_tickets, 0, 5)
            + 0.09 * np.clip(inactivity_streak, 0, 30)
            - 0.85 * np.clip(tenure_days_t / 730.0, 0, 1)
        )
        hazard = np.clip(hazard, 0, 0.2)

        eligible = alive & (tenure_days_t >= min_tenure)
        churn_today = eligible & (rng.random(n) < hazard)
        for idx in np.where(churn_today)[0]:
            event_id += 1
            events.append((f"EVT-{event_id}", customer_ids[idx], "subscription_cancelled", random_timestamp(day, rng)))
        alive[churn_today] = False
        churn_day[churn_today] = t

    # ---- assemble customers table ----------------------------------------
    customer_status = np.where(churn_day >= 0, "churned", "active")
    churn_date = [
        (ANCHOR_DATE + timedelta(days=int(cd))).isoformat() if cd >= 0 else None for cd in churn_day
    ]
    signup_date = [(ANCHOR_DATE - timedelta(days=int(off))).isoformat() for off in signup_offset]

    customers_df = pd.DataFrame(
        {
            "customer_id": customer_ids,
            "name": company_names,
            "contact_name": contact_names,
            "signup_date": signup_date,
            "contract_type": contract_type,
            "subscription_type": subscription_type,
            "monthly_revenue": np.round(monthly_revenue, 2),
            "region": region,
            "industry": industry,
            "customer_status": customer_status,
            "churn_date": churn_date,
        }
    )

    events_df = pd.DataFrame(events, columns=["event_id", "customer_id", "event_type", "event_timestamp"])
    transactions_df = pd.DataFrame(transactions, columns=["transaction_id", "customer_id", "timestamp", "type", "amount"])
    tickets_df = pd.DataFrame(
        tickets,
        columns=[
            "ticket_id", "customer_id", "opened_at", "resolved_at",
            "response_time_hours", "resolution_time_hours", "resolved", "repeat_ticket",
        ],
    )
    sentiments_df = pd.DataFrame(
        sentiments,
        columns=["sentiment_id", "customer_id", "timestamp", "source", "ticket_id", "message", "sentiment_label", "sentiment_score", "model_version"],
    )

    # ---- modeling snapshot: label defined WITHOUT leakage -----------------
    snapshot_date = ANCHOR_DATE + timedelta(days=snapshot_day)
    obs_start_date = snapshot_date - timedelta(days=obs_window)
    alive_at_snapshot = (churn_day == -1) | (churn_day > snapshot_day)
    churns_in_window = (churn_day > snapshot_day) & (churn_day <= snapshot_day + pred_window)

    snapshot_df = pd.DataFrame(
        {
            "customer_id": customer_ids[alive_at_snapshot],
            "snapshot_date": snapshot_date.isoformat(),
            "observation_window_start": obs_start_date.isoformat(),
            "prediction_window_end": (snapshot_date + timedelta(days=pred_window)).isoformat(),
            "tenure_days_at_snapshot": (signup_offset + snapshot_day)[alive_at_snapshot],
            "churned_within_window": churns_in_window[alive_at_snapshot].astype(int),
        }
    )

    return {
        "customers": customers_df,
        "customer_events": events_df,
        "transactions": transactions_df,
        "support_tickets": tickets_df,
        "sentiment_results": sentiments_df,
        "modeling_snapshots": snapshot_df,
        "meta": {
            "seed": seed,
            "n_customers": n,
            "n_alive_at_snapshot": int(alive_at_snapshot.sum()),
            "n_churned_total_by_end_of_sim": int((churn_day >= 0).sum()),
            "n_positive_label": int(churns_in_window[alive_at_snapshot].sum()),
            "positive_rate": float(churns_in_window[alive_at_snapshot].mean()),
            "snapshot_date": snapshot_date.isoformat(),
            "simulation_days": days,
            "anchor_date": ANCHOR_DATE.isoformat(),
        },
    }


def _weights_for(values: list[str], kind: str) -> list[float]:
    if kind == "contract":
        table = {"month-to-month": 0.55, "one-year": 0.30, "two-year": 0.15}
    else:
        table = {"basic": 0.50, "pro": 0.35, "enterprise": 0.15}
    weights = [table.get(v, 1.0 / len(values)) for v in values]
    total = sum(weights)
    return [w / total for w in weights]


def _revenue_for_tier(subscription_type: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    revenue = np.empty(len(subscription_type))
    for tier, (lo, hi) in {"basic": (29, 79), "pro": (99, 299), "enterprise": (499, 2499)}.items():
        mask = subscription_type == tier
        revenue[mask] = rng.uniform(lo, hi, mask.sum())
    return revenue


def write_outputs(result: dict, cfg: PulseMLConfig) -> Path:
    out_dir = cfg.paths.resolve("synthetic_dir")
    for name in ["customers", "customer_events", "transactions", "support_tickets", "sentiment_results", "modeling_snapshots"]:
        result[name].to_csv(out_dir / f"{name}.csv", index=False)
    with open(out_dir / "generation_manifest.json", "w") as f:
        json.dump(result["meta"], f, indent=2)
    return out_dir


def main():
    parser = argparse.ArgumentParser(description="Generate PULSE synthetic application + training data.")
    parser.add_argument("--seed", type=int, default=None, help="Override the seed from training.yaml")
    args = parser.parse_args()

    cfg = load_config()
    result = generate(cfg, seed=args.seed)
    out_dir = write_outputs(result, cfg)

    print("Synthetic data generation complete.")
    print(f"  Output directory: {out_dir}")
    for k, v in result["meta"].items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
