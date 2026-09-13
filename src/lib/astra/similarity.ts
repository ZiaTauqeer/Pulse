import type { CollectionFilter } from "@datastax/astra-db-ts";
import { getCustomerVectorCollection, type CustomerVectorDoc } from "./client";

export type SimilarCustomerResult = {
  customer_id: string;
  similarity: number;
  status: "ACTIVE" | "CHURNED";
  churned_within_window: boolean | null;
};

/**
 * Find customers behaviorally similar to `customerId`, using their
 * already-synced feature vector as the query (see scripts/sync-astra.ts).
 * Optionally restrict to customers who churned, for the spec's example
 * query: "customers similar to ACME who eventually churned."
 */
export async function findSimilarCustomers(
  customerId: string,
  organizationId: string,
  options: { limit?: number; onlyChurned?: boolean } = {}
): Promise<SimilarCustomerResult[]> {
  const collection = await getCustomerVectorCollection();

  // Astra omits $vector from find/findOne results by default (bandwidth -
  // vectors can be large), so it must be explicitly requested via projection.
  const source = await collection.findOne(
    { _id: customerId },
    { projection: { $vector: 1 } }
  ) as (CustomerVectorDoc & { $vector: number[] }) | null;
  if (!source) {
    throw new Error(
      `No behavioral vector found for ${customerId}. Run \`npm run astra:sync\` after seeding to populate Astra.`
    );
  }

  const filter: CollectionFilter<CustomerVectorDoc> = {
    organizationId,
    _id: { $ne: customerId },
    ...(options.onlyChurned ? { status: "CHURNED" } : {}),
  };

  const cursor = collection.find(filter, {
    sort: { $vector: source.$vector },
    limit: options.limit ?? 5,
    includeSimilarity: true,
  });

  const results = await cursor.toArray();
  return results.map((r) => ({
    customer_id: r._id,
    similarity: (r as unknown as { $similarity: number }).$similarity,
    status: r.status,
    churned_within_window: r.churnedWithinWindow,
  }));
}
