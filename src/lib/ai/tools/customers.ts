import { prisma } from "@/lib/prisma";
import { getCustomer, listCustomers } from "@/lib/queries";
import type { ToolDefinition } from "./types";

export const searchCustomersTool: ToolDefinition = {
  name: "search_customers",
  description:
    "Search customers by name and/or filter by risk level. Returns up to `limit` matches with their current churn prediction. Use this to answer questions like 'which customers are at high risk' or 'find customers named Acme'.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Substring to match against customer name. Omit to list without a name filter." },
      risk_level: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], description: "Filter to a single risk band." },
      limit: { type: "number", description: "Max results, default 10, max 50." },
    },
  },
  execute: async (input, ctx) => {
    const limit = Math.min(Number(input.limit ?? 10), 50);
    const { rows, total } = await listCustomers({
      organizationId: ctx.organizationId,
      search: input.query as string | undefined,
      riskLevel: input.risk_level as string | undefined,
      sortBy: "risk",
      sortDir: "desc",
      pageSize: limit,
    });
    return {
      total_matches: total,
      customers: rows.map((c) => ({
        customer_id: c.id,
        name: c.name,
        status: c.status,
        subscription_type: c.subscriptionType,
        monthly_revenue: Number(c.monthlyRevenue),
        churn_probability: c.prediction?.churnProbability ?? null,
        risk_level: c.prediction?.riskLevel ?? null,
      })),
    };
  },
};

export const getCustomerTool: ToolDefinition = {
  name: "get_customer",
  description: "Get full profile and current churn prediction for one customer by their exact customer_id (e.g. CUS-100042).",
  input_schema: {
    type: "object",
    properties: { customer_id: { type: "string" } },
    required: ["customer_id"],
  },
  execute: async (input, ctx) => {
    const customer = await getCustomer(ctx.organizationId, input.customer_id as string);
    if (!customer) return { error: `No customer found with id ${input.customer_id}` };
    return {
      customer_id: customer.id,
      name: customer.name,
      industry: customer.industry,
      region: customer.region,
      subscription_type: customer.subscriptionType,
      contract_type: customer.contractType,
      monthly_revenue: Number(customer.monthlyRevenue),
      status: customer.status,
      signup_date: customer.signupDate.toISOString().slice(0, 10),
      segment: customer.segmentMembership?.segment.name ?? null,
      prediction: customer.prediction
        ? {
            churn_probability: customer.prediction.churnProbability,
            risk_level: customer.prediction.riskLevel,
            model_version: customer.prediction.modelVersion,
            predicted_at: customer.prediction.predictedAt.toISOString(),
          }
        : null,
    };
  },
};

export const getCustomerFeaturesTool: ToolDefinition = {
  name: "get_customer_features",
  description: "Get the raw engineered feature values (usage, commerce, support, sentiment) the model used for a customer's most recent prediction.",
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
    const snapshot = await prisma.customerFeatureSnapshot.findFirst({
      where: { customerId: customer.id },
      orderBy: { snapshotDate: "desc" },
    });
    if (!snapshot) return { error: "No feature snapshot on file for this customer." };
    return { customer_id: customer.id, snapshot_date: snapshot.snapshotDate.toISOString().slice(0, 10), features: snapshot.rawFeatures };
  },
};
