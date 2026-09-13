/**
 * PULSE database seed script.
 *
 * Loads the ML pipeline's synthetic data (ml/data/synthetic/*.csv) and its
 * real trained-model predictions (via `python -m pipeline.predict
 * --export-csv`) into Postgres. This is the bridge between the two
 * systems described in ml/README.md: training and inference stay in
 * Python; this script only ever reads already-computed CSV output and
 * writes it into the app's database. It never re-implements scoring
 * logic in TypeScript.
 *
 * Prerequisites:
 *   1. Run the full ML pipeline at least once (see ml/README.md Quickstart)
 *      so ml/data/synthetic/*.csv, ml/data/processed/feature_matrix.csv,
 *      and a promoted model in ml/artifacts/metadata/model_registry.json
 *      all exist.
 *   2. `npx prisma generate` (requires normal network access to
 *      binaries.prisma.sh - see README.md "Known environment limitation"
 *      if you're running this in a network-restricted sandbox).
 *   3. `npx prisma migrate dev` (or apply prisma/migrations by hand, as
 *      was done when this project was built - see that migration's header
 *      comment).
 *
 * Run with:
 *   npm run db:seed
 *
 * Configuration (env vars, since this is the kind of thing you'll want to
 * change between a quick local smoke-test and a fuller demo dataset):
 *   SEED_CUSTOMER_LIMIT   - cap the number of customers seeded (default: all)
 *   SEED_BATCH_SIZE       - rows per createMany batch (default: 2000)
 *   ML_DIR                - path to the ml/ directory (default: ../ml)
 */
import { PrismaClient, Role, CustomerStatus, SentimentLabel, RiskLevel, ModelStatus, MessageSender } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const prisma = new PrismaClient();

const ML_DIR = process.env.ML_DIR ?? path.resolve(__dirname, "../ml");
const CUSTOMER_LIMIT = process.env.SEED_CUSTOMER_LIMIT ? parseInt(process.env.SEED_CUSTOMER_LIMIT, 10) : undefined;
const BATCH_SIZE = process.env.SEED_BATCH_SIZE ? parseInt(process.env.SEED_BATCH_SIZE, 10) : 2000;

const ORG_ID = "org_demo";

function readCsv<T = Record<string, string>>(relativePath: string): T[] {
  const fullPath = path.join(ML_DIR, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(
      `Expected ${fullPath} to exist. Run the ML pipeline first - see ml/README.md Quickstart.`
    );
  }
  const raw = fs.readFileSync(fullPath, "utf-8");
  return parse(raw, { columns: true, skip_empty_lines: true }) as T[];
}

async function batchInsert<T>(label: string, rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    await insert(chunk);
    process.stdout.write(`\r  ${label}: ${Math.min(i + BATCH_SIZE, rows.length)} / ${rows.length}`);
  }
  process.stdout.write("\n");
}

function toDecimalString(v: string): string {
  return Number(v).toFixed(2);
}

function nullableDate(v: string | undefined | null): Date | null {
  if (!v || v === "" || v.toLowerCase() === "nan" || v.toLowerCase() === "none") return null;
  return new Date(v);
}

async function seedOrgAndUsers() {
  await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: {},
    create: { id: ORG_ID, name: "PULSE Demo Workspace" },
  });

  // Demo accounts across the RBAC roles described in schema.prisma.
  // Real bcrypt hash (cost 12) of the literal string "pulse-demo-2026",
  // computed and verified with bcryptjs at build time - replace before
  // using this seed data anywhere beyond local development.
  const demoPasswordHash = "$2b$12$SXiR34ug6YRZ2yDexQ0alOwKlqYMENXEzht5..ott9LYeC.3TE2GO";
  const demoUsers: Array<{ username: string; email: string; name: string; role: Role }> = [
    { username: "admin", email: "admin@pulse.demo", name: "Jordan Ellis", role: Role.ADMIN },
    { username: "analyst", email: "analyst@pulse.demo", name: "Priya Raman", role: Role.ANALYST },
    { username: "csmanager", email: "csmanager@pulse.demo", name: "Marcus Webb", role: Role.CS_MANAGER },
    { username: "viewer", email: "viewer@pulse.demo", name: "Sam Ortiz", role: Role.VIEWER },
  ];
  for (const u of demoUsers) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: { passwordHash: demoPasswordHash, email: u.email, name: u.name, role: u.role },
      create: { ...u, organizationId: ORG_ID, passwordHash: demoPasswordHash },
    });
  }
  console.log(`Seeded organization + ${demoUsers.length} demo users (login with username, e.g. "admin" / "pulse-demo-2026")`);
}

