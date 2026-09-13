import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function AnalyticsPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;

  const [sentimentGroups, revenueAtRisk, totalRevenue, probabilityBuckets] = await Promise.all([
    prisma.sentimentResult.groupBy({
      by: ["sentimentLabel"],
      where: { customer: { organizationId } },
      _count: { _all: true },
    }),
    prisma.customer.aggregate({
      where: { organizationId, prediction: { riskLevel: { in: ["HIGH", "CRITICAL"] } } },
      _sum: { monthlyRevenue: true },
    }),
    prisma.customer.aggregate({ where: { organizationId }, _sum: { monthlyRevenue: true } }),
    prisma.$queryRaw<Array<{ bucket: string; count: bigint }>>`
      SELECT
        CASE
          WHEN "churnProbability" < 0.1 THEN '0-10%'
          WHEN "churnProbability" < 0.2 THEN '10-20%'
          WHEN "churnProbability" < 0.3 THEN '20-30%'
          ELSE '30%+'
        END as bucket,
        count(*)::bigint as count
      FROM "Prediction" p
      JOIN "Customer" c ON c.id = p."customerId"
      WHERE c."organizationId" = ${organizationId}
      GROUP BY bucket
    `,
  ]);

  const revenueAtRiskAmount = Number(revenueAtRisk._sum.monthlyRevenue ?? 0);
  const totalRevenueAmount = Number(totalRevenue._sum.monthlyRevenue ?? 0);

  return (
    <div className="px-8 py-8">
      <h1 className="font-serif text-2xl">Analytics</h1>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <section>
          <h2 className="font-serif text-lg">Monthly revenue at risk</h2>
          <p className="mt-3 font-serif text-3xl">
            ${revenueAtRiskAmount.toLocaleString()}
            <span className="ml-2 font-mono text-sm text-ink-400">
              / ${totalRevenueAmount.toLocaleString()} total
            </span>
          </p>
          <p className="mt-2 text-sm text-ink-700">
            From customers currently in the high or critical risk band.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg">Sentiment distribution</h2>
          <div className="mt-4 space-y-3">
            {sentimentGroups.map((g) => (
              <div key={g.sentimentLabel} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs capitalize text-ink-500">
                  {g.sentimentLabel.toLowerCase()}
                </span>
                <div className="h-2 flex-1 bg-paper-300">
                  <div
                    className="h-2 bg-accent-500"
                    style={{
                      width: `${(g._count._all / sentimentGroups.reduce((s, x) => s + x._count._all, 0)) * 100}%`,
                    }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-xs text-ink-500">
                  {g._count._all}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-10">
        <h2 className="font-serif text-lg">Churn probability distribution</h2>
        <div className="mt-4 flex items-end gap-4">
          {probabilityBuckets.map((b) => (
            <div key={b.bucket} className="flex flex-col items-center gap-2">
              <span className="font-mono text-xs text-ink-500">{Number(b.count)}</span>
              <div
                className="w-12 bg-accent-500"
                style={{ height: `${Math.max(8, Number(b.count) * 2)}px` }}
              />
              <span className="text-xs text-ink-400">{b.bucket}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
