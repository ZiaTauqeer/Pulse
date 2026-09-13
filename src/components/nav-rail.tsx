"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav-items";

export function NavRail() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5 px-3 py-4">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`border-l-2 px-3 py-2 text-sm transition-colors ${
              active
                ? "border-accent-500 bg-ink-800 text-ink-100"
                : "border-transparent text-ink-200 hover:border-ink-600 hover:text-ink-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
