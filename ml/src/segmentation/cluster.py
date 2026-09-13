"""
Customer segmentation via K-means over engagement, revenue, support, and
sentiment features (spec section 46/13).

Segment names are never hardcoded strings picked by hand - see
`label_cluster()` below. Each cluster's centroid is compared to the
overall population on five interpretable axes (value, engagement, support
burden, sentiment, churn risk); the two axes where a cluster deviates most
from the population become its name, e.g. "High value / Low engagement".
This is a deterministic function of the actual cluster centroids: re-run
with the same data and seed, get the same names.

Run with:
    python -m pipeline.segment
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import PulseMLConfig, load_config  # noqa: E402

# Features used for clustering - a curated subset of the full 29-feature
# model input, chosen for interpretability (spec explicitly names
# "engagement, revenue, and support features"), not the full feature set.
CLUSTERING_FEATURES = [
    "monthly_revenue",
    "login_count_30d",
    "feature_use_count_30d",
    "tenure_days_at_snapshot",
    "support_ticket_count_90d",
    "unresolved_ticket_count",
    "avg_sentiment_90d",
]

# The five interpretable "labeling axes" used to name clusters. Each maps
# to one or more of the clustering features (some combined), plus churn
# probability (not itself a clustering feature - it's the model's own
# output - it participates in labeling for interpretability, not fitting,
# so segmentation stays a description of customer BEHAVIOR rather than a
# repackaging of the churn score).
def compute_labeling_axes(df: pd.DataFrame) -> pd.DataFrame:
    axes = pd.DataFrame(index=df.index)
    axes["value"] = df["monthly_revenue"]
    axes["engagement"] = df["login_count_30d"] + df["feature_use_count_30d"]
    axes["support_burden"] = df["support_ticket_count_90d"] + 2 * df["unresolved_ticket_count"]
    axes["sentiment"] = df["avg_sentiment_90d"].fillna(0.0)
    axes["risk"] = df["churn_probability"].fillna(df["churn_probability"].mean())
    return axes


LABEL_DESCRIPTORS = {
    "value": {"high": "High value", "low": "Low value"},
    "engagement": {"high": "Highly engaged", "low": "Low engagement"},
    "support_burden": {"high": "Support-heavy", "low": None},  # low support burden isn't a distinguishing positive
    "sentiment": {"high": None, "low": "Dissatisfied"},
    "risk": {"high": "At-risk", "low": "Healthy"},
}


def label_cluster(cluster_z_scores: pd.Series, min_z_to_mention: float = 0.35) -> tuple[str, str]:
    """Pick the (up to) two most distinguishing axes for a cluster's
    centroid and turn them into a human-readable name + description."""
    candidates = []
    for axis, z in cluster_z_scores.items():
        direction = "high" if z > 0 else "low"
        descriptor = LABEL_DESCRIPTORS[axis][direction]
        if descriptor and abs(z) >= min_z_to_mention:
            candidates.append((abs(z), descriptor, axis, z))

    candidates.sort(key=lambda c: c[0], reverse=True)
    top = candidates[:2]

    if not top:
        return "Typical customers", "No axis stands out strongly from the overall population for this group."

    name = " / ".join(c[1] for c in top)
    description_parts = [f"{c[1]} (z={c[3]:+.2f} vs. population)" for c in top]
    description = "Characterized by: " + "; ".join(description_parts) + "."
    return name, description


def run_segmentation(cfg: PulseMLConfig, n_clusters: int = 4, random_state: int | None = None) -> dict:
    random_state = random_state if random_state is not None else cfg.random_seed

    from inference.predict import load_production_bundle
    from features.definitions import ALL_FEATURE_NAMES

    feature_matrix = pd.read_csv(cfg.paths.resolve("processed_dir") / "feature_matrix.csv")
    customers = pd.read_csv(cfg.paths.resolve("synthetic_dir") / "customers.csv")[
        ["customer_id", "monthly_revenue", "name", "industry"]
    ]

    df = feature_matrix.merge(customers, on="customer_id", how="left", suffixes=("", "_acct"))
    df["monthly_revenue"] = df["monthly_revenue_acct"].fillna(df.get("monthly_revenue", 0))

    # Churn probability participates only in cluster *labeling*
    # (interpretability), not in fitting - segmentation describes customer
    # behavior, not a repackaging of the churn score. Computed fresh from
    # the real production model, not a stale export.
    bundle, _entry = load_production_bundle(cfg)
    X_all = df[ALL_FEATURE_NAMES]
    X_all_t = bundle["preprocessor"].transform(X_all)
    df["churn_probability"] = bundle["calibrated_model"].predict_proba(X_all_t)[:, 1]

    X = df[CLUSTERING_FEATURES].copy()
    for col in X.columns:
        X[col] = X[col].fillna(X[col].median())

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    kmeans = KMeans(n_clusters=n_clusters, random_state=random_state, n_init=10)
    cluster_ids = kmeans.fit_predict(X_scaled)
    df["cluster"] = cluster_ids

    axes = compute_labeling_axes(df)
    axes_z = (axes - axes.mean()) / axes.std(ddof=0).replace(0, 1)
    axes_z["cluster"] = cluster_ids

    segments = []
    for cluster_id in sorted(df["cluster"].unique()):
        cluster_df = df[df["cluster"] == cluster_id]
        cluster_axes_z = axes_z[axes_z["cluster"] == cluster_id].drop(columns="cluster").mean()
        name, description = label_cluster(cluster_axes_z)

        dominant_industry = cluster_df["industry"].mode().iloc[0] if len(cluster_df) else None

        segments.append(
            {
                "cluster_id": int(cluster_id),
                "name": name,
                "description": description,
                "size": int(len(cluster_df)),
                "avg_revenue": float(cluster_df["monthly_revenue"].mean()),
                "avg_churn_probability": float(cluster_df["churn_probability"].mean()) if cluster_df["churn_probability"].notna().any() else None,
                "avg_login_count_30d": float(cluster_df["login_count_30d"].mean()),
                "avg_sentiment_90d": float(cluster_df["avg_sentiment_90d"].mean()) if cluster_df["avg_sentiment_90d"].notna().any() else None,
                "dominant_industry": dominant_industry,
                "customer_ids": cluster_df["customer_id"].tolist(),
            }
        )

    return {
        "n_clusters": n_clusters,
        "random_state": random_state,
        "clustering_features": CLUSTERING_FEATURES,
        "segments": segments,
    }


def main():
    cfg = load_config()
    result = run_segmentation(cfg)

    out_path = cfg.paths.resolve("reports_dir") / "segmentation_report.json"
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2)

    print(f"Segmentation report written to {out_path}")
    for seg in result["segments"]:
        revenue_str = f"avg_revenue=${seg['avg_revenue']:.0f}"
        churn_str = f"avg_churn={seg['avg_churn_probability']:.3f}" if seg["avg_churn_probability"] is not None else "avg_churn=n/a"
        print(f"  [{seg['name']:<32s}] n={seg['size']:4d} {revenue_str} {churn_str}")


if __name__ == "__main__":
    main()
