import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function SupportIntelligencePage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;

  const [total, unresolved, repeatCount, avgResponse, avgResolution, topUnresolved] = await Promise.all([
    prisma.supportTicket.count({ where: { customer: { organizationId } } }),
    prisma.supportTicket.count({ where: { customer: { organizationId }, resolved: false } }),
    prisma.supportTicket.count({ where: { customer: { organizationId }, repeatTicket: true } }),
    prisma.supportTicket.aggregate({ where: { customer: { organizationId } }, _avg: { responseTimeHours: true } }),
    prisma.supportTicket.aggregate({ where: { customer: { organizationId }, resolved: true }, _avg: { resolutionTimeHours: true } }),
    prisma.customer.findMany({
      where: { organizationId, supportTickets: { some: { resolved: false } } },
      include: { _count: { select: { supportTickets: { where: { resolved: false } } } }, prediction: true },
      orderBy: { supportTickets: { _count: "desc" } },
      take: 8,
    }),
  ]);

  return (
    <div className="px-8 py-8">
      <h1 className="font-serif text-2xl">Support intelligence</h1>

      <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 border-y border-paper-400 py-6 sm:grid-cols-4">
        <div>
          <dt className="font-mono text-xs text-ink-400">total tickets</dt>
          <dd className="mt-1 font-serif text-3xl">{total.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="font-mono text-xs text-ink-400">unresolved</dt>
          <dd className="mt-1 font-serif text-3xl text-risk-high">{unresolved.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="font-mono text-xs text-ink-400">avg. response</dt>
          <dd className="mt-1 font-serif text-3xl">
            {avgResponse._avg.responseTimeHours ? `${avgResponse._avg.responseTimeHours.toFixed(1)}h` : "—"}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-xs text-ink-400">avg. resolution</dt>
          <dd className="mt-1 font-serif text-3xl">
            {avgResolution._avg.resolutionTimeHours ? `${avgResolution._avg.resolutionTimeHours.toFixed(1)}h` : "—"}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-ink-500">
        {repeatCount.toLocaleString()} tickets ({total ? ((repeatCount / total) * 100).toFixed(0) : 0}%) are repeat
        issues from a customer with a prior ticket.
      </p>

      <section className="mt-10">
        <h2 className="font-serif text-lg">Customers with unresolved tickets</h2>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-paper-400 text-left font-mono text-xs text-ink-400">
              <th className="py-2 font-normal">Customer</th>
              <th className="py-2 font-normal">Unresolved</th>
              <th className="py-2 text-right font-normal">Churn risk</th>
            </tr>
          </thead>
          <tbody>
            {topUnresolved.map((c) => (
              <tr key={c.id} className="border-b border-paper-300">
                <td className="py-2.5">{c.name}</td>
                <td className="py-2.5 font-mono text-xs">{c._count.supportTickets}</td>
                <td className="py-2.5 text-right font-mono text-xs">
                  {c.prediction ? `${(c.prediction.churnProbability * 100).toFixed(0)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {topUnresolved.length === 0 && <p className="mt-3 text-sm text-ink-700">No unresolved tickets.</p>}
      </section>
    </div>
  );
}
