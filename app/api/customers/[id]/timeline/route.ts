import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCustomer, getCustomerTimeline } from "@/lib/queries";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const customer = await getCustomer(session.user.organizationId, id);
  if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const types = searchParams.get("types")?.split(",").filter(Boolean);
  const timeline = await getCustomerTimeline(customer.id, types);

  return NextResponse.json({
    customer_id: customer.id,
    events: timeline.map((e) => ({ type: e.type, occurred_at: e.occurredAt.toISOString(), summary: e.summary })),
  });
}
