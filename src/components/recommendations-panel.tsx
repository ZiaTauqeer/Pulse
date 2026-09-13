"use client";

import { useState } from "react";

type Recommendation = {
  id: string;
  text: string;
  evidence: string[];
  status: "OPEN" | "DISMISSED" | "COMPLETED";
  createdAt: string;
};

export function RecommendationsPanel({
  customerId,
  initialRecommendations,
}: {
  customerId: string;
  initialRecommendations: Recommendation[];
}) {
  const [recommendations, setRecommendations] = useState(initialRecommendations);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${customerId}/recommendations`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to generate a recommendation.");
        return;
      }
      setRecommendations([data.recommendation, ...recommendations]);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setGenerating(false);
    }
  }

  async function setStatus(id: string, status: "DISMISSED" | "COMPLETED") {
    const res = await fetch(`/api/recommendations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setRecommendations(recommendations.map((r) => (r.id === id ? { ...r, status } : r)));
    }
  }

  const openRecommendations = recommendations.filter((r) => r.status === "OPEN");

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-lg">Recommendations</h2>
        <button
          onClick={generate}
          disabled={generating}
          className="border border-ink-700 bg-ink-900 px-3 py-1.5 text-xs text-ink-100 disabled:opacity-50"
        >
          {generating ? "Generating..." : "Generate recommendation"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-risk-critical">{error}</p>}

      {openRecommendations.length === 0 ? (
        <p className="mt-3 text-sm text-ink-700">No open recommendations for this customer.</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {openRecommendations.map((r) => (
            <li key={r.id} className="border border-paper-400 p-4">
              <p className="text-sm text-paper-ink">{r.text}</p>
              <ul className="mt-2 space-y-1">
                {r.evidence.map((e, i) => (
                  <li key={i} className="text-xs text-ink-500">
                    · {e}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-3">
                <button onClick={() => setStatus(r.id, "COMPLETED")} className="text-xs text-risk-low hover:underline">
                  Mark done
                </button>
                <button onClick={() => setStatus(r.id, "DISMISSED")} className="text-xs text-ink-400 hover:underline">
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
