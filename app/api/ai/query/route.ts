import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { getAIClient, getAIModel } from "@/lib/ai/provider";
import { ALL_TOOLS, getToolByName } from "@/lib/ai/tools";
import { ASSISTANT_SYSTEM_PROMPT } from "@/lib/ai/prompts/assistant";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

type IncomingMessage = { role: "user" | "assistant"; content: string };

const MAX_TOOL_ITERATIONS = 6;
const RATE_LIMIT_PER_MINUTE = 20;

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = checkRateLimit(`ai-query:${session.user.id}`, RATE_LIMIT_PER_MINUTE, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests. Wait a moment and try again." }, { status: 429 });
    }

    let body: { messages?: IncomingMessage[] };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    if (!body.messages?.length) {
      return NextResponse.json({ error: "messages is required" }, { status: 400 });
    }

    let client: Anthropic;
    try {
      client = getAIClient();
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "AI provider not configured" }, { status: 503 });
    }

    const messages: Anthropic.MessageParam[] = body.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const toolTrace: Array<{ tool: string; input: unknown; output: unknown }> = [];
    const ctx = { organizationId: session.user.organizationId };

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      let response;
      try {
        response = await client.messages.create({
          model: getAIModel(),
          max_tokens: 1024,
          system: ASSISTANT_SYSTEM_PROMPT,
          tools: ALL_TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema as Anthropic.Tool.InputSchema,
          })),
          messages,
        });
      } catch (err) {
        console.error("Anthropic API call failed:", err);
        const message = describeAnthropicError(err);
        return NextResponse.json({ error: message }, { status: 502 });
      }

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      if (toolUseBlocks.length === 0) {
        const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
        return NextResponse.json({
          answer: textBlock?.text ?? "",
          tool_calls: toolTrace,
        });
      }

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        const tool = getToolByName(block.name);
        let output: unknown;
        if (!tool) {
          output = { error: `Unknown tool: ${block.name}` };
        } else {
          try {
            output = await tool.execute(block.input as Record<string, unknown>, ctx);
          } catch (err) {
            console.error(`Tool ${block.name} failed:`, err);
            output = { error: err instanceof Error ? err.message : "Tool execution failed" };
          }
        }
        toolTrace.push({ tool: block.name, input: block.input, output });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(output),
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    return NextResponse.json(
      { error: "The assistant made too many tool calls without reaching an answer. Try a narrower question." },
      { status: 500 }
    );
  } catch (err) {
    // Last-resort guard: no matter what fails above, always return valid
    // JSON. Without this, an unhandled exception here returns Next.js's
    // HTML error page, which breaks res.json() on the client and surfaces
    // as an opaque "could not reach the assistant" rather than a real
    // error message - this is the bug that caused exactly that symptom.
    console.error("Unhandled error in /api/ai/query:", err);
    return NextResponse.json(
      { error: "The assistant hit an unexpected server error. Check the server logs for details." },
      { status: 500 }
    );
  }
}

function describeAnthropicError(err: unknown): string {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: number }).status;
    if (status === 401) return "Anthropic API key was rejected. Check ANTHROPIC_API_KEY in your .env file.";
    if (status === 400) return "Anthropic rejected the request - if you just created your account, make sure billing/credits are set up at console.anthropic.com.";
    if (status === 429) return "Anthropic API rate limit hit. Wait a moment and try again.";
    if (status && status >= 500) return "Anthropic's API is temporarily unavailable. Try again shortly.";
  }
  return err instanceof Error ? `Anthropic API error: ${err.message}` : "Anthropic API call failed.";
}
