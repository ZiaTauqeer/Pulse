/**
 * Turns a CustomerFeatureSnapshot.rawFeatures blob (the same feature
 * vector ml/src/features/build_features.py computes) into a fixed-order,
 * z-score-normalized numeric vector for Astra's cosine similarity search.
 *
 * The feature key list here MUST stay in sync with
 * ml/src/features/definitions.py NUMERIC_FEATURES. If you add a feature
 * there, add it here too (and re-run scripts/sync-astra.ts) or it simply
 * won't be part of the similarity signal - it won't error, so this is
 * worth checking whenever the ML feature set changes.
 */

export const VECTOR_FEATURE_KEYS = [
  "login_count_7d",
  "login_count_30d",
  "feature_use_count_30d",
  "active_days_30d",
  "days_since_last_activity",
  "usage_trend_30_vs_prior30",
  "feature_adoption_ratio",
  "purchase_count_30d",
  "purchase_count_90d",
  "refund_count_90d",
  "refund_rate_90d",
  "revenue_30d",
  "revenue_90d",
  "days_since_last_purchase",
  "support_ticket_count_90d",
  "unresolved_ticket_count",
  "repeat_ticket_rate_90d",
  "avg_response_time_hours_90d",
  "avg_resolution_time_hours_90d",
  "avg_sentiment_90d",
  "negative_sentiment_ratio_90d",
  "sentiment_change_30d_vs_prior60",
  "sentiment_volatility_90d",
  "tenure_days_at_snapshot",
] as const;

export type NormalizationStats = Record<string, { mean: number; std: number }>;

export function computeNormalizationStats(rows: Array<Record<string, unknown>>): NormalizationStats {
  const stats: NormalizationStats = {};
  for (const key of VECTOR_FEATURE_KEYS) {
    const values = rows
      .map((r) => r[key])
      .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
    const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const variance = values.length ? values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length : 1;
    const std = Math.sqrt(variance) || 1; // avoid divide-by-zero for a constant feature
    stats[key] = { mean, std };
  }
  return stats;
}

export function buildVector(rawFeatures: Record<string, unknown>, stats: NormalizationStats): number[] {
  return VECTOR_FEATURE_KEYS.map((key) => {
    const raw = rawFeatures[key];
    const value = typeof raw === "number" && !Number.isNaN(raw) ? raw : stats[key].mean; // missing -> population mean, i.e. z-score 0
    return (value - stats[key].mean) / stats[key].std;
  });
}
