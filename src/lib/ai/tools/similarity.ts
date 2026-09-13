import { isAstraConfigured } from "@/lib/astra/client";
import { findSimilarCustomers } from "@/lib/astra/similarity";
import { prisma } from "@/lib/prisma";
import type { ToolDefinition } from "./types";

export const searchSimilarCustomersTool: ToolDefinition = {
  name: "search_similar_customers",
  description:
    "Find customers behaviorally similar to a given customer, based on usage, commerce, support, and sentiment patterns (not text similarity). Optionally restrict to customers who went on to churn - useful for 'find customers like X who eventually churned' questions.",
  input_schema: {
    type: "object",
    properties: {
      customer_id: { type: "string" },
      only_churned: { type: "boolean", description: "If true, only return customers whose outcome was churn." },
      limit: { type: "number", description: "Max results, default 5." },
    },
    required: ["customer_id"],
  },
  execute: async (input, ctx) => {
    if (!isAstraConfigured()) {
      return {
        error:
          "Astra DB is not configured in this environment, so behavioral similarity search is unavailable. " +
          "This is a real, implemented capability (src/lib/astra/) - it just needs ASTRA_DB_API_ENDPOINT and " +
          "ASTRA_DB_APPLICATION_TOKEN set, and `npm run astra:sync` run once to populate it.",
      };
    }

    const customer = await prisma.customer.findFirst({
      where: { id: input.customer_id as string, organizationId: ctx.organizationId },
    });
    if (!customer) return { error: `No customer found with id ${input.customer_id}` };

    try {
      const results = await findSimilarCustomers(customer.id, ctx.organizationId, {
        onlyChurned: Boolean(input.only_churned),
        limit: Math.min(Number(input.limit ?? 5), 20),
      });
      return { source_customer_id: customer.id, similar_customers: results };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Similarity search failed." };
    }
  },
};
