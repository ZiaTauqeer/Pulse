import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const execFileAsync = promisify(execFile);

const ML_DIR = process.env.ML_DIR ?? path.resolve(process.cwd(), "ml");

export type Contributor = {
  feature: string;
  raw_feature: string | null;
  customer_value: number | string | null;
  contribution: number;
  direction: "increases_risk" | "decreases_risk";
};

export type InferenceResult = {
  customer_id: string | null;
  churn_probability: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  model_id: string;
  model_version: string;
  recommended_threshold: number;
  top_contributors: Contributor[];
};

export class InferenceError extends Error {}

/**
 * Runs the real trained model against a single customer's feature dict by
 * shelling out to `python -m pipeline.predict --from-json`, the same
 * production model artifact every other prediction in the app uses (see
 * ml/src/inference/predict.py predict_from_features). This is the only
 * place in the Node codebase that calls into the ML pipeline for a live
 * scoring request - if this fails, no fallback or fake value is used.
 */
export async function scoreCustomerFeatures(
  features: Record<string, unknown>,
  customerId: string | null = null
): Promise<InferenceResult> {
  const tmpPath = path.join(os.tmpdir(), `pulse-score-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  await fs.writeFile(tmpPath, JSON.stringify({ customer_id: customerId, features }));

  try {
    const { stdout } = await execFileAsync("python3", ["-m", "pipeline.predict", "--from-json", tmpPath], {
      cwd: ML_DIR,
      timeout: 30_000,
    });
    return JSON.parse(stdout) as InferenceResult;
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr;
    throw new InferenceError(
      stderr
        ? `ML inference failed: ${stderr.trim().split("\n").slice(-3).join(" ")}`
        : `ML inference failed: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}

let cachedFeatureVersion: string | null = null;

/** Reads the current feature_version from the ML pipeline's own manifest -
 * never hardcoded, so it can't drift from what the model was actually trained on. */
export async function getFeatureVersion(): Promise<string> {
  if (cachedFeatureVersion) return cachedFeatureVersion;
  const manifestPath = path.join(ML_DIR, "artifacts/metadata/feature_manifest.json");
  const raw = await fs.readFile(manifestPath, "utf-8");
  const manifest = JSON.parse(raw) as { feature_version: string };
  cachedFeatureVersion = manifest.feature_version;
  return cachedFeatureVersion;
}
