import Link from "next/link";
import { auth } from "@/auth";
import { listCustomers } from "@/lib/queries";
import { RiskBadge } from "@/components/risk-badge";

const RISK_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const SORT_OPTIONS = [
  { value: "risk", label: "Risk" },
  { value: "name", label: "Name" },
  { value: "revenue", label: "Revenue" },
  { value: "lastActive", label: "Recently updated" },
] as const;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; risk?: string; sort?: string; dir?: string; page?: string }>;
}) {
  const session = await auth();
  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page, 10) : 1;
  const sortBy = (sp.sort as "risk" | "name" | "revenue" | "lastActive") ?? "risk";
  const sortDir = (sp.dir as "asc" | "desc") ?? "desc";

  const { rows, total, pageSize } = await listCustomers({
    organizationId: session!.user.organizationId,
    search: sp.q,
    riskLevel: sp.risk,
    sortBy,
    sortDir,
    page,
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function buildHref(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = { q: sp.q, risk: sp.risk, sort: sp.sort, dir: sp.dir, page: sp.page, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/customers?${qs}` : "/customers";
  }

  return (
    <div className="px-8 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-2xl text-paper-ink">Customers</h1>
        <div className="flex items-center gap-4">
          <p className="font-mono text-xs text-ink-400">{total.toLocaleString()} total</p>
          <Link href="/customers/new" className="bg-accent-500 px-3 py-1.5 text-xs text-ink-100 hover:bg-accent-600">
            Add customer
          </Link>
        </div>
      </div>

      <form className="mt-6 flex flex-wrap items-center gap-3" action="/customers">
        <input
          type="search"
          name="q"
          defaultValue={sp.q}
          placeholder="Search by name"
          className="w-64 border border-paper-400 bg-paper-100 px-3 py-1.5 text-sm outline-none focus-visible:border-accent-500"
        />
        <select
          name="risk"
          defaultValue={sp.risk ?? ""}
          className="border border-paper-400 bg-paper-100 px-3 py-1.5 text-sm"
        >
          <option value="">All risk levels</option>
          {RISK_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r.charAt(0) + r.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <button type="submit" className="border border-ink-700 bg-ink-900 px-3 py-1.5 text-sm text-ink-100">
          Apply
        </button>
        <div className="ml-auto flex items-center gap-2 text-xs text-ink-400">
          <span>Sort</span>
          {SORT_OPTIONS.map((opt) => (
            <Link
              key={opt.value}
              href={buildHref({ sort: opt.value, page: undefined })}
              className={sortBy === opt.value ? "text-accent-600 underline" : "hover:text-accent-600"}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </form>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-paper-400 text-left font-mono text-xs text-ink-400">
            <th className="py-2 font-normal">Customer</th>
            <th className="py-2 font-normal">Health</th>
            <th className="py-2 font-normal">Churn risk</th>
            <th className="py-2 font-normal">Segment</th>
            <th className="py-2 font-normal">Support</th>
            <th className="py-2 text-right font-normal">Revenue</th>
            <th className="py-2 text-right font-normal">Last active</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-paper-300 hover:bg-paper-100">
              <td className="py-2.5">
                <Link href={`/customers/${c.id}`} className="hover:text-accent-600 hover:underline">
                  {c.name}
                </Link>
                <span className="ml-2 font-mono text-xs text-ink-400">{c.id}</span>
              </td>
              <td className="py-2.5">
                <span className={c.status === "ACTIVE" ? "text-risk-low" : "text-ink-400"}>
                  {c.status === "ACTIVE" ? "Active" : "Churned"}
                </span>
              </td>
              <td className="py-2.5">
                {c.prediction ? (
                  <span className="flex items-center gap-2">
                    <RiskBadge level={c.prediction.riskLevel} />
                    <span className="font-mono text-xs text-ink-700">
                      {(c.prediction.churnProbability * 100).toFixed(1)}%
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-ink-400">not scored</span>
                )}
              </td>
              <td className="py-2.5 text-xs text-ink-700">
                {c.segmentMembership?.segment.name ?? "—"}
              </td>
              <td className="py-2.5 font-mono text-xs text-ink-700">{c._count.supportTickets}</td>
              <td className="py-2.5 text-right font-mono text-xs">
                ${Number(c.monthlyRevenue).toLocaleString()}
              </td>
              <td className="py-2.5 text-right font-mono text-xs text-ink-500">
                {c.updatedAt.toISOString().slice(0, 10)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && (
        <p className="mt-6 text-sm text-ink-700">No customers match the current filters.</p>
      )}

      <div className="mt-6 flex items-center justify-between text-xs text-ink-400">
        <span>
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-3">
          {page > 1 && (
            <Link href={buildHref({ page: String(page - 1) })} className="hover:text-accent-600">
              Previous
            </Link>
          )}
          {page < totalPages && (
            <Link href={buildHref({ page: String(page + 1) })} className="hover:text-accent-600">
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
