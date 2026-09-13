import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { listCustomers } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { buildFeatureDict, validateOnboardingInput, type OnboardingFormInput } from "@/lib/onboarding/feature-mapping";
import { scoreCustomerFeatures, getFeatureVersion, InferenceError } from "@/lib/ml/inference-bridge";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const result = await listCustomers({
    organizationId: session.user.organizationId,
    search: searchParams.get("q") ?? undefined,
    riskLevel: searchParams.get("risk") ?? undefined,
    sortBy: (searchParams.get("sort") as "risk" | "name" | "revenue" | "lastActive") ?? "risk",
    sortDir: (searchParams.get("dir") as "asc" | "desc") ?? "desc",
    page: searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : 1,
  });

  return NextResponse.json({
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    customers: result.rows.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      subscription_type: c.subscriptionType,
      monthly_revenue: Number(c.monthlyRevenue),
      churn_probability: c.prediction?.churnProbability ?? null,
      risk_level: c.prediction?.riskLevel ?? null,
      segment: c.segmentMembership?.segment.name ?? null,
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let input: Partial<OnboardingFormInput>;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const validationError = validateOnboardingInput(input);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  const validInput = input as OnboardingFormInput;

  const customerId = `CUS-${randomUUID().split("-")[0].toUpperCase()}`;
  const featureDict = buildFeatureDict(validInput);

  // 1. Save the customer first - a data-entry mistake in the ML step must
  // never lose the customer record the user just carefully filled out.
  const customer = await prisma.customer.create({
    data: {
      id: customerId,
      organizationId: session.user.organizationId,
      name: validInput.name,
      contactName: validInput.contactName || null,
      signupDate: new Date(validInput.signupDate),
      contractType: validInput.contractType,
      subscriptionType: validInput.subscriptionType,
      monthlyRevenue: validInput.monthlyRevenue,
      region: validInput.region,
      industry: validInput.industry,
      source: "MANUAL",
      createdByUserId: session.user.id,
    },
  });

  void logAction({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "created_customer",
    targetType: "customer",
    targetId: customer.id,
    metadata: { name: customer.name },
  });

  // 2. Persist the feature snapshot regardless of whether inference below
  // succeeds - it's a real record of what was known at creation time and
  // lets "Run Prediction" retry later without re-deriving anything.
  try {
    const featureVersion = await getFeatureVersion();
    const num = (v: unknown) => (typeof v === "number" ? v : null);
    await prisma.customerFeatureSnapshot.create({
      data: {
        customerId: customer.id,
        snapshotDate: new Date(),
        featureVersion,
        loginCount30d: validInput.loginCount30d,
        featureUseCount30d: validInput.featureUseCount30d,
        daysSinceLastActivity: validInput.daysSinceLastActivity,
        usageTrend30vsPrior30: (featureDict.usage_trend_30_vs_prior30 as number) ?? 0,
        avgSentiment90d: num(featureDict.avg_sentiment_90d),
        negativeSentimentRatio90d: num(featureDict.negative_sentiment_ratio_90d),
        sentimentChange30d: num(featureDict.sentiment_change_30d_vs_prior60),
        unresolvedTicketCount: validInput.unresolvedTicketCount,
        avgResolutionTimeHours90d: num(featureDict.avg_resolution_time_hours_90d),
        revenue90d: validInput.revenue90d,
        refundCount90d: validInput.refundCount90d,
        refundRate90d: featureDict.refund_rate_90d as number,
        tenureDaysAtSnapshot: featureDict.tenure_days_at_snapshot as number,
        rawFeatures: featureDict,
      },
    });
  } catch (err) {
    console.error("Failed to save feature snapshot for", customer.id, err);
  }

  // 3. Run real inference. If this fails, the customer is still saved -
  // the response tells the client exactly that, with a real error message,
  // and the customer page's "Run Prediction" button lets them retry.
  try {
    const result = await scoreCustomerFeatures(featureDict, customer.id);

    await prisma.$transaction([
      prisma.prediction.upsert({
        where: { customerId: customer.id },
        update: {
          churnProbability: result.churn_probability,
          riskLevel: result.risk_level,
          modelId: result.model_id,
          modelVersion: result.model_version,
          recommendedThreshold: result.recommended_threshold,
          predictedAt: new Date(),
          topContributors: result.top_contributors,
        },
        create: {
          customerId: customer.id,
          churnProbability: result.churn_probability,
          riskLevel: result.risk_level,
          modelId: result.model_id,
          modelVersion: result.model_version,
          recommendedThreshold: result.recommended_threshold,
          predictedAt: new Date(),
          topContributors: result.top_contributors,
        },
      }),
      prisma.predictionHistory.create({
        data: {
          customerId: customer.id,
          churnProbability: result.churn_probability,
          riskLevel: result.risk_level,
          modelVersion: result.model_version,
          predictedAt: new Date(),
        },
      }),
    ]);

    return NextResponse.json({ customer: { id: customer.id, name: customer.name }, prediction: result }, { status: 201 });
  } catch (err) {
    console.error("Inference failed for new customer", customer.id, err);
    const message = err instanceof InferenceError ? err.message : "Prediction failed for an unexpected reason.";
    return NextResponse.json(
      {
        customer: { id: customer.id, name: customer.name },
        prediction: null,
        predictionError: message,
      },
      { status: 201 }
    );
  }
}
