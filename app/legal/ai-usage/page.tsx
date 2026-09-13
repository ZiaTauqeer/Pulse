export default function AIUsagePage() {
  return (
    <article>
      <p className="font-mono text-xs uppercase tracking-wide text-ink-400">
        AI usage · Model limitations · Responsible AI
      </p>
      <h1 className="mt-3 font-serif text-3xl">How PULSE uses machine learning and AI</h1>

      <h2 className="mt-8 font-serif text-xl">The churn model</h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-700">
        Churn probabilities come from a real, trained classifier (currently a random forest,
        selected by comparing it against logistic regression, gradient boosting, and a
        majority-class baseline on a held-out validation set). It is evaluated once, honestly, on
        a test set it never saw during training or tuning. Current metrics, the confusion matrix,
        and the precision/recall trade-off at different thresholds are available in{" "}
        <a href="/model-insights" className="text-accent-600 underline underline-offset-2">
          Model Insights
        </a>{" "}
        rather than restated here, so this page can&apos;t go stale as the model is retrained.
      </p>

      <h2 className="mt-8 font-serif text-xl">What the model can and can&apos;t tell you</h2>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-700">
        <li>
          A churn probability is an estimate, not a certainty. Even a customer flagged as
          high risk usually has a real chance of not churning, and vice versa.
        </li>
        <li>
          The model is trained on synthetic data (see{" "}
          <a href="/legal/data" className="text-accent-600 underline underline-offset-2">
            synthetic data disclosure
          </a>
          ) with a deliberately noisy, non-deterministic label. It demonstrates a real,
          reproducible ML pipeline rather than a production-accuracy benchmark.
        </li>
        <li>
          Feature contributions shown on a customer&apos;s page come from SHAP, computed directly
          against the trained model. They explain what the model responded to, not necessarily
          the true real-world cause of a customer&apos;s behavior.
        </li>
      </ul>

      <h2 className="mt-8 font-serif text-xl">The AI assistant</h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-700">
        The assistant answers questions by calling backend tools that query the actual database
        and model outputs, then writing a plain-language summary of what those tools returned. It
        distinguishes between data pulled directly from the database, output from the ML model,
        and its own interpretation. It does not have general access to invent facts about a
        specific customer.
      </p>

      <h2 className="mt-8 font-serif text-xl">Responsible use</h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-700">
        Predictions and recommendations here are decision support, not a decision. A model
        flagging a customer as high risk is a prompt to look at the evidence, not a verdict.
        Actions like canceling a contract, offering a discount, or escalating a relationship
        should stay with a person who can weigh context the model doesn&apos;t have.
      </p>
    </article>
  );
}
