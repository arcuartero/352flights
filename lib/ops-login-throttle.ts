/**
 * Edge-safe throttle for /ops Basic Auth. Talks to PostgREST with fetch so it
 * can run in middleware; fails open so a missing migration never locks Ops out.
 */
export const OPS_LOGIN_MAX_FAILURES = 10;
export const OPS_LOGIN_WINDOW_SECONDS = 15 * 60;

function clientIp(request: Request) {
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function bucketKey(ip: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`ops-login\n${ip}`),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `ops-login:${hex}`;
}

/** Returns false when this client is locked out; records the attempt when it failed. */
export async function opsLoginAllowed(request: Request, failed: boolean) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return true;

  try {
    const response = await fetch(`${url}/rest/v1/rpc/check_failed_attempts`, {
      method: "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        p_key: await bucketKey(clientIp(request)),
        p_limit: OPS_LOGIN_MAX_FAILURES,
        p_window_seconds: OPS_LOGIN_WINDOW_SECONDS,
        p_record_failure: failed,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) !== false;
  } catch (error) {
    console.warn("[ops-login-throttle] unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}
