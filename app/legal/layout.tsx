import Link from "next/link";
import type { ReactNode } from "react";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper-200 text-paper-ink">
      <header className="border-b border-ink-700 bg-ink-900">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-serif text-lg text-ink-100">
            PULSE
          </Link>
          <nav className="flex gap-5 text-xs text-ink-200">
            <Link href="/legal/privacy" className="hover:text-ink-100">
              Privacy
            </Link>
            <Link href="/legal/terms" className="hover:text-ink-100">
              Terms
            </Link>
            <Link href="/legal/ai-usage" className="hover:text-ink-100">
              AI usage
            </Link>
            <Link href="/legal/data" className="hover:text-ink-100">
              Synthetic data
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-14">{children}</main>
    </div>
  );
}
