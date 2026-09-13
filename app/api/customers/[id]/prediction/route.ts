import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCustomer } from "@/lib/queries";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const customer = await getCustomer(session.user.organizationId, id);
  if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!customer.prediction) return NextResponse.json({ error: "This customer has not been scored yet." }, { status: 404 });

  const history = await prisma.predictionHistory.findMany({
    where: { customerId: customer.id },
    orderBy: { predictedAt: "asc" },
  });

  return NextResponse.json({
    customer_id: customer.id,
    current: customer.prediction,
    history: history.map((h) => ({
      predicted_at: h.predictedAt.toISOString(),
      churn_probability: h.churnProbability,
      risk_level: h.riskLevel,
    })),
  });
}
