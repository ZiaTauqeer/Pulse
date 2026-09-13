export default function TermsPage() {
  return (
    <article>
      <p className="font-mono text-xs uppercase tracking-wide text-ink-400">Terms of service</p>
      <h1 className="mt-3 font-serif text-3xl">Terms</h1>

      <p className="mt-6 text-sm leading-relaxed text-ink-700">
        This is a portfolio project made available for demonstration and evaluation purposes.
        There is no commercial service, subscription, or contractual relationship being offered
        here, and no service-level commitments are made about uptime, accuracy, or availability.
      </p>

      <h2 className="mt-8 font-serif text-xl">Use of predictions and recommendations</h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-700">
        Churn predictions and AI-generated recommendations in this application are produced by a
        real, trained machine learning model running against synthetic data (see{" "}
        <a href="/legal/data" className="text-accent-600 underline underline-offset-2">
          Synthetic data disclosure
        </a>
        ), evaluated honestly (see <a href="/legal/ai-usage" className="text-accent-600 underline underline-offset-2">AI usage disclosure</a> for its
        current accuracy). They should not be relied on for any real business decision.
      </p>

      <h2 className="mt-8 font-serif text-xl">A real deployment</h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-700">
        A production SaaS offering built on this codebase would need real terms of service
        covering acceptable use, liability, data ownership, and termination, drafted with
        counsel. This page intentionally does not simulate that document.
      </p>
    </article>
  );
}
