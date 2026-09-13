"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const REGIONS = ["North America", "Europe", "APAC", "LATAM"];
const INDUSTRIES = ["Retail", "Fintech", "Healthcare", "Manufacturing", "Media", "Logistics", "Education", "SaaS"];
const CONTRACT_TYPES = ["month-to-month", "one-year", "two-year"];
const SUBSCRIPTION_TYPES = ["basic", "pro", "enterprise"];

type FormState = {
  name: string;
  contactName: string;
  region: string;
  industry: string;
  contractType: string;
  subscriptionType: string;
  monthlyRevenue: string;
  signupDate: string;
  loginCount7d: string;
  loginCount30d: string;
  featureUseCount30d: string;
  activeDays30d: string;
  daysSinceLastActivity: string;
  usageTrend: string;
  purchaseCount30d: string;
  purchaseCount90d: string;
  refundCount90d: string;
  revenue30d: string;
  revenue90d: string;
  hasNoPurchasesYet: boolean;
  daysSinceLastPurchase: string;
  supportTicketCount90d: string;
  unresolvedTicketCount: string;
  repeatTicketRatePercent: string;
  avgResponseTimeHours: string;
  avgResolutionTimeHours: string;
  overallSentiment: string;
  sentimentTrend: string;
};

const initialState: FormState = {
  name: "",
  contactName: "",
  region: REGIONS[0],
  industry: INDUSTRIES[0],
  contractType: CONTRACT_TYPES[0],
  subscriptionType: SUBSCRIPTION_TYPES[0],
  monthlyRevenue: "",
  signupDate: new Date().toISOString().slice(0, 10),
  loginCount7d: "0",
  loginCount30d: "0",
  featureUseCount30d: "0",
  activeDays30d: "0",
  daysSinceLastActivity: "0",
  usageTrend: "unknown",
  purchaseCount30d: "0",
  purchaseCount90d: "0",
  refundCount90d: "0",
  revenue30d: "",
  revenue90d: "",
  hasNoPurchasesYet: true,
  daysSinceLastPurchase: "",
  supportTicketCount90d: "0",
  unresolvedTicketCount: "0",
  repeatTicketRatePercent: "0",
  avgResponseTimeHours: "",
  avgResolutionTimeHours: "",
  overallSentiment: "unknown",
  sentimentTrend: "unknown",
};

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-ink-500">{label}</label>
      {children}
      {help && <p className="mt-1 text-xs text-ink-400">{help}</p>}
    </div>
  );
}

const inputClass =
  "mt-1.5 w-full border border-paper-400 bg-paper-100 px-3 py-2 text-sm outline-none focus-visible:border-accent-500";