async function seedCustomers(): Promise<Set<string>> {
  type Row = {
    customer_id: string; name: string; contact_name: string; signup_date: string;
    contract_type: string; subscription_type: string; monthly_revenue: string;
    region: string; industry: string; customer_status: string; churn_date: string;
  };
  let rows = readCsv<Row>("data/synthetic/customers.csv");
  if (CUSTOMER_LIMIT) rows = rows.slice(0, CUSTOMER_LIMIT);
  const validIds = new Set(rows.map((r) => r.customer_id));

  await batchInsert("Customers", rows, (chunk) =>
    prisma.customer.createMany({
      skipDuplicates: true,
      data: chunk.map((r) => ({
        id: r.customer_id,
        organizationId: ORG_ID,
        name: r.name,
        contactName: r.contact_name,
        signupDate: new Date(r.signup_date),
        contractType: r.contract_type,
        subscriptionType: r.subscription_type,
        monthlyRevenue: toDecimalString(r.monthly_revenue),
        region: r.region,
        industry: r.industry,
        status: r.customer_status === "churned" ? CustomerStatus.CHURNED : CustomerStatus.ACTIVE,
        churnDate: nullableDate(r.churn_date),
      })),
    })
  );
  console.log(`Seeded ${rows.length} customers`);
  return validIds;
}

async function seedEvents(validIds: Set<string>) {
  type Row = { event_id: string; customer_id: string; event_type: string; event_timestamp: string };
  const rows = readCsv<Row>("data/synthetic/customer_events.csv").filter((r) => validIds.has(r.customer_id));

  await batchInsert("Customer events", rows, (chunk) =>
    prisma.customerEvent.createMany({
      data: chunk.map((r) => ({
        customerId: r.customer_id,
        eventType: r.event_type,
        occurredAt: new Date(r.event_timestamp),
      })),
    })
  );
  console.log(`Seeded ${rows.length} customer events`);
}

async function seedTransactions(validIds: Set<string>) {
  type Row = { transaction_id: string; customer_id: string; timestamp: string; type: string; amount: string };
  const rows = readCsv<Row>("data/synthetic/transactions.csv").filter((r) => validIds.has(r.customer_id));

  await batchInsert("Transactions", rows, (chunk) =>
    prisma.transaction.createMany({
      data: chunk.map((r) => ({
        customerId: r.customer_id,
        type: r.type,
        amount: toDecimalString(r.amount),
        occurredAt: new Date(r.timestamp),
      })),
    })
  );
  console.log(`Seeded ${rows.length} transactions`);
}

async function seedTicketsAndMessages(validIds: Set<string>): Promise<Set<string>> {
  type Row = {
    ticket_id: string; customer_id: string; opened_at: string; resolved_at: string;
    response_time_hours: string; resolution_time_hours: string; resolved: string; repeat_ticket: string;
  };
  const rows = readCsv<Row>("data/synthetic/support_tickets.csv").filter((r) => validIds.has(r.customer_id));

  await batchInsert("Support tickets", rows, (chunk) =>
    prisma.supportTicket.createMany({
      data: chunk.map((r) => ({
        id: r.ticket_id,
        customerId: r.customer_id,
        openedAt: new Date(r.opened_at),
        resolvedAt: nullableDate(r.resolved_at),
        responseTimeHours: r.response_time_hours ? parseFloat(r.response_time_hours) : null,
        resolutionTimeHours: r.resolution_time_hours ? parseFloat(r.resolution_time_hours) : null,
        resolved: r.resolved === "True" || r.resolved === "true",
        repeatTicket: r.repeat_ticket === "True" || r.repeat_ticket === "true",
      })),
    })
  );
  console.log(`Seeded ${rows.length} support tickets`);
  return new Set(rows.map((r) => r.ticket_id));
}

