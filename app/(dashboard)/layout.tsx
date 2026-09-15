import type { ReactNode } from "react";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { NavRail } from "@/components/nav-rail";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  return (
    <div className="flex min-h-screen bg-paper-200 text-paper-ink">
      <aside className="flex w-56 shrink-0 flex-col border-r border-ink-700 bg-ink-900">
        <Link href="/overview" className="border-b border-ink-700 px-5 py-4 font-serif text-lg text-ink-100">
          PULSE
        </Link>
        <div className="flex-1 overflow-y-auto">
          <NavRail />
        </div>
        <div className="border-t border-ink-700 px-3 py-3">
          <ThemeToggle className="mb-3" />
          <p className="truncate px-3 text-xs text-ink-400">{session?.user?.email}</p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="mt-1 w-full rounded-sm px-3 py-1.5 text-left text-xs text-ink-200 hover:bg-ink-800 hover:text-ink-100"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}