import Anthropic from "@anthropic-ai/sdk";

/**
 * AI_PROVIDER abstraction (spec section 4): the rest of the app calls
 * `getAIClient()` / `getAIModel()` rather than importing a specific SDK
 * directly, so swapping providers later is a change in this one file, not
 * a hunt through every call site.
 *
 * Currently only "anthropic" is implemented. Do not claim a provider is
 * connected without valid credentials - getAIClient() throws clearly if
 * ANTHROPIC_API_KEY is missing rather than silently returning a
 * non-functional client.
 */
export type AIProvider = "anthropic";

const provider = (process.env.AI_PROVIDER ?? "anthropic") as AIProvider;

export function getAIProvider(): AIProvider {
  return provider;
}

export function getAIClient(): Anthropic {
  if (provider !== "anthropic") {
    throw new Error(`AI_PROVIDER=${provider} is not implemented. See src/lib/ai/provider.ts.`);
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. The AI assistant cannot run without it - set it in your environment (see .env.example)."
    );
  }
  return new Anthropic({ apiKey });
}

export function getAIModel(): string {
  // Centralized so a model upgrade is a one-line change, not a grep.
  return process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
}
