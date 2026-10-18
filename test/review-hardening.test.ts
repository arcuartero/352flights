import "./helpers/server-runtime";
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { NextRequest } from "next/server";

import { constantTimeEqual, matchesAnySecret } from "../lib/secret-compare";
import { sendResendEmail } from "../lib/email";
import { POST as revalidate } from "../app/api/public-deals/revalidate/route";
import {
  GET as oneClickGet,
  POST as oneClickPost,
} from "../app/api/unsubscribe/one-click/route";
import { POST as subscribe } from "../app/api/subscribe/route";
import { POST as contact } from "../app/api/contact/route";

const token = "00000000-0000-4000-8000-000000000002";
const originalFetch = globalThis.fetch;
const oldEnv = { ...process.env };
let requests: Array<{ url: URL; init?: RequestInit }>;
let rateLimitAllowed: boolean;
let subscriber: Record<string, unknown>;

beforeEach(() => {
  process.env.SUPABASE_URL = "https://hardening-storage.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  process.env.CRON_SECRET = "cron-test-only";
  process.env.RESEND_API_KEY = "resend-test-only";
  requests = [];
  rateLimitAllowed = true;
  subscriber = {
    id: token,
    email: "reader@example.test",
    status: "active",
    email_confirmed: true,
    onboarding_completed: true,
    preference_token: token,
    confirmation_token: token,
    unsubscribe_token: token,
    preferred_locale: "en",
    welcome_email_sent_at: null,
  };
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    if (url.hostname === "api.resend.com") {
      return Response.json({ id: "email-test-id" });
    }
    assert.equal(url.hostname, "hardening-storage.test", "No external calls");
    if (url.pathname.endsWith("/rpc/consume_rate_limit")) {
      return Response.json(rateLimitAllowed);
    }
    if (init?.method === "PATCH") {
      Object.assign(subscriber, JSON.parse(String(init.body)));
      return Response.json([subscriber]);
    }
    return Response.json([subscriber]);
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...oldEnv };
});

const resendCalls = () =>
  requests.filter(({ url }) => url.hostname === "api.resend.com");

test("secret comparison matches exactly and ignores empty configured secrets", () => {
  assert.equal(constantTimeEqual("abc", "abc"), true);
  assert.equal(constantTimeEqual("abc", "abd"), false);
  assert.equal(constantTimeEqual("abc", "abcd"), false);
  assert.equal(constantTimeEqual("ñ", "n"), false);
  assert.equal(matchesAnySecret("x", [undefined, ""]), false);
  assert.equal(matchesAnySecret(null, ["x"]), false);
  assert.equal(matchesAnySecret("b", ["a", "b"]), true);
});

test("cache revalidation rejects the Supabase service-role key", async () => {
  const call = (bearer: string) =>
    revalidate(
      new NextRequest("https://example.test/api/public-deals/revalidate", {
        method: "POST",
        headers: { authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ cities: [] }),
      }),
    );
  assert.equal((await call("service-role-test-only")).status, 401);
  // Authorized, then rejected only for the empty city list.
  assert.equal((await call("cron-test-only")).status, 400);
});

test("campaign emails carry RFC 8058 one-click unsubscribe headers", async () => {
  await sendResendEmail({
    to: "reader@example.test",
    subject: "Deals",
    html: "<p>Deals</p>",
    text: "Deals",
    emailType: "campaign",
    idempotencyKey: "test-campaign",
    listUnsubscribeUrl: `https://352flights.test/api/unsubscribe/one-click?token=${token}`,
  });
  const body = JSON.parse(String(resendCalls()[0].init?.body));
  assert.deepEqual(body.headers, {
    "List-Unsubscribe": `<https://352flights.test/api/unsubscribe/one-click?token=${token}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
  assert.ok(resendCalls()[0].init?.signal, "Resend calls have a timeout");
});

test("one-click POST unsubscribes; a GET only redirects to the confirmation form", async () => {
  const redirect = oneClickGet(
    new Request(`https://example.test/api/unsubscribe/one-click?token=${token}`),
  );
  assert.equal(redirect.status, 303);
  assert.equal(
    redirect.headers.get("location"),
    `https://example.test/unsubscribe?token=${token}`,
  );
  assert.equal(subscriber.status, "active");

  const response = await oneClickPost(
    new Request(`https://example.test/api/unsubscribe/one-click?token=${token}`, {
      method: "POST",
      body: "List-Unsubscribe=One-Click",
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(subscriber.status, "unsubscribed");

  const invalid = await oneClickPost(
    new Request("https://example.test/api/unsubscribe/one-click?token=nope", {
      method: "POST",
    }),
  );
  assert.equal(invalid.status, 400);
});

test("subscribe and contact return 429 once the limiter refuses", async () => {
  rateLimitAllowed = false;
  const subscribed = await subscribe(
    new Request("https://example.test/api/subscribe", {
      method: "POST",
      body: JSON.stringify({ email: "reader@example.test" }),
    }),
  );
  assert.equal(subscribed.status, 429);
  const contacted = await contact(
    new Request("https://example.test/api/contact", {
      method: "POST",
      body: JSON.stringify({
        name: "Reader",
        email: "reader@example.test",
        reason: "general",
        subject: "Hello",
        message: "A message long enough.",
      }),
    }),
  );
  assert.equal(contacted.status, 429);
  assert.equal(resendCalls().length, 0);
});

test("a repeat signup inside the cooldown does not send another email", async () => {
  subscriber.welcome_email_sent_at = new Date().toISOString();
  const response = await subscribe(
    new Request("https://example.test/api/subscribe", {
      method: "POST",
      body: JSON.stringify({ email: "reader@example.test" }),
    }),
  );
  assert.equal(response.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(resendCalls().length, 0);
});
