"use client";

import { useState } from "react";

type Message = { role: "user" | "assistant"; content: string };
type ToolCall = { tool: string; input: unknown; output: unknown };

const SUGGESTIONS = [
  "Which customers have the highest churn risk right now?",
  "What are the top churn drivers across the customer base?",
  "How many customers are in the critical risk band?",
];

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastTrace, setLastTrace] = useState<ToolCall[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const nextMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      let data: { error?: string; answer?: string; tool_calls?: ToolCall[] };
      try {
        data = await res.json();
      } catch {
        setError(`The server returned an unexpected response (status ${res.status}). Check the server logs.`);
        return;
      }

      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setMessages([...nextMessages, { role: "assistant", content: data.answer ?? "" }]);
      setLastTrace(data.tool_calls ?? []);
    } catch {
      setError("Could not reach the server. Check your network connection and that the app is running.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen flex-col px-8 py-8">
      <h1 className="font-serif text-2xl">AI assistant</h1>
      <p className="mt-1 max-w-xl text-sm text-ink-700">
        Answers are grounded in the application database and the trained churn model - see which
        tools were called below each response.
      </p>

      <div className="mt-6 flex-1 overflow-y-auto border-t border-paper-400 pt-6">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="border border-paper-400 px-3 py-1.5 text-left text-xs text-ink-700 hover:border-accent-500 hover:text-accent-600"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-6">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : ""}>
              <p
                className={`inline-block max-w-lg whitespace-pre-wrap px-4 py-2.5 text-sm ${
                  m.role === "user" ? "bg-ink-900 text-ink-100" : "bg-paper-100 text-paper-ink"
                }`}
              >
                {m.content}
              </p>
            </div>
          ))}
        </div>

        {loading && <p className="mt-4 text-xs text-ink-400">Querying the database and model...</p>}
        {error && <p className="mt-4 text-sm text-risk-critical">{error}</p>}

        {lastTrace.length > 0 && !loading && (
          <div className="mt-4 border border-paper-400 p-3">
            <p className="font-mono text-xs text-ink-400">tools called</p>
            <ul className="mt-2 space-y-1">
              {lastTrace.map((t, i) => (
                <li key={i} className="font-mono text-xs text-ink-500">
                  {t.tool}({JSON.stringify(t.input)})
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-4 flex gap-2 border-t border-paper-400 pt-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about a customer or the overall customer base"
          className="flex-1 border border-paper-400 bg-paper-100 px-3 py-2 text-sm outline-none focus-visible:border-accent-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-accent-500 px-4 py-2 text-sm text-ink-100 hover:bg-accent-600 disabled:opacity-50"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
