import type { RiskLevel } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RiskBadge } from "@/components/risk-badge";

type Characteristics = {
  size: number;
  avg_revenue: number;
  avg_churn_probability: number | null;
  avg_login_count_30d: number;
  avg_sentiment_90d: number | null;
  dominant_industry: string | null;
  clustering_features: string[];
};

type MemberCustomer = {
  id: string;
  name: string;
  industry: string;
  monthlyRevenue: unknown;
  prediction: { riskLevel: RiskLevel; churnProbability: number } | null;
};

export default async function SegmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  const segment = await prisma.segment.findFirst({
    where: { id, memberships: { some: { customer: { organizationId: session!.user.organizationId } } } },
    include: {
      memberships: {
        include: { customer: { include: { prediction: true } } },
      },
    },
  });
  if (!segment) notFound();

  const characteristics = segment.characteristics as unknown as Characteristics;
  const customers = segment.memberships.map((m: { customer: MemberCustomer }) => m.customer);

  const riskCounts: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  const industryCounts = new Map<string, number>();
  for (const c of customers) {
    if (c.prediction) riskCounts[c.prediction.riskLevel] = (riskCounts[c.prediction.riskLevel] ?? 0) + 1;
    industryCounts.set(c.industry, (industryCounts.get(c.industry) ?? 0) + 1);
  }
  const topIndustries = Array.from(industryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="px-8 py-8">
      <Link href="/segments" className="text-xs text-accent-600 hover:underline">
        ← All segments
      </Link>
      <h1 className="mt-3 font-serif text-2xl">{segment.name}</h1>
      <p className="mt-2 max-w-xl text-sm text-ink-700">{segment.description}</p>

      <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 border-y border-paper-400 py-6 sm:grid-cols-4">
        <div>
          <dt className="font-mono text-xs text-ink-400">customers</dt>
          <dd className="mt-1 font-serif text-3xl">{characteristics.size}</dd>
        </div>
        <div>
          <dt className="font-mono text-xs text-ink-400">avg. revenue</dt>
          <dd className="mt-1 font-serif text-3xl">${characteristics.avg_revenue?.toFixed(0)}</dd>
        </div>
        <div>
          <dt className="font-mono text-xs text-ink-400">avg. churn probability</dt>
          <dd className="mt-1 font-serif text-3xl">
            {characteristics.avg_churn_probability !== null ? `${(characteristics.avg_churn_probability * 100).toFixed(1)}%` : "—"}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-xs text-ink-400">avg. logins/30d</dt>
          <dd className="mt-1 font-serif text-3xl">{characteristics.avg_login_count_30d?.toFixed(1)}</dd>
        </div>
      </dl>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <section>
          <h2 className="font-serif text-lg">Risk distribution</h2>
          <div className="mt-4 space-y-3">
            {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map((level) => (
              <div key={level} className="flex items-center gap-3">
                <span className="w-20 shrink-0 font-mono text-xs text-ink-400">{level.toLowerCase()}</span>
                <div className="h-2 flex-1 bg-paper-300">
                  <div
                    className="h-2"
                    style={{
                      width: `${(riskCounts[level] / Math.max(1, customers.length)) * 100}%`,
                      backgroundColor: `var(--color-risk-${level.toLowerCase()})`,
                    }}
                  />
                </div>
                <span className="w-10 text-right font-mono text-xs text-ink-700">{riskCounts[level]}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-serif text-lg">Dominant industries</h2>
          <ul className="mt-4 space-y-2">
            {topIndustries.map(([industry, count]) => (
              <li key={industry} className="flex justify-between text-sm">
                <span>{industry}</span>
                <span className="font-mono text-xs text-ink-500">{count}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-10">
        <h2 className="font-serif text-lg">Customers in this segment</h2>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-paper-400 text-left font-mono text-xs text-ink-400">
              <th className="py-2 font-normal">Customer</th>
              <th className="py-2 font-normal">Risk</th>
              <th className="py-2 text-right font-normal">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {customers.slice(0, 50).map((c: MemberCustomer) => (
              <tr key={c.id} className="border-b border-paper-300">
                <td className="py-2.5">
                  <Link href={`/customers/${c.id}`} className="hover:text-accent-600 hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="py-2.5">{c.prediction ? <RiskBadge level={c.prediction.riskLevel} /> : "—"}</td>
                <td className="py-2.5 text-right font-mono text-xs">${Number(c.monthlyRevenue).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {customers.length > 50 && (
          <p className="mt-3 text-xs text-ink-400">Showing 50 of {customers.length} customers.</p>
        )}
      </section>
    </div>
  );
}
