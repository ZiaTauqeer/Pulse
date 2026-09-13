import { prisma } from "@/lib/prisma";
import { getAIClient, getAIModel } from "@/lib/ai/provider";

const RECOMMENDATION_PROMPT = `You write one concrete, actionable recommendation for a customer-success team about a specific at-risk customer.

Rules:
- Base the recommendation ONLY on the evidence provided below. Do not invent facts, numbers, or events not present in the evidence.
- Respond with strict JSON only, no other text: {"recommendation": string, "evidence": string[]}
- "recommendation" is one or two sentences, specific and actionable (e.g. what to do and roughly why), not generic advice.
- "evidence" is a short list (2-5 items) of the specific facts from the input that justify the recommendation, written as plain statements a human can verify against the data.`;

export async function generateRecommendation(customerId: string, organizationId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    include: { prediction: true },
  });
  if (!customer) throw new Error(`No customer found with id ${customerId}`);
  if (!customer.prediction) throw new Error("Customer has not been scored yet.");

  const [openTickets, recentSentiment, recentEvents] = await Promise.all([
    prisma.supportTicket.findMany({ where: { customerId, resolved: false }, orderBy: { openedAt: "desc" }, take: 5 }),
    prisma.sentimentResult.findMany({ where: { customerId }, orderBy: { occurredAt: "desc" }, take: 5 }),
    prisma.customerEvent.findMany({ where: { customerId }, orderBy: { occurredAt: "desc" }, take: 10 }),
  ]);

  const evidenceInput = {
    customer_name: customer.name,
    churn_probability: customer.prediction.churnProbability,
    risk_level: customer.prediction.riskLevel,
    top_contributors: customer.prediction.topContributors,
    open_support_tickets: openTickets.map((t) => ({
      opened_at: t.openedAt.toISOString().slice(0, 10),
      response_time_hours: t.responseTimeHours,
    })),
    recent_sentiment: recentSentiment.map((s) => ({ label: s.sentimentLabel, date: s.occurredAt.toISOString().slice(0, 10) })),
    recent_events: recentEvents.map((e) => ({ type: e.eventType, date: e.occurredAt.toISOString().slice(0, 10) })),
  };

  const client = getAIClient();
  const response = await client.messages.create({
    model: getAIModel(),
    max_tokens: 500,
    system: RECOMMENDATION_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(evidenceInput) }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text response from the model.");

  let parsed: { recommendation: string; evidence: string[] };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new Error("Model did not return valid JSON for the recommendation.");
  }

  return prisma.recommendation.create({
    data: {
      customerId: customer.id,
      text: parsed.recommendation,
      evidence: parsed.evidence,
      status: "OPEN",
    },
  });
}
