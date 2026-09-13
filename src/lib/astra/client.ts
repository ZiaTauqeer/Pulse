import { DataAPIClient, type Collection } from "@datastax/astra-db-ts";

/**
 * Astra DB is used for exactly one real purpose in PULSE: behavioral
 * similarity search ("customers similar to ACME who eventually churned").
 * The "embedding" here is not a text embedding from an LLM - it's PULSE's
 * own engineered feature vector (the same features the churn model trains
 * on: usage, commerce, support, sentiment), z-score normalized. That's a
 * deliberate choice: for "find behaviorally similar customers", a
 * domain-specific numeric vector is more meaningful than a generic text
 * embedding of a customer description would be. See src/lib/astra/vectors.ts.
 *
 * Per spec section 4 ("do not pretend a third-party service is connected
 * if valid credentials aren't present"), every function here throws a
 * clear, specific error if Astra isn't configured - it never silently
 * no-ops or returns fake results.
 */

const COLLECTION_NAME = "customer_behavior_vectors";
const VECTOR_DIMENSION_ENV = "ASTRA_VECTOR_DIMENSION";

export function isAstraConfigured(): boolean {
  return Boolean(process.env.ASTRA_DB_API_ENDPOINT && process.env.ASTRA_DB_APPLICATION_TOKEN);
}

let cachedClient: DataAPIClient | null = null;

function getClient(): DataAPIClient {
  const token = process.env.ASTRA_DB_APPLICATION_TOKEN;
  if (!token) {
    throw new Error(
      "ASTRA_DB_APPLICATION_TOKEN is not set. Astra-backed features (customer similarity search) " +
        "are unavailable until it's configured - see .env.example."
    );
  }
  if (!cachedClient) cachedClient = new DataAPIClient(token);
  return cachedClient;
}

export function getAstraDb() {
  const endpoint = process.env.ASTRA_DB_API_ENDPOINT;
  if (!endpoint) {
    throw new Error(
      "ASTRA_DB_API_ENDPOINT is not set. Astra-backed features (customer similarity search) " +
        "are unavailable until it's configured - see .env.example."
    );
  }
  return getClient().db(endpoint);
}

export type CustomerVectorDoc = {
  _id: string; // customer_id
  organizationId: string;
  status: "ACTIVE" | "CHURNED";
  churnedWithinWindow: boolean | null;
  $vector: number[];
};

export async function getCustomerVectorCollection(): Promise<Collection<CustomerVectorDoc>> {
  const db = getAstraDb();
  const dimension = Number(process.env[VECTOR_DIMENSION_ENV] ?? 24);
  const existing = await db.listCollections();
  if (!existing.some((c) => c.name === COLLECTION_NAME)) {
    await db.createCollection<CustomerVectorDoc>(COLLECTION_NAME, {
      vector: { dimension, metric: "cosine" },
    });
  }
  return db.collection<CustomerVectorDoc>(COLLECTION_NAME);
}
