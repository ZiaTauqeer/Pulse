/**
 * Runs the K-means segmentation pipeline (Python) and syncs the result
 * into Postgres (Segment + SegmentMembership).
 *
 * Full replace each run, not an upsert-by-id: K-means cluster indices
 * aren't stable across re-runs (cluster 0 this time might correspond to
 * cluster 2 next time even with similar underlying groups), so keeping
 * old Segment rows around and trying to match them up would be
 * misleading. Every run replaces the org's segments entirely.
 *
 * Run with:
 *   npm run segments:sync
 */
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const prisma = new PrismaClient();
const ML_DIR = process.env.ML_DIR ?? path.resolve(__dirname, "../ml");
const ORG_ID = process.env.SEGMENT_ORG_ID ?? "org_demo";

type SegmentationReport = {
  n_clusters: number;
  random_state: number;
  clustering_features: string[];
  segments: Array<{
    cluster_id: number;
    name: string;
    description: string;
    size: number;
    avg_revenue: number;
    avg_churn_probability: number | null;
    avg_login_count_30d: number;
    avg_sentiment_90d: number | null;
    dominant_industry: string | null;
    customer_ids: string[];
  }>;
};

async function main() {
  console.log("Running K-means segmentation (python -m pipeline.segment)...");
  execFileSync("python3", ["-m", "pipeline.segment"], { cwd: ML_DIR, stdio: "inherit" });

  const reportPath = path.join(ML_DIR, "artifacts/reports/segmentation_report.json");
  const report: SegmentationReport = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  const modelVersion = `kmeans-k${report.n_clusters}-seed${report.random_state}`;

  const validCustomerIds = new Set(
    (await prisma.customer.findMany({ where: { organizationId: ORG_ID }, select: { id: true } })).map(
      (c: { id: string }) => c.id
    )
  );

  // Replace: clear memberships for this org's customers, then delete
  // orphaned segments (ones with no remaining memberships anywhere).
  await prisma.segmentMembership.deleteMany({ where: { customer: { organizationId: ORG_ID } } });
  await prisma.segment.deleteMany({ where: { memberships: { none: {} } } });

  let totalAssigned = 0;
  for (const seg of report.segments) {
    const segment = await prisma.segment.create({
      data: {
        name: seg.name,
        description: seg.description,
        modelVersion,
        characteristics: {
          size: seg.size,
          avg_revenue: seg.avg_revenue,
          avg_churn_probability: seg.avg_churn_probability,
          avg_login_count_30d: seg.avg_login_count_30d,
          avg_sentiment_90d: seg.avg_sentiment_90d,
          dominant_industry: seg.dominant_industry,
          clustering_features: report.clustering_features,
        },
      },
    });

    const memberIds = seg.customer_ids.filter((id) => validCustomerIds.has(id));
    for (let i = 0; i < memberIds.length; i += 500) {
      const batch = memberIds.slice(i, i + 500);
      await prisma.segmentMembership.createMany({
        data: batch.map((customerId) => ({ customerId, segmentId: segment.id })),
        skipDuplicates: true,
      });
    }
    totalAssigned += memberIds.length;
    console.log(`  ${seg.name}: ${memberIds.length} customers`);
  }

  console.log(`\nDone. ${report.segments.length} segments, ${totalAssigned} customers assigned.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
