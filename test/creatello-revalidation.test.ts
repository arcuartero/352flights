import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifyRevalidationSignature } from "../lib/creatello-revalidation";

test("accepts a fresh valid Creatello revalidation signature", () => {
  const now = Date.UTC(2026, 8, 9, 12, 0, 0);
  const timestamp = String(now);
  const body = JSON.stringify({ source: "352flights" });
  const secret = "a-secure-revalidation-secret-with-more-than-32-characters";
  const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
  assert.equal(verifyRevalidationSignature(body, timestamp, signature, secret, now), true);
});

test("rejects an invalid or stale Creatello revalidation signature", () => {
  const secret = "a-secure-revalidation-secret-with-more-than-32-characters";
  assert.equal(verifyRevalidationSignature("{}", "1788955200000", "sha256=wrong", secret, 1788955200000), false);
  const old = String(Date.UTC(2026, 8, 9, 11, 0, 0));
  const signature = `sha256=${createHmac("sha256", secret).update(`${old}.{}`).digest("hex")}`;
  assert.equal(verifyRevalidationSignature("{}", old, signature, secret, Date.UTC(2026, 8, 9, 12, 0, 0)), false);
});

