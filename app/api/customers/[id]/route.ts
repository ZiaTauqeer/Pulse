import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCustomer } from "@/lib/queries";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const customer = await getCustomer(session.user.organizationId, id);
  if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: customer.id,
    name: customer.name,
    industry: customer.industry,
    region: customer.region,
    subscription_type: customer.subscriptionType,
    contract_type: customer.contractType,
    monthly_revenue: Number(customer.monthlyRevenue),
    status: customer.status,
    signup_date: customer.signupDate.toISOString(),
    segment: customer.segmentMembership?.segment.name ?? null,
    prediction: customer.prediction,
  });
}
