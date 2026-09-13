import { prisma } from "@/lib/prisma";
import { getCustomer, getCustomerTimeline } from "@/lib/queries";
import type { ToolDefinition } from "./types";

export const getChurnPredictionTool: ToolDefinition = {
  name: "get_churn_prediction",
  description:
    "Get a customer's current churn probability, risk level, and the specific factors driving it (from SHAP). Use this to answer 'why is X at risk'.",
  input_schema: {
    type: "object",
    properties: { customer_id: { type: "string" } },
    required: ["customer_id"],
  },
  execute: async (input, ctx) => {
    const customer = await getCustomer(ctx.organizationId, input.customer_id as string);
    if (!customer) return { error: `No customer found with id ${input.customer_id}` };
    if (!customer.prediction) return { error: "This customer has not been scored yet." };
    return {
      customer_id: customer.id,
      churn_probability: customer.prediction.churnProbability,
      risk_level: customer.prediction.riskLevel,
      model_id: customer.prediction.modelId,
      model_version: customer.prediction.modelVersion,
      predicted_at: customer.prediction.predictedAt.toISOString(),
      top_contributors: customer.prediction.topContributors,
    };
  },
};

export const getPredictionHistoryTool: ToolDefinition = {
  name: "get_prediction_history",
  description: "Get the full history of churn-probability predictions for a customer over time, to answer questions about how risk has changed.",
  input_schema: {
    type: "object",
    properties: { customer_id: { type: "string" } },
    required: ["customer_id"],
  },
  execute: async (input, ctx) => {
    const customer = await prisma.customer.findFirst({
      where: { id: input.customer_id as string, organizationId: ctx.organizationId },
    });
    if (!customer) return { error: `No customer found with id ${input.customer_id}` };
    const history = await prisma.predictionHistory.findMany({
      where: { customerId: customer.id },
      orderBy: { predictedAt: "asc" },
    });
    return {
      customer_id: customer.id,
      history: history.map((h) => ({
        predicted_at: h.predictedAt.toISOString(),
        churn_probability: h.churnProbability,
        risk_level: h.riskLevel,
      })),
    };
  },
};

export const getCustomerTimelineTool: ToolDefinition = {
  name: "get_customer_timeline",
  description:
    "Get a chronological timeline of a customer's events (logins, feature use, purchases, refunds, support tickets, sentiment records, prediction changes). Optionally filter by event type.",
  input_schema: {
    type: "object",
    properties: {
      customer_id: { type: "string" },
      event_types: {
        type: "array",
        items: { type: "string", enum: ["login", "feature_use", "purchase", "refund", "support", "sentiment", "prediction", "subscription_cancelled"] },
        description: "Optional: only include these event types.",
      },
      limit: { type: "number", description: "Max entries, default 20." },
    },
    required: ["customer_id"],
  },
  execute: async (input, ctx) => {
    const customer = await prisma.customer.findFirst({
      where: { id: input.customer_id as string, organizationId: ctx.organizationId },
    });
    if (!customer) return { error: `No customer found with id ${input.customer_id}` };
    const eventTypes = input.event_types as string[] | undefined;
    const timeline = await getCustomerTimeline(customer.id, eventTypes);
    const limit = Math.min(Number(input.limit ?? 20), 100);
    return {
      customer_id: customer.id,
      events: timeline.slice(0, limit).map((e) => ({
        date: e.occurredAt.toISOString().slice(0, 10),
        type: e.type,
        summary: e.summary,
      })),
    };
  },
};

export const getSupportHistoryTool: ToolDefinition = {
  name: "get_support_history",
  description: "Get a customer's support ticket history, including open/unresolved tickets and response times.",
  input_schema: {
    type: "object",
    properties: { customer_id: { type: "string" } },
    required: ["customer_id"],
  },
  execute: async (input, ctx) => {
    const customer = await prisma.customer.findFirst({
      where: { id: input.customer_id as string, organizationId: ctx.organizationId },
    });
    if (!customer) return { error: `No customer found with id ${input.customer_id}` };
    const tickets = await prisma.supportTicket.findMany({
      where: { customerId: customer.id },
      orderBy: { openedAt: "desc" },
      take: 20,
    });
    return {
      customer_id: customer.id,
      unresolved_count: tickets.filter((t) => !t.resolved).length,
      tickets: tickets.map((t) => ({
        opened_at: t.openedAt.toISOString().slice(0, 10),
        resolved: t.resolved,
        response_time_hours: t.responseTimeHours,
        resolution_time_hours: t.resolutionTimeHours,
        repeat_ticket: t.repeatTicket,
      })),
    };
  },
};

export const getSentimentHistoryTool: ToolDefinition = {
  name: "get_sentiment_history",
  description: "Get a customer's sentiment history from support interactions and feedback, including the trend over time.",
  input_schema: {
    type: "object",
    properties: { customer_id: { type: "string" } },
    required: ["customer_id"],
  },
  execute: async (input, ctx) => {
    const customer = await prisma.customer.findFirst({
      where: { id: input.customer_id as string, organizationId: ctx.organizationId },
    });
    if (!customer) return { error: `No customer found with id ${input.customer_id}` };
    const records = await prisma.sentimentResult.findMany({
      where: { customerId: customer.id },
      orderBy: { occurredAt: "desc" },
      take: 20,
    });
    return {
      customer_id: customer.id,
      records: records.map((s) => ({
        date: s.occurredAt.toISOString().slice(0, 10),
        source: s.source,
        label: s.sentimentLabel,
        score: s.sentimentScore,
        message: s.message,
      })),
    };
  },
};
