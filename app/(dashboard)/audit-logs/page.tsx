import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function AuditLogsPage() {
  const session = await auth();
  const logs = await prisma.auditLog.findMany({
    where: { organizationId: session!.user.organizationId },
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="px-8 py-8">
      <h1 className="font-serif text-2xl">Audit logs</h1>
      <p className="mt-2 max-w-xl text-sm text-ink-700">
        A record of actions taken in PULSE - customer views, dismissed recommendations, model
        promotions.
      </p>

      {logs.length === 0 ? (
        <p className="mt-8 text-sm text-ink-700">
          No actions recorded yet. Visiting a customer&apos;s detail page logs a{" "}
          <code className="font-mono text-xs">viewed_customer</code> entry here.
        </p>
      ) : (
        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b border-paper-400 text-left font-mono text-xs text-ink-400">
              <th className="py-2 font-normal">Time</th>
              <th className="py-2 font-normal">User</th>
              <th className="py-2 font-normal">Action</th>
              <th className="py-2 font-normal">Target</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-paper-300">
                <td className="py-2.5 font-mono text-xs text-ink-500">
                  {log.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                </td>
                <td className="py-2.5 text-xs">{log.user?.email ?? "system"}</td>
                <td className="py-2.5 text-xs">{log.action}</td>
                <td className="py-2.5 font-mono text-xs text-ink-500">
                  {log.targetType ? `${log.targetType}:${log.targetId}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