async function seedSentiment(validIds: Set<string>, validTicketIds: Set<string>) {
  type Row = {
    sentiment_id: string; customer_id: string; timestamp: string; source: string;
    ticket_id: string; message: string; sentiment_label: string; sentiment_score: string; model_version: string;
  };
  const rows = readCsv<Row>("data/synthetic/sentiment_results.csv").filter((r) => validIds.has(r.customer_id));

  await batchInsert("Sentiment results", rows, (chunk) =>
    prisma.sentimentResult.createMany({
      skipDuplicates: true,
      data: chunk.map((r) => ({
        id: r.sentiment_id,
        customerId: r.customer_id,
        ticketId: r.ticket_id && validTicketIds.has(r.ticket_id) ? r.ticket_id : null,
        source: r.source,
        message: r.message,
        sentimentLabel: r.sentiment_label.toUpperCase() as SentimentLabel,
        sentimentScore: parseFloat(r.sentiment_score),
        modelVersion: r.model_version,
        occurredAt: new Date(r.timestamp),
      })),
    })
  );
  console.log(`Seeded ${rows.length} sentiment results`);

  // Support messages: one representative CUSTOMER message per support-sourced
  // sentiment record (see the SupportMessage model comment in schema.prisma
  // for why this is a simplification of a real multi-message thread).
  const supportRows = rows.filter((r) => r.source === "support" && validTicketIds.has(r.ticket_id));
  await batchInsert("Support messages", supportRows, (chunk) =>
    prisma.supportMessage.createMany({
      data: chunk.map((r) => ({
        ticketId: r.ticket_id,
        sender: MessageSender.CUSTOMER,
        body: r.message,
        sentAt: new Date(r.timestamp),
      })),
    })
  );
  console.log(`Seeded ${supportRows.length} support messages`);
}

async function seedFeatureSnapshots(validIds: Set<string>) {
  type Row = Record<string, string>;
  const rows = readCsv<Row>("data/processed/feature_matrix.csv").filter((r) => validIds.has(r.customer_id));
  const manifest = JSON.parse(fs.readFileSync(path.join(ML_DIR, "artifacts/metadata/feature_manifest.json"), "utf-8"));
  const featureVersion: string = manifest.feature_version;

  // A single global snapshot_date across the current ML pipeline design
  // (see ml/README.md "Extending to rolling snapshots") - read from the
  // generation manifest rather than hardcoded here.
  const genManifest = JSON.parse(fs.readFileSync(path.join(ML_DIR, "data/synthetic/generation_manifest.json"), "utf-8"));
  const snapshotDate = new Date(genManifest.snapshot_date);

  const num = (v: string) => (v === "" || v === undefined ? null : parseFloat(v));

  await batchInsert("Feature snapshots", rows, (chunk) =>
    prisma.customerFeatureSnapshot.createMany({
      skipDuplicates: true,
      data: chunk.map((r) => ({
        customerId: r.customer_id,
        snapshotDate,
        featureVersion,
        loginCount30d: parseInt(r.login_count_30d, 10),
        featureUseCount30d: parseInt(r.feature_use_count_30d, 10),
        daysSinceLastActivity: parseInt(r.days_since_last_activity, 10),
        usageTrend30vsPrior30: parseFloat(r.usage_trend_30_vs_prior30),
        avgSentiment90d: num(r.avg_sentiment_90d),
        negativeSentimentRatio90d: num(r.negative_sentiment_ratio_90d),
        sentimentChange30d: num(r.sentiment_change_30d_vs_prior60),
        unresolvedTicketCount: parseInt(r.unresolved_ticket_count, 10),
        avgResolutionTimeHours90d: num(r.avg_resolution_time_hours_90d),
        revenue90d: toDecimalString(r.revenue_90d),
        refundCount90d: parseInt(r.refund_count_90d, 10),
        refundRate90d: parseFloat(r.refund_rate_90d),
        tenureDaysAtSnapshot: parseInt(r.tenure_days_at_snapshot, 10),
        rawFeatures: r,
      })),
    })
  );
  console.log(`Seeded ${rows.length} feature snapshots`);
}

async function seedModelRegistry() {
  const registry = JSON.parse(fs.readFileSync(path.join(ML_DIR, "artifacts/metadata/model_registry.json"), "utf-8"));
  for (const v of registry.versions) {
    await prisma.modelVersion.upsert({
      where: { modelId_version: { modelId: v.model_id, version: v.version } },
      update: { status: v.status.toUpperCase() as ModelStatus },
      create: {
        modelId: v.model_id,
        version: v.version,
        algorithm: v.algorithm,
        datasetVersion: v.dataset_version,
        featureVersion: v.feature_version,
        trainedAt: new Date(v.trained_at),
        metrics: v.metrics,
        recommendedThreshold: v.recommended_threshold,
        riskBands: v.risk_bands,
        status: v.status.toUpperCase() as ModelStatus,
      },
    });
  }
  console.log(`Seeded ${registry.versions.length} model version(s)`);
  return registry.versions.find((v: any) => v.status === "production") ?? registry.versions[0];
}

