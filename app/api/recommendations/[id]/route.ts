import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json()) as { status?: "OPEN" | "DISMISSED" | "COMPLETED" };
  if (!body.status || !["OPEN", "DISMISSED", "COMPLETED"].includes(body.status)) {
    return NextResponse.json({ error: "status must be OPEN, DISMISSED, or COMPLETED" }, { status: 400 });
  }

  const recommendation = await prisma.recommendation.findFirst({
    where: { id, customer: { organizationId: session.user.organizationId } },
  });
  if (!recommendation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.recommendation.update({ where: { id }, data: { status: body.status } });

  void logAction({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: `recommendation_${body.status.toLowerCase()}`,
    targetType: "recommendation",
    targetId: id,
  });

  return NextResponse.json({ recommendation: updated });
}
