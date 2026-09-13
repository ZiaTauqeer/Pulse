import { prisma } from "@/lib/prisma";

type Metrics = {
  roc_auc: number;
  pr_auc: number;
  precision: number;
  recall: number;
  f1: number;
  confusion_matrix: { true_negative: number; false_positive: number; false_negative: number; true_positive: number };
  brier_score: number;
  n_samples: number;
};

export default async function ModelInsightsPage() {
  const versions = await prisma.modelVersion.findMany({ orderBy: { trainedAt: "desc" } });
  const production = versions.find((v) => v.status === "PRODUCTION") ?? versions[0];

  if (!production) {
    return (
      <div className="px-8 py-8">
        <h1 className="font-serif text-2xl">Model insights</h1>
        <p className="mt-4 text-sm text-ink-700">
          No model has been registered yet. Run the ML pipeline (see ml/README.md) through{" "}
          <code className="font-mono text-xs">pipeline.register --promote</code>.
        </p>
      </div>
    );
  }

  const metrics = production.metrics as unknown as Metrics;
  const riskBands = production.riskBands as unknown as { low_max: number; medium_max: number; high_max: number };

  return (
    <div className="px-8 py-8">
      <h1 className="font-serif text-2xl">Model insights</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-700">
        PULSE estimates churn risk with a model trained on account, behavioral, support, and
        sentiment history. It was compared against simpler alternatives on a validation set, tuned,
        calibrated, and evaluated once on data it never saw during training.
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 border-y border-paper-400 py-6 sm:grid-cols-4">
        <div>
          <dt className="font-mono text-xs text-ink-400">algorithm</dt>
          <dd className="mt-1 font-serif text-2xl capitalize">{production.algorithm.replace(/_/g, " ")}</dd>
        </div>
        <div>
          <dt className="font-mono text-xs text-ink-400">version</dt>
          <dd className="mt-1 font-serif text-2xl">{production.version}</dd>
        </div>
        <div>
          <dt className="font-mono text-xs text-ink-400">roc-auc (test)</dt>
          <dd className="mt-1 font-serif text-2xl">{metrics.roc_auc.toFixed(3)}</dd>
        </div>
        <div>
          <dt className="font-mono text-xs text-ink-400">trained</dt>
          <dd className="mt-1 font-serif text-2xl">{production.trainedAt.toISOString().slice(0, 10)}</dd>
        </div>
      </dl>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <section>
          <h2 className="font-serif text-lg">Test-set evaluation</h2>
          <dl className="mt-3 space-y-2 text-sm">
            {[
              ["PR-AUC", metrics.pr_auc.toFixed(3)],
              ["Precision", metrics.precision.toFixed(3)],
              ["Recall", metrics.recall.toFixed(3)],
              ["F1", metrics.f1.toFixed(3)],
              ["Brier score (calibration error)", metrics.brier_score.toFixed(3)],
              ["Test set size", metrics.n_samples.toLocaleString()],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between border-b border-paper-300 py-2">
                <dt className="text-ink-500">{label}</dt>
                <dd className="font-mono text-xs">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h2 className="font-serif text-lg">Confusion matrix (test set)</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center text-sm">
            <div className="border border-paper-400 py-4">
              <p className="font-serif text-xl">{metrics.confusion_matrix.true_negative}</p>
              <p className="mt-1 text-xs text-ink-500">correctly predicted retained</p>
            </div>
            <div className="border border-paper-400 py-4">
              <p className="font-serif text-xl text-risk-medium">{metrics.confusion_matrix.false_positive}</p>
              <p className="mt-1 text-xs text-ink-500">flagged at-risk, stayed</p>
            </div>
            <div className="border border-paper-400 py-4">
              <p className="font-serif text-xl text-risk-critical">{metrics.confusion_matrix.false_negative}</p>
              <p className="mt-1 text-xs text-ink-500">missed churn</p>
            </div>
            <div className="border border-paper-400 py-4">
              <p className="font-serif text-xl text-risk-low">{metrics.confusion_matrix.true_positive}</p>
              <p className="mt-1 text-xs text-ink-500">correctly flagged churn</p>
            </div>
          </div>
        </section>
      </div>

      <section className="mt-10 max-w-2xl">
        <h2 className="font-serif text-lg">Risk bands</h2>
        <p className="mt-2 text-sm text-ink-700">
          Risk labels (Low / Medium / High / Critical) are set from this model&apos;s own predicted
          probability distribution, not a fixed 0-100% scale, so they stay meaningful as the
          model is retrained.
        </p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between border-b border-paper-300 py-2">
            <dt className="text-ink-500">Low, below</dt>
            <dd className="font-mono text-xs">{(riskBands.low_max * 100).toFixed(1)}%</dd>
          </div>
          <div className="flex justify-between border-b border-paper-300 py-2">
            <dt className="text-ink-500">Medium, below</dt>
            <dd className="font-mono text-xs">{(riskBands.medium_max * 100).toFixed(1)}%</dd>
          </div>
          <div className="flex justify-between border-b border-paper-300 py-2">
            <dt className="text-ink-500">High, below</dt>
            <dd className="font-mono text-xs">{(riskBands.high_max * 100).toFixed(1)}%</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-ink-500">Critical, at or above</dt>
            <dd className="font-mono text-xs">{(riskBands.high_max * 100).toFixed(1)}%</dd>
          </div>
        </dl>
      </section>

      {versions.length > 1 && (
        <section className="mt-10">
          <h2 className="font-serif text-lg">Version history</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-paper-400 text-left font-mono text-xs text-ink-400">
                <th className="py-2 font-normal">Version</th>
                <th className="py-2 font-normal">Algorithm</th>
                <th className="py-2 font-normal">Status</th>
                <th className="py-2 text-right font-normal">ROC-AUC</th>
                <th className="py-2 text-right font-normal">Trained</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className="border-b border-paper-300">
                  <td className="py-2 font-mono text-xs">{v.version}</td>
                  <td className="py-2 capitalize">{v.algorithm.replace(/_/g, " ")}</td>
                  <td className="py-2 text-xs text-ink-500">{v.status.toLowerCase()}</td>
                  <td className="py-2 text-right font-mono text-xs">
                    {(v.metrics as unknown as Metrics).roc_auc.toFixed(3)}
                  </td>
                  <td className="py-2 text-right font-mono text-xs text-ink-500">
                    {v.trainedAt.toISOString().slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
