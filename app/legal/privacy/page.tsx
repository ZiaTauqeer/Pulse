export default function PrivacyPage() {
  return (
    <article className="prose-content">
      <p className="font-mono text-xs uppercase tracking-wide text-ink-400">Privacy policy</p>
      <h1 className="mt-3 font-serif text-3xl">How PULSE handles data</h1>

      <p className="mt-6 text-sm leading-relaxed text-ink-700">
        PULSE, as presented here, is a portfolio project demonstrating a customer-intelligence
        platform. It is not a live commercial product processing real customer data, and this
        page describes the actual data handling in this build rather than a legal policy for a
        real business.
      </p>

      <h2 className="mt-8 font-serif text-xl">What data this application uses</h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-700">
        Every customer, event, transaction, support ticket, and sentiment record in this
        application is synthetically generated. See the{" "}
        <a href="/legal/data" className="text-accent-600 underline underline-offset-2">
          synthetic data disclosure
        </a>{" "}
        for how that data is produced. No real customer, company, or individual is represented.
      </p>

      <h2 className="mt-8 font-serif text-xl">Accounts</h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-700">
        If you create an account to sign in to this demo, your email address and a hashed
        password are stored in the application database solely to authenticate you. No account
        data is sold, shared, or used for any purpose beyond operating this demo.
      </p>

      <h2 className="mt-8 font-serif text-xl">A real deployment</h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-700">
        A production version of PULSE handling real customer data would need a genuine legal
        privacy policy covering data retention, subprocessors, regional data residency, and
        applicable regulations (e.g. GDPR, CCPA) drafted with counsel. This page intentionally
        does not simulate that document.
      </p>
    </article>
  );
}