export default function NewCustomerPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    customerId: string;
    name: string;
    prediction: null | { churn_probability: number; risk_level: string; top_contributors: Array<{ feature: string; direction: string }> };
    predictionError: string | null;
  } | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const num = (v: string) => (v === "" ? 0 : Number(v));
    const numOrNull = (v: string) => (v === "" ? null : Number(v));

    const payload = {
      name: form.name,
      contactName: form.contactName || undefined,
      region: form.region,
      industry: form.industry,
      contractType: form.contractType,
      subscriptionType: form.subscriptionType,
      monthlyRevenue: num(form.monthlyRevenue),
      signupDate: form.signupDate,
      loginCount7d: num(form.loginCount7d),
      loginCount30d: num(form.loginCount30d),
      featureUseCount30d: num(form.featureUseCount30d),
      activeDays30d: num(form.activeDays30d),
      daysSinceLastActivity: num(form.daysSinceLastActivity),
      usageTrend: form.usageTrend,
      purchaseCount30d: num(form.purchaseCount30d),
      purchaseCount90d: num(form.purchaseCount90d),
      refundCount90d: num(form.refundCount90d),
      revenue30d: num(form.revenue30d || form.monthlyRevenue),
      revenue90d: num(form.revenue90d || String(num(form.monthlyRevenue) * 3)),
      daysSinceLastPurchase: form.hasNoPurchasesYet ? null : numOrNull(form.daysSinceLastPurchase),
      supportTicketCount90d: num(form.supportTicketCount90d),
      unresolvedTicketCount: num(form.unresolvedTicketCount),
      repeatTicketRatePercent: num(form.repeatTicketRatePercent),
      avgResponseTimeHours: numOrNull(form.avgResponseTimeHours),
      avgResolutionTimeHours: numOrNull(form.avgResolutionTimeHours),
      overallSentiment: form.overallSentiment,
      sentimentTrend: form.sentimentTrend,
    };

    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create customer.");
        return;
      }
      setResult({
        customerId: data.customer.id,
        name: data.customer.name,
        prediction: data.prediction,
        predictionError: data.predictionError ?? null,
      });
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    const p = result.prediction;
    return (
      <div className="mx-auto max-w-2xl px-8 py-12">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-400">New customer added</p>
        <h1 className="mt-2 font-serif text-3xl">{result.name}</h1>

        {p ? (
          <div className="mt-8 border-t border-paper-400 pt-6">
            <p className="font-mono text-xs text-ink-400">churn probability</p>
            <p className="mt-1 font-serif text-5xl">{(p.churn_probability * 100).toFixed(0)}%</p>
            <p className="mt-1 text-sm text-ink-700">Risk level: {p.risk_level}</p>

            <p className="mt-6 font-mono text-xs text-ink-400">why</p>
            <ul className="mt-2 space-y-1">
              {p.top_contributors.slice(0, 5).map((c, i) => (
                <li key={i} className="text-sm">
                  {c.direction === "increases_risk" ? "↑" : "↓"} {c.feature}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-8 border-t border-paper-400 pt-6">
            <p className="text-sm text-risk-high">
              The customer was saved, but the prediction failed: {result.predictionError}
            </p>
            <p className="mt-2 text-sm text-ink-700">
              You can retry from the customer&apos;s page with &quot;Run Prediction&quot;.
            </p>
          </div>
        )}

        <div className="mt-8 flex gap-4">
          <Link href={`/customers/${result.customerId}`} className="bg-accent-500 px-4 py-2 text-sm text-ink-100 hover:bg-accent-600">
            View customer
          </Link>
          <Link href="/customers" className="border border-paper-400 px-4 py-2 text-sm hover:border-accent-500">
            Back to customers
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <h1 className="font-serif text-2xl">Add customer</h1>
      <p className="mt-2 text-sm text-ink-700">
        PULSE will run its trained churn model on this customer immediately after you save.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-10">
        <section>
          <h2 className="font-serif text-lg">Account information</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Company name (required)">
              <input required value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Contact name">
              <input value={form.contactName} onChange={(e) => set("contactName", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Region (required)">
              <select value={form.region} onChange={(e) => set("region", e.target.value)} className={inputClass}>
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Industry (required)">
              <select value={form.industry} onChange={(e) => set("industry", e.target.value)} className={inputClass}>
                {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </Field>
            <Field label="Contract type (required)">
              <select value={form.contractType} onChange={(e) => set("contractType", e.target.value)} className={inputClass}>
                {CONTRACT_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Subscription type (required)">
              <select value={form.subscriptionType} onChange={(e) => set("subscriptionType", e.target.value)} className={inputClass}>
                {SUBSCRIPTION_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Monthly revenue, USD (required)">
              <input required type="number" min="0" step="0.01" value={form.monthlyRevenue} onChange={(e) => set("monthlyRevenue", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Signup date (required)">
              <input required type="date" value={form.signupDate} onChange={(e) => set("signupDate", e.target.value)} className={inputClass} />
            </Field>
          </div>
        </section>

        <section>
          <h2 className="font-serif text-lg">Engagement &amp; behavior</h2>
          <p className="mt-1 text-xs text-ink-500">
            Login activity helps PULSE understand whether engagement is declining.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Logins in the last 7 days">
              <input type="number" min="0" value={form.loginCount7d} onChange={(e) => set("loginCount7d", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Logins in the last 30 days">
              <input type="number" min="0" value={form.loginCount30d} onChange={(e) => set("loginCount30d", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Feature-use events in the last 30 days">
              <input type="number" min="0" value={form.featureUseCount30d} onChange={(e) => set("featureUseCount30d", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Distinct active days in the last 30 days">
              <input type="number" min="0" max="30" value={form.activeDays30d} onChange={(e) => set("activeDays30d", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Days since last activity" help="0 if they logged in today">
              <input type="number" min="0" value={form.daysSinceLastActivity} onChange={(e) => set("daysSinceLastActivity", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Usage trend">
              <select value={form.usageTrend} onChange={(e) => set("usageTrend", e.target.value)} className={inputClass}>
                <option value="unknown">Not sure</option>
                <option value="increasing">Increasing</option>
                <option value="stable">Stable</option>
                <option value="decreasing">Decreasing</option>
              </select>
            </Field>
          </div>
        </section>

        <section>
          <h2 className="font-serif text-lg">Commerce</h2>
          <p className="mt-1 text-xs text-ink-500">Purchase and refund activity beyond the base subscription.</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Purchases in the last 30 days">
              <input type="number" min="0" value={form.purchaseCount30d} onChange={(e) => set("purchaseCount30d", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Purchases in the last 90 days">
              <input type="number" min="0" value={form.purchaseCount90d} onChange={(e) => set("purchaseCount90d", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Refunds in the last 90 days">
              <input type="number" min="0" value={form.refundCount90d} onChange={(e) => set("refundCount90d", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Revenue in the last 30 days" help="Leave blank to use monthly revenue">
              <input type="number" min="0" step="0.01" value={form.revenue30d} onChange={(e) => set("revenue30d", e.target.value)} className={inputClass} placeholder={form.monthlyRevenue} />
            </Field>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-xs text-ink-500">
                <input type="checkbox" checked={form.hasNoPurchasesYet} onChange={(e) => set("hasNoPurchasesYet", e.target.checked)} />
                No purchases yet
              </label>
              {!form.hasNoPurchasesYet && (
                <div className="mt-2 max-w-xs">
                  <Field label="Days since last purchase">
                    <input type="number" min="0" value={form.daysSinceLastPurchase} onChange={(e) => set("daysSinceLastPurchase", e.target.value)} className={inputClass} />
                  </Field>
                </div>
              )}
            </div>
          </div>
        </section>

        <section>
          <h2 className="font-serif text-lg">Support &amp; experience</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Support tickets in the last 90 days">
              <input type="number" min="0" value={form.supportTicketCount90d} onChange={(e) => set("supportTicketCount90d", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Currently unresolved tickets">
              <input type="number" min="0" value={form.unresolvedTicketCount} onChange={(e) => set("unresolvedTicketCount", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Repeat-ticket rate (%)" help="Share of tickets that are the same issue recurring">
              <input type="number" min="0" max="100" value={form.repeatTicketRatePercent} onChange={(e) => set("repeatTicketRatePercent", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Avg. first-response time (hours)" help="Leave blank if unknown">
              <input type="number" min="0" value={form.avgResponseTimeHours} onChange={(e) => set("avgResponseTimeHours", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Avg. resolution time (hours)" help="Leave blank if unknown">
              <input type="number" min="0" value={form.avgResolutionTimeHours} onChange={(e) => set("avgResolutionTimeHours", e.target.value)} className={inputClass} />
            </Field>
          </div>
        </section>

        <section>
          <h2 className="font-serif text-lg">Sentiment</h2>
          <p className="mt-1 text-xs text-ink-500">How the customer has felt recently, based on support or feedback.</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Overall recent sentiment">
              <select value={form.overallSentiment} onChange={(e) => set("overallSentiment", e.target.value)} className={inputClass}>
                <option value="unknown">Not sure</option>
                <option value="positive">Positive</option>
                <option value="neutral">Neutral</option>
                <option value="negative">Negative</option>
              </select>
            </Field>
            <Field label="Sentiment trend">
              <select value={form.sentimentTrend} onChange={(e) => set("sentimentTrend", e.target.value)} className={inputClass}>
                <option value="unknown">Not sure</option>
                <option value="improving">Improving</option>
                <option value="stable">Stable</option>
                <option value="worsening">Worsening</option>
              </select>
            </Field>
          </div>
        </section>

        {error && <p className="text-sm text-risk-critical">{error}</p>}

        <div className="flex gap-4 border-t border-paper-400 pt-6">
          <button type="submit" disabled={submitting} className="bg-accent-500 px-5 py-2.5 text-sm text-ink-100 hover:bg-accent-600 disabled:opacity-50">
            {submitting ? "Scoring customer..." : "Save & run prediction"}
          </button>
          <button type="button" onClick={() => router.push("/customers")} className="px-5 py-2.5 text-sm text-ink-500 hover:text-ink-700">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
