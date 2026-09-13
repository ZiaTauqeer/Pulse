import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getOrgSummary } from "@/lib/queries";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const summary = await getOrgSummary(session.user.organizationId);
  return NextResponse.json({
    total_customers: summary.total,
    active_customers: summary.active,
    average_churn_probability: summary.avgProbability,
    risk_distribution: Object.fromEntries(summary.riskGroups.map((g) => [g.riskLevel, g._count._all])),
  });
}
