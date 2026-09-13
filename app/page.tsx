import Link from "next/link";
import { DotMatrixField } from "@/components/dot-matrix-field";

const capabilities = [
  {
    title: "Churn prediction",
    body: "A model trained on account, usage, support, and sentiment history estimates each customer's probability of churning in the next 30 days.",
  },
  {
    title: "Behavioral intelligence",
    body: "Login frequency, feature adoption, and activity trends are tracked continuously, so a slowdown shows up before it becomes a cancellation.",
  },
  {
    title: "Explainable scoring",
    body: "Every prediction comes with the specific factors driving it, ranked by contribution and computed directly from the model rather than written by hand.",
  },
  {
    title: "Grounded investigation",
    body: "An AI assistant answers questions about any customer or segment by querying the underlying data, not by guessing.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-paper-200 text-paper-ink">
      <header className="border-b border-ink-700 bg-ink-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="font-serif text-lg text-ink-100">PULSE</span>
          <nav className="flex items-center gap-6 text-sm text-ink-200">
            <Link href="/legal/privacy" className="hover:text-ink-100">
              Privacy
            </Link>
            <Link href="/signup" className="hover:text-ink-100">
              Sign up
            </Link>
            <Link
              href="/login"
              className="rounded-sm border border-ink-600 px-3 py-1.5 text-ink-100 transition-colors hover:border-accent-500 hover:text-accent-300"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-6 pt-16">
          <p className="font-mono text-xs uppercase tracking-wide text-ink-400">
            Predictive customer experience intelligence
          </p>
          <h1 className="mt-4 max-w-2xl font-serif text-4xl leading-tight text-paper-ink sm:text-5xl">
            Know which customers are at risk, and why.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-700">
            PULSE analyzes account, behavioral, support, and sentiment data to predict churn,
            explain what is driving each score, and ground every recommendation in evidence.
          </p>
        </section>

        <div className="relative mx-auto mt-12 h-64 max-w-5xl px-6 sm:h-80">
          <DotMatrixField className="h-full w-full" color="#2f6f6b" />
        </div>

        <section className="mx-auto max-w-5xl border-t border-paper-400 px-6 py-14">
          <dl className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
            {capabilities.map((c) => (
              <div key={c.title} className="border-t border-paper-400 pt-4">
                <dt className="font-serif text-lg text-paper-ink">{c.title}</dt>
                <dd className="mt-2 max-w-md text-sm leading-relaxed text-ink-700">{c.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mx-auto max-w-5xl border-t border-paper-400 px-6 py-14">
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-wide text-ink-400">What is churn?</p>
              <p className="mt-3 text-sm leading-relaxed text-ink-700">
                Churn is when an existing customer stops using or cancels a product they were
                already paying for. It is different from simply failing to win a new customer.
              </p>
            </div>
            <div>
              <p className="font-mono text-xs uppercase tracking-wide text-ink-400">Why it matters</p>
              <p className="mt-3 text-sm leading-relaxed text-ink-700">
                Losing an existing customer means lost recurring revenue, the cost of acquiring a
                replacement, and a missed chance to fix the problem while it was still fixable.
              </p>
            </div>
            <div>
              <p className="font-mono text-xs uppercase tracking-wide text-ink-400">How PULSE helps</p>
              <p className="mt-3 text-sm leading-relaxed text-ink-700">
                PULSE combines account data, product usage, support activity, and sentiment to
                estimate churn risk for each customer and explain exactly what is driving it.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-paper-400 bg-paper-100">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-8 text-xs text-ink-400 sm:flex-row sm:items-center sm:justify-between">
          <p>Customer and behavioral data shown in this demo is synthetic.</p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/legal/privacy" className="hover:text-accent-500">
              Privacy policy
            </Link>
            <Link href="/legal/terms" className="hover:text-accent-500">
              Terms of service
            </Link>
            <Link href="/legal/ai-usage" className="hover:text-accent-500">
              AI usage disclosure
            </Link>
            <Link href="/legal/data" className="hover:text-accent-500">
              Synthetic data disclosure
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
