import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getCustomer, getCustomerTimeline } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { RiskBadge } from "@/components/risk-badge";
import { RecommendationsPanel } from "@/components/recommendations-panel";
import { RunPredictionButton } from "@/components/run-prediction-button";

type Contributor = {
  feature: string;
  customer_value: number | string | null;
  contribution: number;
  direction: "increases_risk" | "decreases_risk";
};

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const customer = await getCustomer(session!.user.organizationId, id);
  if (!customer) notFound();

  void logAction({
    organizationId: session!.user.organizationId,
    userId: session!.user.id,
    action: "viewed_customer",
    targetType: "customer",
    targetId: customer.id,
  });

  const [timeline, predictionHistory, openTickets, recentSentiment, recommendations] = await Promise.all([
    getCustomerTimeline(customer.id),
    prisma.predictionHistory.findMany({
      where: { customerId: customer.id },
      orderBy: { predictedAt: "asc" },
    }),
    prisma.supportTicket.findMany({
      where: { customerId: customer.id },
      orderBy: { openedAt: "desc" },
      take: 5,
    }),
    prisma.sentimentResult.findMany({
      where: { customerId: customer.id },
      orderBy: { occurredAt: "desc" },
      take: 5,
    }),
    prisma.recommendation.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const contributors = (customer.prediction?.topContributors as unknown as Contributor[] | null) ?? [];
  const firstPrediction = predictionHistory[0];
  const riskTrendNote =
    predictionHistory.length > 1 && firstPrediction
      ? `Risk ${
          customer.prediction!.churnProbability >= firstPrediction.churnProbability ? "increased" : "decreased"
        } from ${(firstPrediction.churnProbability * 100).toFixed(0)}% to ${(
          customer.prediction!.churnProbability * 100
        ).toFixed(0)}% since the first recorded prediction.`
      : null;

  return (
    <div className="px-8 py-8">
      <div className="flex items-start justify-between border-b border-paper-400 pb-6">
        <div>
          <p className="font-mono text-xs text-ink-400">{customer.id}</p>
          <h1 className="mt-1 font-serif text-3xl">{customer.name}</h1>
          <p className="mt-2 text-sm text-ink-700">
            {customer.industry} · {customer.region} · {customer.subscriptionType} plan ·{" "}
            {customer.contractType}
          </p>
        </div>
        {customer.prediction ? (
          <div className="text-right">
            <p className="font-mono text-xs text-ink-400">churn probability</p>
            <p className="font-serif text-4xl">{(customer.prediction.churnProbability * 100).toFixed(0)}%</p>
            <div className="mt-1 flex justify-end">
              <RiskBadge level={customer.prediction.riskLevel} />
            </div>
            <div className="mt-3">
              <RunPredictionButton customerId={customer.id} />
            </div>
          </div>
        ) : (
          <div className="text-right">
            <p className="text-sm text-ink-500">Not scored yet</p>
            <div className="mt-3">
              <RunPredictionButton customerId={customer.id} />
            </div>
          </div>
        )}
      </div>

      {riskTrendNote && <p className="mt-4 text-sm text-ink-700">{riskTrendNote}</p>}

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <section>
          <h2 className="font-serif text-lg">Risk explanation</h2>
          {contributors.length === 0 ? (
            <p className="mt-3 text-sm text-ink-700">
              No explanation available for this customer&apos;s current prediction.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {contributors.map((c, i) => (
                <li key={i} className="flex items-center justify-between border-b border-paper-300 py-2 text-sm">
                  <span>{c.feature}</span>
                  <span
                    className={`font-mono text-xs ${
                      c.direction === "increases_risk" ? "text-risk-high" : "text-risk-low"
                    }`}
                  >
                    {c.direction === "increases_risk" ? "+" : ""}
                    {(c.contribution * 100).toFixed(1)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink-400">
            Computed with SHAP against model {customer.prediction?.modelId} {customer.prediction?.modelVersion}.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg">Account</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between border-b border-paper-300 py-2">
              <dt className="text-ink-500">Status</dt>
              <dd>{customer.status === "ACTIVE" ? "Active" : `Churned ${customer.churnDate?.toISOString().slice(0, 10)}`}</dd>
            </div>
            <div className="flex justify-between border-b border-paper-300 py-2">
              <dt className="text-ink-500">Signed up</dt>
              <dd className="font-mono text-xs">{customer.signupDate.toISOString().slice(0, 10)}</dd>
            </div>
            <div className="flex justify-between border-b border-paper-300 py-2">
              <dt className="text-ink-500">Monthly revenue</dt>
              <dd className="font-mono text-xs">${Number(customer.monthlyRevenue).toLocaleString()}</dd>
            </div>
            <div className="flex justify-between border-b border-paper-300 py-2">
              <dt className="text-ink-500">Segment</dt>
              <dd>{customer.segmentMembership?.segment.name ?? "Unassigned"}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h2 className="font-serif text-lg">Recent support</h2>
          {openTickets.length === 0 ? (
            <p className="mt-3 text-sm text-ink-700">No support tickets on record.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {openTickets.map((t) => (
                <li key={t.id} className="flex items-center justify-between border-b border-paper-300 py-2 text-sm">
                  <span>{t.openedAt.toISOString().slice(0, 10)}</span>
                  <span className={t.resolved ? "text-ink-500" : "text-risk-high"}>
                    {t.resolved ? "Resolved" : "Open"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="font-serif text-lg">Recent sentiment</h2>
          {recentSentiment.length === 0 ? (
            <p className="mt-3 text-sm text-ink-700">No sentiment records on file.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recentSentiment.map((s) => (
                <li key={s.id} className="border-b border-paper-300 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="capitalize text-ink-700">{s.sentimentLabel.toLowerCase()}</span>
                    <span className="font-mono text-xs text-ink-400">
                      {s.occurredAt.toISOString().slice(0, 10)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">&quot;{s.message}&quot;</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-10">
        <RecommendationsPanel
          customerId={customer.id}
          initialRecommendations={recommendations.map((r) => ({
            id: r.id,
            text: r.text,
            evidence: r.evidence as string[],
            status: r.status,
            createdAt: r.createdAt.toISOString(),
          }))}
        />
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-lg">Timeline</h2>
        <ol className="mt-3 space-y-3">
          {timeline.slice(0, 30).map((e, i) => (
            <li key={i} className="flex gap-4 border-b border-paper-300 pb-3 text-sm">
              <span className="w-24 shrink-0 font-mono text-xs text-ink-400">
                {e.occurredAt.toISOString().slice(0, 10)}
              </span>
              <span>{e.summary}</span>
            </li>
          ))}
        </ol>
        {timeline.length === 0 && <p className="mt-3 text-sm text-ink-700">No recorded activity.</p>}
      </section>
    </div>
  );
}
