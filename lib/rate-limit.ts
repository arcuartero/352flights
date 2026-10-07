import "server-only";

import { createHash } from "node:crypto";

import { getSupabaseAdminClient } from "@/lib/supabase";

export type RateLimitRule = {
  scope: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
};

/** First hop of X-Forwarded-For as set by Vercel or the reverse proxy; spoofable only when no proxy overwrites it. */
export function clientIp(request: Request) {
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function bucketKey(rule: RateLimitRule) {
  const digest = createHash("sha256")
    .update(`${rule.scope}\n${rule.identifier.toLowerCase()}`)
    .digest("hex");
  return `${rule.scope}:${digest}`;
}

/**
 * Returns false once any rule is exceeded. Fails open (with a log) when the
 * limiter itself is unavailable, so a missing migration never blocks signups.
 */
export async function withinRateLimits(rules: RateLimitRule[]) {
  const supabase = getSupabaseAdminClient();
  const results = await Promise.all(
    rules.map(async (rule) => {
      const { data, error } = await supabase.rpc("consume_rate_limit", {
        p_key: bucketKey(rule),
        p_limit: rule.limit,
        p_window_seconds: rule.windowSeconds,
      });
      if (error) {
        console.warn("[rate-limit] limiter unavailable", {
          scope: rule.scope,
          error: error.message,
        });
        return true;
      }
      return data !== false;
    }),
  );
  return results.every(Boolean);
}
