import { prisma } from "@/lib/prisma";
import { getOrgSummary } from "@/lib/queries";
import type { ToolDefinition } from "./types";

export const getAnalyticsTool: ToolDefinition = {
  name: "get_analytics",
  description:
    "Get organization-wide churn analytics: total/active customer counts, risk-level distribution, and average churn probability. Use this for 'how many customers are at risk' or 'what does churn look like overall' type questions.",
  input_schema: { type: "object", properties: {} },
  execute: async (_input, ctx) => {
    const summary = await getOrgSummary(ctx.organizationId);
    return {
      total_customers: summary.total,
      active_customers: summary.active,
      average_churn_probability: summary.avgProbability,
      risk_distribution: Object.fromEntries(summary.riskGroups.map((g) => [g.riskLevel, g._count._all])),
    };
  },
};

export const getModelVersionTool: ToolDefinition = {
  name: "get_model_version",
  description: "Get metadata about the current production churn model: algorithm, version, training date, and evaluation metrics.",
  input_schema: { type: "object", properties: {} },
  execute: async () => {
    const model = await prisma.modelVersion.findFirst({
      where: { status: "PRODUCTION" },
      orderBy: { trainedAt: "desc" },
    });
    if (!model) return { error: "No production model registered." };
    return {
      model_id: model.modelId,
      version: model.version,
      algorithm: model.algorithm,
      trained_at: model.trainedAt.toISOString(),
      metrics: model.metrics,
    };
  },
};
