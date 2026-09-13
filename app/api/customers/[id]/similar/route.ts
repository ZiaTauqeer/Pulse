import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCustomer } from "@/lib/queries";
import { isAstraConfigured } from "@/lib/astra/client";
import { findSimilarCustomers } from "@/lib/astra/similarity";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const customer = await getCustomer(session.user.organizationId, id);
  if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isAstraConfigured()) {
    return NextResponse.json(
      { error: "Astra DB is not configured. Set ASTRA_DB_API_ENDPOINT and ASTRA_DB_APPLICATION_TOKEN." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  try {
    const results = await findSimilarCustomers(customer.id, session.user.organizationId, {
      onlyChurned: searchParams.get("only_churned") === "true",
      limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 5,
    });
    return NextResponse.json({ source_customer_id: customer.id, similar_customers: results });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Similarity search failed." }, { status: 500 });
  }
}
