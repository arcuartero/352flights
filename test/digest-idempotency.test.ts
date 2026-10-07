import assert from "node:assert/strict";
import test from "node:test";
import { deliverDigestOnce, DIGEST_SAFE_RETRY_MS, type DigestMessage, type DigestMessageStore } from "../lib/digest-idempotency";

function fixture() {
  const messages = new Map<string, DigestMessage<{ text: string }>>();
  let failAcknowledgement = false;
  const store: DigestMessageStore<{ text: string }> = {
    async reserve(key, payload) {
      if (!messages.has(key)) messages.set(key, { payload, firstAttemptAt: new Date(0).toISOString(), providerMessageId: null });
      return messages.get(key)!;
    },
    async acknowledge(key, id) {
      if (failAcknowledgement) { failAcknowledgement = false; throw new Error("database unavailable"); }
      messages.get(key)!.providerMessageId = id;
    },
  };
  return { store, failAck() { failAcknowledgement = true; } };
}

test("successful delivery is remembered permanently, beyond Resend's 24h window", async () => {
  const { store } = fixture(); let sends = 0;
  const send = async () => { sends++; return "provider-id"; };
  await deliverDigestOnce(store, "digest-date-subscriber", { text: "original" }, send, 0);
  await deliverDigestOnce(store, "digest-date-subscriber", { text: "new deals" }, send, 48 * 3600000);
  assert.equal(sends, 1);
});

test("retry after provider success and database failure uses the exact original body", async () => {
  const f = fixture(); const delivered = new Map<string, string>(); let physicalEmails = 0;
  const send = async (payload: { text: string }) => {
    if (!delivered.has(payload.text)) { physicalEmails++; delivered.set(payload.text, "id"); }
    return delivered.get(payload.text)!;
  };
  f.failAck();
  await assert.rejects(deliverDigestOnce(f.store, "daily-key", { text: "original" }, send, 0), /database/);
  await deliverDigestOnce(f.store, "daily-key", { text: "changed" }, send, 1000);
  assert.equal(physicalEmails, 1);
});

test("parallel reservations converge on one payload and provider idempotency key", async () => {
  const { store } = fixture(); const bodies: string[] = [];
  await Promise.all(["one", "two"].map((text) => deliverDigestOnce(store, "same-key", { text }, async (payload) => {
    bodies.push(payload.text); return "same-provider-id";
  }, 0)));
  assert.deepEqual(bodies, ["one", "one"]);
});

test("ambiguous delivery past the safe retry window fails closed", async () => {
  const { store } = fixture();
  await assert.rejects(deliverDigestOnce(store, "daily-key", { text: "original" }, async () => { throw new Error("timeout"); }, 0));
  let sends = 0;
  await assert.rejects(deliverDigestOnce(store, "daily-key", { text: "original" }, async () => { sends++; return "id"; }, DIGEST_SAFE_RETRY_MS), /reconciliation/);
  assert.equal(sends, 0);
});
