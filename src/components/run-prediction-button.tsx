"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunPredictionButton({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${customerId}/predict`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Prediction failed.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={loading}
        className="border border-ink-700 bg-ink-900 px-3 py-1.5 text-xs text-ink-100 disabled:opacity-50"
      >
        {loading ? "Scoring..." : "Run prediction"}
      </button>
      {error && <p className="mt-1 text-xs text-risk-critical">{error}</p>}
    </div>
  );
}
