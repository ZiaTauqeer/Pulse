/**
 * Translates the "Add Customer" form into the exact feature dict the
 * trained model expects (ml/src/features/definitions.py ALL_FEATURE_NAMES
 * is the authoritative list this must stay in sync with - see that file
 * before changing anything here).
 *
 * A brand new customer has no event history for build_features.py to
 * aggregate, so instead of pretending to compute 90 days of behavioral
 * history, the form asks directly for the same signal categories the
 * model needs (login counts, ticket counts, a plain-language sentiment
 * read) and this module does the same derived-field math
 * build_features.py does (feature_adoption_ratio, refund_rate_90d) so the
 * two stay numerically consistent. Anything genuinely impossible to ask a
 * human for directly (sentiment_volatility_90d) is left null and handled
 * by the model's own imputer - the same one used at training time - not
 * a second, invented default.
 */

export type OnboardingFormInput = {
  // Account
  name: string;
  contactName?: string;
  region: string;
  industry: string;
  contractType: string;
  subscriptionType: string;
  monthlyRevenue: number;
  signupDate: string; // ISO date

  // Engagement
  loginCount7d: number;
  loginCount30d: number;
  featureUseCount30d: number;
  activeDays30d: number;
  daysSinceLastActivity: number;
  usageTrend: "increasing" | "stable" | "decreasing" | "unknown";

  // Commerce
  purchaseCount30d: number;
  purchaseCount90d: number;
  refundCount90d: number;
  revenue30d: number;
  revenue90d: number;
  daysSinceLastPurchase: number | null; // null = no purchases yet

  // Support
  supportTicketCount90d: number;
  unresolvedTicketCount: number;
  repeatTicketRatePercent: number; // 0-100
  avgResponseTimeHours: number | null;
  avgResolutionTimeHours: number | null;

  // Sentiment
  overallSentiment: "positive" | "neutral" | "negative" | "unknown";
  sentimentTrend: "improving" | "stable" | "worsening" | "unknown";
};

const USAGE_TREND_VALUE: Record<OnboardingFormInput["usageTrend"], number | null> = {
  increasing: 0.3,
  stable: 0.0,
  decreasing: -0.3,
  unknown: null,
};

const SENTIMENT_VALUE: Record<OnboardingFormInput["overallSentiment"], number | null> = {
  positive: 0.5,
  neutral: 0.0,
  negative: -0.5,
  unknown: null,
};

const NEGATIVE_SENTIMENT_RATIO_VALUE: Record<OnboardingFormInput["overallSentiment"], number | null> = {
  positive: 0.1,
  neutral: 0.3,
  negative: 0.7,
  unknown: null,
};

const SENTIMENT_TREND_VALUE: Record<OnboardingFormInput["sentimentTrend"], number | null> = {
  improving: 0.2,
  stable: 0.0,
  worsening: -0.2,
  unknown: null,
};

/** Days between signup and "today" - matches tenure_days_at_snapshot's definition exactly. */
export function computeTenureDays(signupDate: string): number {
  const days = Math.floor((Date.now() - new Date(signupDate).getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

export function buildFeatureDict(input: OnboardingFormInput): Record<string, number | string | null> {
  const featureAdoptionRatio = input.loginCount30d > 0 ? input.featureUseCount30d / input.loginCount30d : 0;
  const totalCommerceEvents90d = input.purchaseCount90d + input.refundCount90d;
  const refundRate90d = totalCommerceEvents90d > 0 ? input.refundCount90d / totalCommerceEvents90d : 0;

  return {
    // account
    tenure_days_at_snapshot: computeTenureDays(input.signupDate),
    contract_type: input.contractType,
    subscription_type: input.subscriptionType,
    monthly_revenue: input.monthlyRevenue,
    region: input.region,
    industry: input.industry,
    // usage
    login_count_7d: input.loginCount7d,
    login_count_30d: input.loginCount30d,
    feature_use_count_30d: input.featureUseCount30d,
    active_days_30d: input.activeDays30d,
    days_since_last_activity: input.daysSinceLastActivity,
    usage_trend_30_vs_prior30: USAGE_TREND_VALUE[input.usageTrend],
    feature_adoption_ratio: featureAdoptionRatio,
    // commerce
    purchase_count_30d: input.purchaseCount30d,
    purchase_count_90d: input.purchaseCount90d,
    refund_count_90d: input.refundCount90d,
    refund_rate_90d: refundRate90d,
    revenue_30d: input.revenue30d,
    revenue_90d: input.revenue90d,
    days_since_last_purchase: input.daysSinceLastPurchase,
    // support
    support_ticket_count_90d: input.supportTicketCount90d,
    unresolved_ticket_count: input.unresolvedTicketCount,
    repeat_ticket_rate_90d: input.repeatTicketRatePercent / 100,
    avg_response_time_hours_90d: input.avgResponseTimeHours,
    avg_resolution_time_hours_90d: input.avgResolutionTimeHours,
    // sentiment
    avg_sentiment_90d: SENTIMENT_VALUE[input.overallSentiment],
    negative_sentiment_ratio_90d: NEGATIVE_SENTIMENT_RATIO_VALUE[input.overallSentiment],
    sentiment_change_30d_vs_prior60: SENTIMENT_TREND_VALUE[input.sentimentTrend],
    sentiment_volatility_90d: null, // no reasonable way to ask a human for this directly - model's imputer handles it
  };
}

export function validateOnboardingInput(input: Partial<OnboardingFormInput>): string | null {
  if (!input.name?.trim()) return "Customer/company name is required.";
  if (!input.region) return "Region is required.";
  if (!input.industry) return "Industry is required.";
  if (!input.contractType) return "Contract type is required.";
  if (!input.subscriptionType) return "Subscription type is required.";
  if (input.monthlyRevenue === undefined || input.monthlyRevenue < 0) return "Monthly revenue must be a positive number.";
  if (!input.signupDate) return "Signup date is required.";
  if (new Date(input.signupDate) > new Date()) return "Signup date can't be in the future.";
  return null;
}
