import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCustomer } from "@/lib/queries";
import { logAction } from "@/lib/audit";
import { scoreCustomerFeatures, InferenceError } from "@/lib/ml/inference-bridge";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const customer = await getCustomer(session.user.organizationId, id);
  if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const snapshot = await prisma.customerFeatureSnapshot.findFirst({
    where: { customerId: customer.id },
    orderBy: { snapshotDate: "desc" },
  });
  if (!snapshot) {
    return NextResponse.json(
      { error: "No feature data on file for this customer yet - it can't be scored." },
      { status: 400 }
    );
  }

  try {
    const result = await scoreCustomerFeatures(snapshot.rawFeatures as Record<string, unknown>, customer.id);

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

    void logAction({
      organizationId: session.user.organizationId,
      userId: session.user.id,
      action: "reran_prediction",
      targetType: "customer",
      targetId: customer.id,
    });

    return NextResponse.json({ prediction: result });
  } catch (err) {
    console.error("Re-run prediction failed for", customer.id, err);
    const message = err instanceof InferenceError ? err.message : "Prediction failed for an unexpected reason.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
