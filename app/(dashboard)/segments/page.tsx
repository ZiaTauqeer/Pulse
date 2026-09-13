import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type Characteristics = {
  size: number;
  avg_revenue: number;
  avg_churn_probability: number | null;
  avg_login_count_30d: number;
  avg_sentiment_90d: number | null;
  dominant_industry: string | null;
};

export default async function SegmentsPage() {
  const session = await auth();
  const segments = await prisma.segment.findMany({
    where: { memberships: { some: { customer: { organizationId: session!.user.organizationId } } } },
    include: { _count: { select: { memberships: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="px-8 py-8">
      <h1 className="font-serif text-2xl">Segments</h1>
      <p className="mt-2 max-w-xl text-sm text-ink-700">
        Customer segments derived from K-means clustering on engagement, revenue, and support
        features. Names are generated from each cluster&apos;s actual characteristics, not hand-picked.
      </p>

      {segments.length === 0 ? (
        <div className="mt-8 max-w-lg border border-paper-400 p-6">
          <p className="text-sm text-ink-700">
            No segments have been computed yet. Run{" "}
            <code className="font-mono text-xs">npm run segments:sync</code> to generate them from
            the current customer base.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {segments.map((s) => {
            const c = s.characteristics as unknown as Characteristics;
            return (
              <Link
                key={s.id}
                href={`/segments/${s.id}`}
                className="border border-paper-400 p-5 transition-colors hover:border-accent-500"
              >
                <h2 className="font-serif text-lg">{s.name}</h2>
                <p className="mt-1 text-xs text-ink-500">{s._count.memberships} customers</p>
                {s.description && <p className="mt-3 text-sm text-ink-700">{s.description}</p>}
                <dl className="mt-4 space-y-1.5 border-t border-paper-300 pt-3 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Avg. revenue</dt>
                    <dd className="font-mono">${c.avg_revenue?.toFixed(0)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Avg. churn probability</dt>
                    <dd className="font-mono">
                      {c.avg_churn_probability !== null ? `${(c.avg_churn_probability * 100).toFixed(1)}%` : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Dominant industry</dt>
                    <dd>{c.dominant_industry ?? "—"}</dd>
                  </div>
                </dl>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
