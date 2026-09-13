import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function riskByDimension(organizationId: string, dimension: "subscriptionType" | "contractType") {
  const customers = await prisma.customer.findMany({
    where: { organizationId },
    select: { [dimension]: true, prediction: { select: { riskLevel: true } } },
  });
  const buckets = new Map<string, { total: number; atRisk: number }>();
  for (const c of customers) {
    const key = (c as Record<string, unknown>)[dimension] as string;
    const bucket = buckets.get(key) ?? { total: 0, atRisk: 0 };
    bucket.total += 1;
    const risk = (c as { prediction?: { riskLevel: string } }).prediction?.riskLevel;
    if (risk === "HIGH" || risk === "CRITICAL") bucket.atRisk += 1;
    buckets.set(key, bucket);
  }
  return Array.from(buckets.entries())
    .map(([key, v]) => ({ key, ...v, rate: v.total ? v.atRisk / v.total : 0 }))
    .sort((a, b) => b.rate - a.rate);
}

export default async function ChurnIntelligencePage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;

  const [bySubscription, byContract] = await Promise.all([
    riskByDimension(organizationId, "subscriptionType"),
    riskByDimension(organizationId, "contractType"),
  ]);

  return (
    <div className="px-8 py-8">
      <h1 className="font-serif text-2xl">Churn intelligence</h1>
      <p className="mt-2 max-w-xl text-sm text-ink-700">
        Share of customers currently in the high or critical risk band, broken down by account
        attributes. Computed live from current predictions.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <RiskBreakdown title="By subscription type" rows={bySubscription} />
        <RiskBreakdown title="By contract type" rows={byContract} />
      </div>
    </div>
  );
}

function RiskBreakdown({ title, rows }: { title: string; rows: Array<{ key: string; total: number; atRisk: number; rate: number }> }) {
  return (
    <section>
      <h2 className="font-serif text-lg">{title}</h2>
      <div className="mt-4 space-y-3">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-sm text-ink-700">{r.key}</span>
            <div className="h-2 flex-1 bg-paper-300">
              <div className="h-2 bg-risk-high" style={{ width: `${r.rate * 100}%` }} />
            </div>
            <span className="w-24 shrink-0 text-right font-mono text-xs text-ink-500">
              {r.atRisk}/{r.total} ({(r.rate * 100).toFixed(0)}%)
            </span>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-ink-700">No data yet.</p>}
      </div>
    </section>
  );
}
