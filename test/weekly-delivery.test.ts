import "./helpers/server-runtime";
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { runScheduledWeeklyDigest } from "../lib/ops/campaigns";

const oldFetch = globalThis.fetch;
const oldEnv = { ...process.env };
type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let sent: Row[];
let failingEmail: string | null;
let sequence = 0;
beforeEach(() => {
  Object.assign(process.env, {
    SUPABASE_URL: "https://weekly-storage.test",
    SUPABASE_SERVICE_ROLE_KEY: "test-only",
    RESEND_API_KEY: "test-only",
    NEXT_PUBLIC_SITE_URL: "https://example.test",
  });
  const now = new Date().toISOString();
  const date = (days: number) =>
    new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  tables = {
    ops_automation_settings: [
      {
        id: "default",
        daily_digest_enabled: false,
        weekly_digest_enabled: true,
        daily_digest_hour: 9,
        daily_digest_minute: 5,
        last_digest_sent_on: null,
        last_weekly_sent_on: null,
      },
    ],
    newsletter_subscribers: ["weekly", "daily"].map((id) => ({
      id,
      email: `${id}@example.test`,
      status: "active",
      email_confirmed: true,
      onboarding_completed: true,
      home_airport: "LUX",
      source: "test",
      created_at: now,
      preference_token: id,
      unsubscribe_token: id,
      preferred_locale: "es",
    })),
    subscriber_preferences: [
      { subscriber_id: "weekly", delivery_modes: ["weekly_best_of"] },
      { subscriber_id: "daily", delivery_modes: ["daily_digest"] },
    ],
    subscriber_route_preferences: [],
    subscriber_custom_alerts: [],
    scanned_routes: [
      {
        id: "route",
        origin_airport: "LUX",
        destination_airport: "LIS",
        destination_city: "Lisbon",
        bucket: "weekend_europe",
        trip_nights: 3,
        max_stops: "NON_STOP",
        is_active: true,
      },
    ],
    deal_candidates: [
      {
        id: "deal",
        route_id: "route",
        snapshot_id: 1,
        title: "Lisbon",
        summary: "Lower fare",
        deal_price: 50,
        baseline_price: 100,
        drop_ratio: 0.5,
        score: 90,
        send_type: "digest",
        status: "sent",
        created_at: now,
      },
    ],
    price_snapshots: [
      {
        id: 1,
        route_id: "route",
        price: 50,
        currency: "EUR",
        departure_date: date(30),
        return_date: date(33),
        trip_nights: 3,
        max_stops: "NON_STOP",
        metadata: { destination_stay_hours: 70 },
        scanned_at: now,
      },
    ],
    scheduled_weekly_jobs: [],
    scheduled_digest_jobs: [],
    scheduled_digest_messages: [],
    email_campaigns: [],
    email_deliveries: [],
  };
  sent = [];
  failingEmail = null;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const method = init?.method ?? "GET";
    if (url.hostname === "api.resend.com") {
      const body = JSON.parse(String(init?.body));
      if (body.to[0] === failingEmail)
        return Response.json(
          { message: "Simulated provider outage" },
          { status: 503 },
        );
      sent.push({ ...body, key: headers.get("Idempotency-Key") });
      return Response.json({ id: `message-${++sequence}` });
    }
    assert.equal(
      url.hostname,
      "weekly-storage.test",
      "No external calls permitted",
    );
    const table = url.pathname.split("/").at(-1)!;
    assert.ok(tables[table], `Unexpected table ${table}`);
    const selected = () =>
      tables[table].filter((row) =>
        [...url.searchParams].every(([key, value]) => {
          if (
            ["select", "order", "offset", "limit", "on_conflict"].includes(key)
          )
            return true;
          if (value.startsWith("eq."))
            return String(row[key]) === value.slice(3);
          if (value.startsWith("in.("))
            return value.slice(4, -1).split(",").includes(String(row[key]));
          if (value.startsWith("lt.")) return row[key] < value.slice(3);
          if (value.startsWith("gte.")) return row[key] >= value.slice(4);
          if (value.startsWith("lte."))
            return row[key] <= Number(value.slice(4));
          throw new Error(`Unhandled test filter ${key}: ${value}`);
        }),
      );
    let result: Row[];
    if (method === "POST") {
      const raw = JSON.parse(String(init?.body));
      const rows = Array.isArray(raw) ? raw : [raw];
      result = [];
      for (const body of rows) {
        const key = url.searchParams.get("on_conflict") ?? "id";
        const existing = tables[table].find(
          (row) => body[key] !== undefined && row[key] === body[key],
        );
        if (existing) {
          if (!headers.get("Prefer")?.includes("ignore-duplicates"))
            Object.assign(existing, body);
          result.push(existing);
        } else {
          const row = {
            id: `row-${++sequence}`,
            first_attempt_at: new Date().toISOString(),
            provider_message_id: null,
            ...body,
          };
          tables[table].push(row);
          result.push(row);
        }
      }
    } else if (method === "PATCH") {
      result = selected();
      const payload = JSON.parse(String(init?.body));
      result.forEach((row) => Object.assign(row, payload));
    } else {
      assert.equal(method, "GET");
      result = selected();
    }
    if (url.searchParams.has("offset"))
      result = result.slice(Number(url.searchParams.get("offset")));
    if (url.searchParams.has("limit"))
      result = result.slice(0, Number(url.searchParams.get("limit")));
    return Response.json(
      headers.get("Accept")?.includes("vnd.pgrst.object")
        ? (result[0] ?? null)
        : result,
    );
  };
});
afterEach(() => {
  globalThis.fetch = oldFetch;
  process.env = { ...oldEnv };
});

test("weekly sender reaches weekly-only subscribers and never resends the same week", async () => {
  const result = await runScheduledWeeklyDigest({ force: true });
  assert.equal(result.status, "sent");
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ["weekly@example.test"]);
  assert.match(sent[0].subject, /Resumen semanal/);
  assert.match(sent[0].key, /^lux-weekly-/);
  assert.equal(tables.scheduled_weekly_jobs.length, 1);
  assert.equal(tables.scheduled_digest_jobs.length, 0);
  assert.equal(tables.deal_candidates[0].status, "sent");
  const retry = await runScheduledWeeklyDigest({ force: true });
  assert.equal(retry.status, "skipped");
  assert.equal(sent.length, 1);
});

test("partial weekly retry reuses acknowledged deliveries and respects a frequency opt-out", async () => {
  tables.subscriber_preferences[1].delivery_modes = ["weekly_best_of"];
  failingEmail = "daily@example.test";
  await assert.rejects(
    runScheduledWeeklyDigest({ force: true }),
    /weekly deliveries remain pending/,
  );
  assert.equal(sent.length, 1);
  assert.equal(tables.ops_automation_settings[0].last_weekly_sent_on, null);
  tables.subscriber_preferences[1].delivery_modes = ["daily_digest"];
  failingEmail = null;
  assert.equal(
    (await runScheduledWeeklyDigest({ force: true })).status,
    "sent",
  );
  assert.equal(
    sent.length,
    1,
    "successful recipients are not sent a second copy, opted-out recipients are skipped",
  );
  assert.equal(tables.scheduled_weekly_jobs.length, 1);
});
