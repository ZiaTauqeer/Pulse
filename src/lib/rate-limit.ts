/**
 * Minimal in-memory rate limiter.
 *
 * This works correctly for a single Node process, which covers local dev
 * and a single-instance deployment - but Vercel's serverless functions
 * are NOT a single process (each invocation may run on a different
 * instance), so this does NOT actually enforce a global limit in a real
 * multi-instance Vercel deployment. For that, replace this with
 * Upstash Redis (`@upstash/ratelimit` + `@upstash/redis`), which the spec
 * calls for under "Redis / Upstash where appropriate" - swap the
 * implementation of `checkRateLimit` below and every call site is
 * unaffected.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count };
}
