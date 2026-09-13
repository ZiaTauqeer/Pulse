import { prisma } from "@/lib/prisma";
import type { ToolDefinition } from "./types";

export const getSegmentsTool: ToolDefinition = {
  name: "get_segments",
  description:
    "List all customer segments (from K-means clustering) with their size, average revenue, and average churn probability. Use this for 'which segment has the highest churn' type questions.",
  input_schema: { type: "object", properties: {} },
  execute: async (_input, ctx) => {
    const segments = await prisma.segment.findMany({
      where: { memberships: { some: { customer: { organizationId: ctx.organizationId } } } },
      include: { _count: { select: { memberships: true } } },
    });
    if (segments.length === 0) {
      return { error: "No segments have been computed yet. Run `npm run segments:sync` to generate them." };
    }
    return {
      segments: segments.map((s) => ({
        segment_id: s.id,
        name: s.name,
        description: s.description,
        customer_count: s._count.memberships,
        characteristics: s.characteristics,
      })),
    };
  },
};

export const getSegmentCustomersTool: ToolDefinition = {
  name: "get_segment_customers",
  description: "Get the customers belonging to a specific segment by segment_id (use get_segments first to find the id).",
  input_schema: {
    type: "object",
    properties: { segment_id: { type: "string" }, limit: { type: "number", description: "Max results, default 20." } },
    required: ["segment_id"],
  },
  execute: async (input, ctx) => {
    const segment = await prisma.segment.findFirst({
      where: { id: input.segment_id as string, memberships: { some: { customer: { organizationId: ctx.organizationId } } } },
      include: {
        memberships: {
          take: Math.min(Number(input.limit ?? 20), 100),
          include: { customer: { include: { prediction: true } } },
        },
      },
    });
    if (!segment) return { error: `No segment found with id ${input.segment_id}` };
    return {
      segment_name: segment.name,
      customers: segment.memberships.map((m: { customer: { id: string; name: string; prediction: { churnProbability: number; riskLevel: string } | null } }) => ({
        customer_id: m.customer.id,
        name: m.customer.name,
        churn_probability: m.customer.prediction?.churnProbability ?? null,
        risk_level: m.customer.prediction?.riskLevel ?? null,
      })),
    };
  },
};
