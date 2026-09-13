"""
Feature manifest: one entry per column that can appear in the final
feature matrix, documenting its category, source table, transformation,
and type. `build_features.py` is the code that actually computes these;
this file is the single source of truth for *describing* them, and is
used both to generate artifacts/metadata/feature_manifest.json and to
sanity-check that build_features.py didn't silently drop or rename a
column.
"""

FEATURE_MANIFEST = [
    # ---- account ----
    {"name": "tenure_days_at_snapshot", "category": "account", "source": "modeling_snapshots", "transformation": "days between signup and snapshot_date", "dtype": "numeric"},
    {"name": "contract_type", "category": "account", "source": "customers", "transformation": "static attribute", "dtype": "categorical"},
    {"name": "subscription_type", "category": "account", "source": "customers", "transformation": "static attribute", "dtype": "categorical"},
    {"name": "monthly_revenue", "category": "account", "source": "customers", "transformation": "static attribute", "dtype": "numeric"},
    {"name": "region", "category": "account", "source": "customers", "transformation": "static attribute", "dtype": "categorical"},
    {"name": "industry", "category": "account", "source": "customers", "transformation": "static attribute", "dtype": "categorical"},

    # ---- usage / behavioral ----
    {"name": "login_count_7d", "category": "usage", "source": "customer_events", "transformation": "count of login events, trailing 7 days from snapshot", "dtype": "numeric"},
    {"name": "login_count_30d", "category": "usage", "source": "customer_events", "transformation": "count of login events, trailing 30 days", "dtype": "numeric"},
    {"name": "feature_use_count_30d", "category": "usage", "source": "customer_events", "transformation": "count of feature_use events, trailing 30 days", "dtype": "numeric"},
    {"name": "active_days_30d", "category": "usage", "source": "customer_events", "transformation": "distinct calendar days with a login or feature_use event, trailing 30 days", "dtype": "numeric"},
    {"name": "days_since_last_activity", "category": "usage", "source": "customer_events", "transformation": "days since last login/feature_use within the 90-day observation window; sentinel (91) if none observed", "dtype": "numeric"},
    {"name": "usage_trend_30_vs_prior30", "category": "usage", "source": "customer_events", "transformation": "log((recent_30d_count+1)/(prior_30d_count+1)); negative = declining activity", "dtype": "numeric"},
    {"name": "feature_adoption_ratio", "category": "usage", "source": "customer_events", "transformation": "feature_use_count_30d / login_count_30d, 0 if no logins", "dtype": "numeric"},

    # ---- commerce ----
    {"name": "purchase_count_30d", "category": "commerce", "source": "transactions", "transformation": "count of purchase transactions, trailing 30 days", "dtype": "numeric"},
    {"name": "purchase_count_90d", "category": "commerce", "source": "transactions", "transformation": "count of purchase transactions, full 90-day observation window", "dtype": "numeric"},
    {"name": "refund_count_90d", "category": "commerce", "source": "transactions", "transformation": "count of refund transactions, full observation window", "dtype": "numeric"},
    {"name": "refund_rate_90d", "category": "commerce", "source": "transactions", "transformation": "refund_count / (purchase_count + refund_count), 0 if no transactions", "dtype": "numeric"},
    {"name": "revenue_30d", "category": "commerce", "source": "transactions", "transformation": "sum of purchase amounts, trailing 30 days", "dtype": "numeric"},
    {"name": "revenue_90d", "category": "commerce", "source": "transactions", "transformation": "sum of purchase amounts, full observation window", "dtype": "numeric"},
    {"name": "days_since_last_purchase", "category": "commerce", "source": "transactions", "transformation": "days since last purchase within observation window; sentinel (91) if none", "dtype": "numeric"},

    # ---- support ----
    {"name": "support_ticket_count_90d", "category": "support", "source": "support_tickets", "transformation": "tickets opened within the 90-day observation window", "dtype": "numeric"},
    {"name": "unresolved_ticket_count", "category": "support", "source": "support_tickets", "transformation": "tickets opened as of snapshot_date whose resolved_at is null OR occurs after snapshot_date (future resolutions are explicitly not counted as resolved, to avoid leakage)", "dtype": "numeric"},
    {"name": "repeat_ticket_rate_90d", "category": "support", "source": "support_tickets", "transformation": "share of tickets in-window flagged repeat (same customer has a prior ticket), 0 if no tickets", "dtype": "numeric"},
    {"name": "avg_response_time_hours_90d", "category": "support", "source": "support_tickets", "transformation": "mean first-response time (hours) for tickets opened in-window; NaN (imputed at train time) if no tickets", "dtype": "numeric"},
    {"name": "avg_resolution_time_hours_90d", "category": "support", "source": "support_tickets", "transformation": "mean resolution time (hours) for in-window tickets resolved as of snapshot_date; NaN if none resolved yet", "dtype": "numeric"},

    # ---- sentiment ----
    {"name": "avg_sentiment_90d", "category": "sentiment", "source": "sentiment_results", "transformation": "mean sentiment_score over the observation window; NaN if no sentiment records", "dtype": "numeric"},
    {"name": "negative_sentiment_ratio_90d", "category": "sentiment", "source": "sentiment_results", "transformation": "share of sentiment records labeled negative in-window; NaN if none", "dtype": "numeric"},
    {"name": "sentiment_change_30d_vs_prior60", "category": "sentiment", "source": "sentiment_results", "transformation": "mean sentiment in trailing 30d minus mean sentiment in the preceding 60d of the window; negative = deteriorating", "dtype": "numeric"},
    {"name": "sentiment_volatility_90d", "category": "sentiment", "source": "sentiment_results", "transformation": "std deviation of sentiment_score over the observation window", "dtype": "numeric"},
]

CATEGORICAL_FEATURES = [f["name"] for f in FEATURE_MANIFEST if f["dtype"] == "categorical"]
NUMERIC_FEATURES = [f["name"] for f in FEATURE_MANIFEST if f["dtype"] == "numeric"]
ALL_FEATURE_NAMES = [f["name"] for f in FEATURE_MANIFEST]

# Features where a missing value legitimately means "no such event was
# observed in the window" and should be imputed with a large sentinel
# rather than a statistical average (see build_features.py).
SENTINEL_FILLED_FEATURES = {"days_since_last_activity", "days_since_last_purchase"}
SENTINEL_VALUE_DAYS = 91  # one more than the 90-day observation window
