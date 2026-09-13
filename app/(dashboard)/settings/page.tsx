import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function SettingsPage() {
  const session = await auth();
  const org = await prisma.organization.findUnique({
    where: { id: session!.user.organizationId },
    include: { users: { orderBy: { createdAt: "asc" } } },
  });

  return (
    <div className="px-8 py-8">
      <h1 className="font-serif text-2xl">Settings</h1>

      <section className="mt-8 max-w-lg">
        <h2 className="font-serif text-lg">Workspace</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between border-b border-paper-300 py-2">
            <dt className="text-ink-500">Name</dt>
            <dd>{org?.name}</dd>
          </div>
          <div className="flex justify-between border-b border-paper-300 py-2">
            <dt className="text-ink-500">Created</dt>
            <dd className="font-mono text-xs">{org?.createdAt.toISOString().slice(0, 10)}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-10 max-w-lg">
        <h2 className="font-serif text-lg">Team</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-paper-400 text-left font-mono text-xs text-ink-400">
              <th className="py-2 font-normal">Name</th>
              <th className="py-2 font-normal">Email</th>
              <th className="py-2 font-normal">Role</th>
            </tr>
          </thead>
          <tbody>
            {org?.users.map((u: { id: string; name: string; email: string|null; role: string }) => (
              <tr key={u.id} className="border-b border-paper-300">
                <td className="py-2.5">
                  {u.name}
                  {u.id === session!.user.id && <span className="ml-2 text-xs text-ink-400">(you)</span>}
                </td>
                <td className="py-2.5 text-xs text-ink-500">{u.email}</td>
                <td className="py-2.5 text-xs capitalize">{u.role.replace(/_/g, " ").toLowerCase()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