async function seedPredictions(validIds: Set<string>) {
  // Run real inference via the ML pipeline rather than re-implementing
  // scoring here - see the file header comment.
  const exportPath = path.join(os.tmpdir(), `pulse-predictions-${Date.now()}.csv`);
  console.log("Running ML pipeline inference (python -m pipeline.predict --export-csv)...");
  execFileSync("python3", ["-m", "pipeline.predict", "--export-csv", exportPath], {
    cwd: ML_DIR,
    stdio: "inherit",
  });

  type Row = {
    customer_id: string; churn_probability: string; risk_level: string;
    model_id: string; model_version: string; recommended_threshold: string; top_contributors_json: string;
  };
  const rows = readCsv<Row>(path.relative(ML_DIR, exportPath)).filter((r) => validIds.has(r.customer_id));
  const now = new Date();

  await batchInsert("Predictions", rows, (chunk) =>
    prisma.$transaction(
      chunk.flatMap((r) => [
        prisma.prediction.upsert({
          where: { customerId: r.customer_id },
          update: {
            churnProbability: parseFloat(r.churn_probability),
            riskLevel: r.risk_level as RiskLevel,
            modelId: r.model_id,
            modelVersion: r.model_version,
            recommendedThreshold: parseFloat(r.recommended_threshold),
            predictedAt: now,
            topContributors: JSON.parse(r.top_contributors_json),
          },
          create: {
            customerId: r.customer_id,
            churnProbability: parseFloat(r.churn_probability),
            riskLevel: r.risk_level as RiskLevel,
            modelId: r.model_id,
            modelVersion: r.model_version,
            recommendedThreshold: parseFloat(r.recommended_threshold),
            predictedAt: now,
            topContributors: JSON.parse(r.top_contributors_json),
          },
        }),
        prisma.predictionHistory.create({
          data: {
            customerId: r.customer_id,
            churnProbability: parseFloat(r.churn_probability),
            riskLevel: r.risk_level as RiskLevel,
            modelVersion: r.model_version,
            predictedAt: now,
          },
        }),
      ])
    )
  );
  fs.unlinkSync(exportPath);
  console.log(`Seeded ${rows.length} predictions (+ history entries) from real model inference`);
}

function preflightCheck() {
  const required = [
    "data/synthetic/customers.csv",
    "data/synthetic/customer_events.csv",
    "data/synthetic/transactions.csv",
    "data/synthetic/support_tickets.csv",
    "data/synthetic/sentiment_results.csv",
    "data/synthetic/generation_manifest.json",
    "data/processed/feature_matrix.csv",
    "artifacts/metadata/feature_manifest.json",
    "artifacts/metadata/model_registry.json",
  ];
  const missing = required.filter((p) => !fs.existsSync(path.join(ML_DIR, p)));
  if (missing.length) {
    throw new Error(
      `Missing ML pipeline output, cannot seed:\n${missing.map((m) => `  - ${m}`).join("\n")}\n\n` +
        `Run the full pipeline first (see ml/README.md Quickstart):\n` +
        `  cd ml && python -m pipeline.generate_synthetic && python -m pipeline.ingest && ` +
        `python -m pipeline.validate && python -m pipeline.build_features && python -m pipeline.split && ` +
        `python -m pipeline.train && python -m pipeline.evaluate && python -m pipeline.explain && ` +
        `python -m pipeline.register --promote`
    );
  }

  const registry = JSON.parse(fs.readFileSync(path.join(ML_DIR, "artifacts/metadata/model_registry.json"), "utf-8"));
  if (!registry.versions.some((v: any) => v.status === "production")) {
    throw new Error(
      "No production model in ml/artifacts/metadata/model_registry.json. " +
        "Run `python -m pipeline.register --promote` in ml/ before seeding."
    );
  }
}

async function main() {
  preflightCheck();
  console.log(`Seeding from ${ML_DIR}${CUSTOMER_LIMIT ? ` (limited to ${CUSTOMER_LIMIT} customers)` : ""}\n`);

  await seedOrgAndUsers();
  const validIds = await seedCustomers();
  await seedEvents(validIds);
  await seedTransactions(validIds);
  const validTicketIds = await seedTicketsAndMessages(validIds);
  await seedSentiment(validIds, validTicketIds);
  await seedFeatureSnapshots(validIds);
  await seedModelRegistry();
  await seedPredictions(validIds);

  console.log("\nSeed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
