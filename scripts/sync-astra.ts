/**
 * Sync every customer's engineered feature vector from Postgres into
 * Astra DB, for behavioral similarity search.
 *
 * Separate from prisma/seed.ts because Astra is optional infrastructure -
 * you can run PULSE fully without it (the AI assistant's
 * search_similar_customers tool just returns a clear "not configured"
 * message instead of results). Run this after prisma/seed.ts, and again
 * any time you re-run the ML pipeline and reseed feature snapshots.
 *
 * Run with:
 *   npm run astra:sync
 */
import { PrismaClient } from "@prisma/client";
import { getCustomerVectorCollection, isAstraConfigured } from "../src/lib/astra/client";
import { buildVector, computeNormalizationStats } from "../src/lib/astra/vectors";

const prisma = new PrismaClient();

type SnapshotWithCustomer = {
  customerId: string;
  rawFeatures: unknown;
  customer: { organizationId: string; status: "ACTIVE" | "CHURNED" };
};

async function main() {
  if (!isAstraConfigured()) {
    console.error(
      "ASTRA_DB_API_ENDPOINT / ASTRA_DB_APPLICATION_TOKEN are not set. Set them in .env " +
        "(see .env.example) before running this script."
    );
    process.exit(1);
  }

  const snapshots = await prisma.customerFeatureSnapshot.findMany({
    include: { customer: { select: { organizationId: true, status: true } } },
    orderBy: { snapshotDate: "desc" },
    distinct: ["customerId"],
  });

  if (snapshots.length === 0) {
    console.error("No feature snapshots found in Postgres. Run prisma/seed.ts first.");
    process.exit(1);
  }

  const rawRows = snapshots.map((s: SnapshotWithCustomer) => s.rawFeatures as Record<string, unknown>);
  const stats = computeNormalizationStats(rawRows);

  const collection = await getCustomerVectorCollection();

  let synced = 0;
  const BATCH_SIZE = 20;
  for (let i = 0; i < snapshots.length; i += BATCH_SIZE) {
    const batch = snapshots.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((s: SnapshotWithCustomer) => {
        const vector = buildVector(s.rawFeatures as Record<string, unknown>, stats);
        const churnedWithinWindow = (s.rawFeatures as Record<string, unknown>)["churned_within_window"];
        return collection.updateOne(
          { _id: s.customerId },
          {
            $set: {
              organizationId: s.customer.organizationId,
              status: s.customer.status,
              churnedWithinWindow: typeof churnedWithinWindow === "number" ? churnedWithinWindow === 1 : null,
              $vector: vector,
            },
          },
          { upsert: true }
        );
      })
    );
    synced += batch.length;
    process.stdout.write(`\rSynced ${synced} / ${snapshots.length}`);
  }
  console.log(`\nDone. ${synced} customer vectors synced to Astra collection.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
