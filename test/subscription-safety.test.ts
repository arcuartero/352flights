import "./helpers/server-runtime";
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { getPreferencesByToken } from "../lib/preferences";
import { POST as subscribe } from "../app/api/subscribe/route";
import {
  GET as preferencesGet,
  POST as preferencesPost,
} from "../app/api/preferences/route";
import {
  confirmSubscription,
  unsubscribeSubscription,
} from "../app/subscription-actions";

const token = "00000000-0000-4000-8000-000000000001";
const originalFetch = globalThis.fetch;
const oldEnv = { ...process.env };
let subscriber: Record<string, unknown>;
let mutations: Array<Record<string, unknown>>;
let failStorage: boolean;
beforeEach(() => {
  process.env.SUPABASE_URL = "https://subscription-storage.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
  subscriber = {
    id: token,
    email: "reader@example.test",
    status: "pending",
    email_confirmed: false,
    onboarding_completed: false,
    home_airport: "LUX",
    preference_token: token,
    confirmation_token: token,
    unsubscribe_token: token,
  };
  mutations = [];
  failStorage = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(
      url.hostname,
      "subscription-storage.test",
      "No external calls are permitted in this test",
    );
    if (failStorage)
      return Response.json(
        { message: "INTERNAL_DATABASE_DETAIL", code: "XX000" },
        { status: 500 },
      );
    if (init?.method === "PATCH") {
      const payload = JSON.parse(String(init.body));
      mutations.push(payload);
      Object.assign(subscriber, payload);
      return new Response(null, { status: 204 });
    }
    assert.equal(init?.method, "GET");
    return Response.json(
      url.pathname.endsWith("newsletter_subscribers") ? [subscriber] : [],
    );
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...oldEnv };
});

for (const [name, handler] of [
  ["subscribe", subscribe],
  ["preferences", preferencesPost],
] as const) {
  test(`${name} rejects malformed or non-object JSON with 400`, async () => {
    for (const body of ["{", "", "null", "[]", '"text"']) {
      const response = await handler(
        new Request(`https://example.test/api/${name}`, {
          method: "POST",
          body,
          headers: { "Content-Type": "application/json" },
        }),
      );
      assert.equal(response.status, 400);
      assert.equal(mutations.length, 0);
    }
  });
}
test("reading a pending profile never confirms or activates the subscriber", async () => {
  const result = await getPreferencesByToken(token);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.bundle.emailConfirmed, false);
    assert.equal(result.bundle.status, "pending");
  }
  assert.equal(mutations.length, 0);
  const response = await preferencesGet(
    new Request(`https://example.test/api/preferences?token=${token}`),
  );
  assert.equal(response.status, 200);
  assert.equal(mutations.length, 0);
});
test("confirmation requires the explicit action, redirects to preferences and is idempotent", async () => {
  const form = new FormData();
  form.set("token", token);
  await assert.rejects(confirmSubscription({}, form), /NEXT_REDIRECT/);
  assert.equal(subscriber.email_confirmed, true);
  assert.equal(subscriber.status, "active");
  await assert.rejects(confirmSubscription({}, form), /NEXT_REDIRECT/);
  assert.equal(mutations.length, 1);
});
test("explicit unsubscribe is idempotent and clears promotional consent", async () => {
  const form = new FormData();
  form.set("token", token);
  assert.deepEqual(await unsubscribeSubscription({}, form), {
    completed: true,
  });
  assert.equal(subscriber.status, "unsubscribed");
  assert.equal(subscriber.travel_email_consent, false);
  assert.deepEqual(await unsubscribeSubscription({}, form), {
    completed: true,
  });
  assert.equal(mutations.length, 1);
  assert.ok((await confirmSubscription({}, form)).error);
  assert.equal(subscriber.status, "unsubscribed");
});
test("public responses and actions never reveal storage error details", async () => {
  failStorage = true;
  const response = await preferencesGet(
    new Request(`https://example.test/api/preferences?token=${token}`),
  );
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /INTERNAL_DATABASE_DETAIL/);
  const form = new FormData();
  form.set("token", token);
  assert.doesNotMatch(
    JSON.stringify(await unsubscribeSubscription({}, form)),
    /INTERNAL_DATABASE_DETAIL/,
  );
  const subscribed = await subscribe(
    new Request("https://example.test/api/subscribe", {
      method: "POST",
      body: JSON.stringify({ email: "reader@example.test" }),
    }),
  );
  assert.equal(subscribed.status, 500);
  assert.doesNotMatch(await subscribed.text(), /INTERNAL_DATABASE_DETAIL/);
});
