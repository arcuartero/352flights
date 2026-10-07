/** Edge-safe secret helpers shared by middleware, cron routes and webhooks. */
const encoder = new TextEncoder();

/** Compares in time proportional to the longer input, independent of where the first difference is. */
export function constantTimeEqual(actual: string, expected: string) {
  const a = encoder.encode(actual);
  const b = encoder.encode(expected);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

export function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
}

/** True when the token matches any configured (non-empty) secret. */
export function matchesAnySecret(
  token: string | null,
  secrets: Array<string | undefined>,
) {
  if (!token) return false;
  let matched = false;
  for (const secret of secrets) {
    if (secret && constantTimeEqual(token, secret)) matched = true;
  }
  return matched;
}
