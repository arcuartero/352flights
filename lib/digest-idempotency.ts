// Resend retains keys for 24 hours. Leave a one-hour margin for clock skew and retries.
export const DIGEST_SAFE_RETRY_MS = 23 * 60 * 60 * 1000;
export type DigestMessage<T> = { payload: T; firstAttemptAt: string; providerMessageId: string | null };
export type DigestMessageStore<T> = {
  reserve: (key: string, payload: T) => Promise<DigestMessage<T>>;
  acknowledge: (key: string, providerMessageId: string) => Promise<void>;
};

export async function deliverDigestOnce<T>(
  store: DigestMessageStore<T>,
  key: string,
  payload: T,
  send: (savedPayload: T) => Promise<string>,
  now = Date.now(),
) {
  const saved = await store.reserve(key, payload);
  if (saved.providerMessageId) return saved.providerMessageId;
  const firstAttempt = Date.parse(saved.firstAttemptAt);
  if (!Number.isFinite(firstAttempt) || now - firstAttempt >= DIGEST_SAFE_RETRY_MS) {
    throw new Error("Digest delivery needs provider reconciliation: safe retry window expired.");
  }
  // Concurrent callers use the same key AND exact payload at the provider.
  const providerMessageId = await send(saved.payload);
  await store.acknowledge(key, providerMessageId);
  return providerMessageId;
}
