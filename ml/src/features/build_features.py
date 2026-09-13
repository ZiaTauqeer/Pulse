"""
Build the final feature matrix from raw synthetic tables.

Every feature is computed using ONLY data that would have been available
at `snapshot_date` for a customer's `observation_window_days`-day lookback.
Two specific leakage traps are guarded against explicitly:

  1. Support ticket resolution: a ticket is only treated as "resolved" for
     unresolved_ticket_count / avg_resolution_time if resolved_at is both
     known AND on-or-before snapshot_date. A ticket that resolves the day
     after the snapshot must still look "unresolved" from the snapshot's
     point of view.
  2. Everything else (logins, purchases, refunds, sentiment) is filtered
     to timestamps within [observation_window_start, snapshot_date] before
     any aggregation happens - nothing outside that window is touched.

Run with:
    python -m pipeline.build_features
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import PulseMLConfig, load_config  # noqa: E402
from ingestion.loader import load_synthetic_tables  # noqa: E402
from validation.data_quality import assert_no_leakage  # noqa: E402
from features.definitions import (  # noqa: E402
    FEATURE_MANIFEST,
    ALL_FEATURE_NAMES,
    SENTINEL_VALUE_DAYS,
)


def _reindex(series: pd.Series, customer_ids: pd.Index, fill_value) -> pd.Series:
    return series.reindex(customer_ids, fill_value=fill_value)


def build_usage_features(events: pd.DataFrame, snap_dt, obs_start_dt, d7, d30, d60, customer_ids) -> pd.DataFrame:
    events = events.copy()
    events["event_timestamp"] = pd.to_datetime(events["event_timestamp"])
    window = events[(events.event_timestamp >= obs_start_dt) & (events.event_timestamp <= snap_dt)]
    activity = window[window.event_type.isin(["login", "feature_use"])]
    logins = window[window.event_type == "login"]
    feature_use = window[window.event_type == "feature_use"]

    login_7d = _reindex(logins[logins.event_timestamp >= d7].groupby("customer_id").size(), customer_ids, 0)
    login_30d = _reindex(logins[logins.event_timestamp >= d30].groupby("customer_id").size(), customer_ids, 0)
    feat_30d = _reindex(feature_use[feature_use.event_timestamp >= d30].groupby("customer_id").size(), customer_ids, 0)

    active_30d = activity[activity.event_timestamp >= d30].groupby("customer_id")["event_timestamp"].apply(
        lambda s: s.dt.date.nunique()
    )
    active_30d = _reindex(active_30d, customer_ids, 0)

    last_activity = activity.groupby("customer_id")["event_timestamp"].max()
    days_since = (snap_dt.normalize() - last_activity.dt.normalize()).dt.days
    days_since = _reindex(days_since, customer_ids, SENTINEL_VALUE_DAYS)

    recent = _reindex(activity[activity.event_timestamp >= d30].groupby("customer_id").size(), customer_ids, 0)
    prior = _reindex(
        activity[(activity.event_timestamp >= d60) & (activity.event_timestamp < d30)].groupby("customer_id").size(),
        customer_ids, 0,
    )
    trend = np.log((recent + 1) / (prior + 1))

    adoption = (feat_30d / login_30d.replace(0, np.nan)).fillna(0.0)

    return pd.DataFrame(
        {
            "login_count_7d": login_7d,
            "login_count_30d": login_30d,
            "feature_use_count_30d": feat_30d,
            "active_days_30d": active_30d,
            "days_since_last_activity": days_since,
            "usage_trend_30_vs_prior30": trend,
            "feature_adoption_ratio": adoption,
        },
        index=customer_ids,
    )


def build_commerce_features(transactions: pd.DataFrame, snap_dt, obs_start_dt, d30, customer_ids) -> pd.DataFrame:
    txns = transactions.copy()
    txns["timestamp"] = pd.to_datetime(txns["timestamp"])
    window = txns[(txns.timestamp >= obs_start_dt) & (txns.timestamp <= snap_dt)]
    purchases = window[window.type == "purchase"]
    refunds = window[window.type == "refund"]

    purchase_30d = _reindex(purchases[purchases.timestamp >= d30].groupby("customer_id").size(), customer_ids, 0)
    purchase_90d = _reindex(purchases.groupby("customer_id").size(), customer_ids, 0)
    refund_90d = _reindex(refunds.groupby("customer_id").size(), customer_ids, 0)
    revenue_30d = _reindex(purchases[purchases.timestamp >= d30].groupby("customer_id")["amount"].sum(), customer_ids, 0.0)
    revenue_90d = _reindex(purchases.groupby("customer_id")["amount"].sum(), customer_ids, 0.0)

    refund_rate = (refund_90d / (purchase_90d + refund_90d).replace(0, np.nan)).fillna(0.0)

    last_purchase = purchases.groupby("customer_id")["timestamp"].max()
    days_since_purchase = (snap_dt.normalize() - last_purchase.dt.normalize()).dt.days
    days_since_purchase = _reindex(days_since_purchase, customer_ids, SENTINEL_VALUE_DAYS)

    return pd.DataFrame(
        {
            "purchase_count_30d": purchase_30d,
            "purchase_count_90d": purchase_90d,
            "refund_count_90d": refund_90d,
            "refund_rate_90d": refund_rate,
            "revenue_30d": revenue_30d,
            "revenue_90d": revenue_90d,
            "days_since_last_purchase": days_since_purchase,
        },
        index=customer_ids,
    )


def build_support_features(tickets: pd.DataFrame, snap_dt, obs_start_dt, customer_ids) -> pd.DataFrame:
    t = tickets.copy()
    t["opened_at"] = pd.to_datetime(t["opened_at"])
    t["resolved_at"] = pd.to_datetime(t["resolved_at"])  # NaT where null

    # Ticket is "resolved as of the snapshot" only if we knew that by snapshot_date.
    t["resolved_as_of_snapshot"] = t.resolved_at.notna() & (t.resolved_at <= snap_dt)

    opened_in_window = t[(t.opened_at >= obs_start_dt) & (t.opened_at <= snap_dt)]

    ticket_count = _reindex(opened_in_window.groupby("customer_id").size(), customer_ids, 0)
    repeat_rate = _reindex(
        opened_in_window.groupby("customer_id")["repeat_ticket"].apply(lambda s: s.astype(bool).mean()),
        customer_ids, 0.0,
    )
    avg_response = _reindex(opened_in_window.groupby("customer_id")["response_time_hours"].mean(), customer_ids, np.nan)

    resolved_in_window = opened_in_window[opened_in_window.resolved_as_of_snapshot]
    avg_resolution = _reindex(resolved_in_window.groupby("customer_id")["resolution_time_hours"].mean(), customer_ids, np.nan)

    # Unresolved-as-of-snapshot uses ALL tickets ever opened up to snapshot_date
    # (not just the 90-day window) since a long-open ticket predating the
    # window is still operationally unresolved right now.
    opened_asof = t[t.opened_at <= snap_dt]
    unresolved = _reindex(
        opened_asof[~opened_asof.resolved_as_of_snapshot].groupby("customer_id").size(),
        customer_ids, 0,
    )

    return pd.DataFrame(
        {
            "support_ticket_count_90d": ticket_count,
            "unresolved_ticket_count": unresolved,
            "repeat_ticket_rate_90d": repeat_rate,
            "avg_response_time_hours_90d": avg_response,
            "avg_resolution_time_hours_90d": avg_resolution,
        },
        index=customer_ids,
    )


def build_sentiment_features(sentiment: pd.DataFrame, snap_dt, obs_start_dt, d30, customer_ids) -> pd.DataFrame:
    s = sentiment.copy()
    s["timestamp"] = pd.to_datetime(s["timestamp"])
    window = s[(s.timestamp >= obs_start_dt) & (s.timestamp <= snap_dt)]

    avg_sentiment = _reindex(window.groupby("customer_id")["sentiment_score"].mean(), customer_ids, np.nan)
    neg_ratio = _reindex(
        window.assign(is_neg=(window.sentiment_label == "negative").astype(int)).groupby("customer_id")["is_neg"].mean(),
        customer_ids, np.nan,
    )
    volatility = _reindex(window.groupby("customer_id")["sentiment_score"].std(), customer_ids, np.nan)

    recent = window[window.timestamp >= d30].groupby("customer_id")["sentiment_score"].mean()
    prior = window[window.timestamp < d30].groupby("customer_id")["sentiment_score"].mean()
    change = (recent - prior)
    change = _reindex(change, customer_ids, np.nan)

    return pd.DataFrame(
        {
            "avg_sentiment_90d": avg_sentiment,
            "negative_sentiment_ratio_90d": neg_ratio,
            "sentiment_change_30d_vs_prior60": change,
            "sentiment_volatility_90d": volatility,
        },
        index=customer_ids,
    )


def build_feature_matrix(cfg: PulseMLConfig) -> pd.DataFrame:
    tables = load_synthetic_tables(cfg)
    snapshots = tables["modeling_snapshots"]
    customers = tables["customers"]

    if snapshots["snapshot_date"].nunique() != 1:
        raise NotImplementedError(
            "This build supports a single global snapshot_date. Extend "
            "build_feature_matrix with per-row window logic if you move "
            "to rolling/multiple snapshots per customer."
        )

    snapshot_date = pd.Timestamp(snapshots["snapshot_date"].iloc[0])
    obs_start_date = pd.Timestamp(snapshots["observation_window_start"].iloc[0])
    snap_dt = snapshot_date + pd.Timedelta(hours=23, minutes=59, seconds=59)
    obs_start_dt = obs_start_date
    d7 = snapshot_date - pd.Timedelta(days=7)
    d30 = snapshot_date - pd.Timedelta(days=30)
    d60 = snapshot_date - pd.Timedelta(days=60)

    customer_ids = pd.Index(snapshots["customer_id"].unique(), name="customer_id")

    usage = build_usage_features(tables["customer_events"], snap_dt, obs_start_dt, d7, d30, d60, customer_ids)
    commerce = build_commerce_features(tables["transactions"], snap_dt, obs_start_dt, d30, customer_ids)
    support = build_support_features(tables["support_tickets"], snap_dt, obs_start_dt, customer_ids)
    sentiment = build_sentiment_features(tables["sentiment_results"], snap_dt, obs_start_dt, d30, customer_ids)

    account = (
        customers.set_index("customer_id")
        .reindex(customer_ids)[["contract_type", "subscription_type", "monthly_revenue", "region", "industry"]]
    )

    base = snapshots.set_index("customer_id").reindex(customer_ids)[
        ["tenure_days_at_snapshot", cfg.target.column]
    ]

    feature_matrix = pd.concat([base, account, usage, commerce, support, sentiment], axis=1)
    feature_matrix = feature_matrix.reset_index()

    feature_columns = [c for c in feature_matrix.columns if c not in ("customer_id", cfg.target.column)]
    missing_from_manifest = set(feature_columns) - set(ALL_FEATURE_NAMES)
    if missing_from_manifest:
        raise ValueError(f"Computed columns not documented in FEATURE_MANIFEST: {missing_from_manifest}")

    assert_no_leakage(feature_columns, cfg)

    return feature_matrix


def write_feature_manifest(cfg: PulseMLConfig, feature_matrix: pd.DataFrame) -> Path:
    manifest = {
        "feature_version": cfg.versioning.feature_version,
        "generated_from": "ml/src/features/build_features.py",
        "n_features": len(FEATURE_MANIFEST),
        "n_rows": len(feature_matrix),
        "target_column": cfg.target.column,
        "features": FEATURE_MANIFEST,
        "excluded_features": cfg.excluded_features,
    }
    out_path = cfg.paths.resolve("metadata_dir") / "feature_manifest.json"
    with open(out_path, "w") as f:
        json.dump(manifest, f, indent=2)
    return out_path


def main():
    cfg = load_config()
    feature_matrix = build_feature_matrix(cfg)

    out_dir = cfg.paths.resolve("processed_dir")
    out_path = out_dir / "feature_matrix.csv"
    feature_matrix.to_csv(out_path, index=False)

    manifest_path = write_feature_manifest(cfg, feature_matrix)

    print(f"Feature matrix written to {out_path}  shape={feature_matrix.shape}")
    print(f"Feature manifest written to {manifest_path}")
    print(f"Positive rate in feature matrix: {feature_matrix[cfg.target.column].mean():.4f}")
    null_report = feature_matrix.isna().sum()
    nonzero_nulls = null_report[null_report > 0]
    if len(nonzero_nulls):
        print("Columns with missing values (expected - imputed at train time):")
        print(nonzero_nulls.to_string())


if __name__ == "__main__":
    main()
