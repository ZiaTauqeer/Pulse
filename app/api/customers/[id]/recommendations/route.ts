import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCustomer } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { generateRecommendation } from "@/lib/ai/recommendations";
import { logAction } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const customer = await getCustomer(session.user.organizationId, id);
  if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const recommendations = await prisma.recommendation.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ recommendations });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const customer = await getCustomer(session.user.organizationId, id);
  if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const recommendation = await generateRecommendation(customer.id, session.user.organizationId);
    void logAction({
      organizationId: session.user.organizationId,
      userId: session.user.id,
      action: "generated_recommendation",
      targetType: "customer",
      targetId: customer.id,
    });
    return NextResponse.json({ recommendation });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to generate recommendation." }, { status: 500 });
  }
}
