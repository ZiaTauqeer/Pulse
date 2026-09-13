import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RiskBadge } from "@/components/risk-badge";

const RISK_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

export default async function OverviewPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;

  const [totalCustomers, activeCustomers, riskGroups, avgProbability, topRisk, latestModel] =
    await Promise.all([
      prisma.customer.count({ where: { organizationId } }),
      prisma.customer.count({ where: { organizationId, status: "ACTIVE" } }),
      prisma.prediction.groupBy({
        by: ["riskLevel"],
        where: { customer: { organizationId } },
        _count: { _all: true },
      }),
      prisma.prediction.aggregate({
        where: { customer: { organizationId } },
        _avg: { churnProbability: true },
      }),
      prisma.customer.findMany({
        where: { organizationId, prediction: { riskLevel: { in: ["HIGH", "CRITICAL"] } } },
        include: { prediction: true },
        orderBy: { prediction: { churnProbability: "desc" } },
        take: 10,
      }),
      prisma.modelVersion.findFirst({ where: { status: "PRODUCTION" }, orderBy: { trainedAt: "desc" } }),
    ]);

  const riskCounts = Object.fromEntries(RISK_ORDER.map((level) => [level, 0])) as Record<
    (typeof RISK_ORDER)[number],
    number
  >;
  for (const g of riskGroups) riskCounts[g.riskLevel as (typeof RISK_ORDER)[number]] = g._count._all;
  const atRiskCount = riskCounts.HIGH + riskCounts.CRITICAL;
  const maxRiskCount = Math.max(1, ...RISK_ORDER.map((l) => riskCounts[l]));

  return (
    <div className="px-8 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-2xl text-paper-ink">Overview</h1>
        {latestModel && (
          <p className="font-mono text-xs text-ink-400">
            {latestModel.modelId} {latestModel.version}
          </p>
        )}
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 border-y border-paper-400 py-6 sm:grid-cols-4">
        <div>
          <dt className="font-mono text-xs text-ink-400">customers</dt>
          <dd className="mt-1 font-serif text-3xl">{totalCustomers.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="font-mono text-xs text-ink-400">active</dt>
          <dd className="mt-1 font-serif text-3xl">{activeCustomers.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="font-mono text-xs text-ink-400">at-risk (high + critical)</dt>
          <dd className="mt-1 font-serif text-3xl text-risk-high">{atRiskCount.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="font-mono text-xs text-ink-400">avg. churn probability</dt>
          <dd className="mt-1 font-serif text-3xl">
            {avgProbability._avg.churnProbability
              ? `${(avgProbability._avg.churnProbability * 100).toFixed(1)}%`
              : "—"}
          </dd>
        </div>
      </dl>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,320px)_1fr]">
        <section>
          <h2 className="font-serif text-lg">Customer health distribution</h2>
          <div className="mt-4 space-y-3">
            {RISK_ORDER.map((level) => (
              <div key={level} className="flex items-center gap-3">
                <span className="w-20 shrink-0 font-mono text-xs text-ink-400">{level.toLowerCase()}</span>
                <div className="h-2 flex-1 bg-paper-300">
                  <div
                    className="h-2"
                    style={{
                      width: `${(riskCounts[level] / maxRiskCount) * 100}%`,
                      backgroundColor: `var(--color-risk-${level.toLowerCase()})`,
                    }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-xs text-ink-700">
                  {riskCounts[level]}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-lg">Highest-risk customers</h2>
            <Link href="/customers?sort=risk" className="text-xs text-accent-600 hover:underline">
              View all customers
            </Link>
          </div>
          {topRisk.length === 0 ? (
            <p className="mt-4 text-sm text-ink-700">
              No customers currently fall in the high or critical risk band.
            </p>
          ) : (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-paper-400 text-left font-mono text-xs text-ink-400">
                  <th className="pb-2 font-normal">Customer</th>
                  <th className="pb-2 font-normal">Risk</th>
                  <th className="pb-2 pr-0 text-right font-normal">Probability</th>
                </tr>
              </thead>
              <tbody>
                {topRisk.map((c) => (
                  <tr key={c.id} className="border-b border-paper-300">
                    <td className="py-2.5">
                      <Link href={`/customers/${c.id}`} className="hover:text-accent-600 hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-2.5">
                      <RiskBadge level={c.prediction!.riskLevel} />
                    </td>
                    <td className="py-2.5 text-right font-mono">
                      {(c.prediction!.churnProbability * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
