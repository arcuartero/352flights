import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";

import { middleware } from "../middleware";
import { OPS_LOGIN_MAX_FAILURES } from "../lib/ops-login-throttle";

const db = new PGlite();
const migration = (name: string) =>
  readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const originalFetch = globalThis.fetch;
const oldEnv = { ...process.env };
let rpcCalls: Array<Record<string, unknown>>;
let rpcFails: boolean;

before(async () => {
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;");
  await db.exec(migration("20261007120000_request_rate_limits.sql"));
  await db.exec(migration("20261008090000_ops_login_throttle.sql"));
});
after(async () => db.close());

beforeEach(() => {
  process.env.OPS_BASIC_AUTH_USER = "ops";
  process.env.OPS_BASIC_AUTH_PASSWORD = "secret";
  process.env.SUPABASE_URL = "https://throttle.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
  rpcCalls = [];
  rpcFails = false;
  // Route the middleware's PostgREST call into the real SQL function running in PGlite.
  globalThis.fetch = async (input, init) => {
    assert.equal(new URL(String(input)).pathname, "/rest/v1/rpc/check_failed_attempts");
    if (rpcFails) return new Response("down", { status: 503 });
    const body = JSON.parse(String(init?.body));
    rpcCalls.push(body);
    const { rows } = await db.query<{ allowed: boolean }>(
      "SELECT check_failed_attempts($1, $2, $3, $4) AS allowed",
      [body.p_key, body.p_limit, body.p_window_seconds, body.p_record_failure],
    );
    return Response.json(rows[0].allowed);
  };
});
afterEach(async () => {
  globalThis.fetch = originalFetch;
  process.env = { ...oldEnv };
  await db.exec("DELETE FROM request_rate_limits");
});

const basic = (value: string) => `Basic ${Buffer.from(value).toString("base64")}`;
const request = (authorization?: string, ip = "203.0.113.7") =>
  new NextRequest("https://example.test/ops", {
    headers: { "x-forwarded-for": ip, ...(authorization ? { authorization } : {}) },
  });

test("the login prompt itself does not touch the limiter", async () => {
  assert.equal((await middleware(request())).status, 401);
  assert.equal(rpcCalls.length, 0);
});

test("successful logins only read the limiter", async () => {
  for (let index = 0; index < 20; index += 1) {
    assert.equal((await middleware(request(basic("ops:secret")))).status, 200);
  }
  assert.ok(rpcCalls.every((call) => call.p_record_failure === false));
  const stored = await db.query("SELECT * FROM request_rate_limits");
  assert.equal(stored.rows.length, 0);
});

test("after too many failures the client is locked out, even with the right password", async () => {
  for (let index = 0; index < OPS_LOGIN_MAX_FAILURES; index += 1) {
    assert.equal((await middleware(request(basic("ops:guess")))).status, 401);
  }
  assert.equal((await middleware(request(basic("ops:guess")))).status, 429);
  const locked = await middleware(request(basic("ops:secret")));
  assert.equal(locked.status, 429);
  assert.equal(locked.headers.get("retry-after"), "900");
  assert.equal((await middleware(request(basic("ops:secret"), "198.51.100.4"))).status, 200, "other clients are unaffected");
  const keys = (await db.query<{ bucket_key: string }>("SELECT bucket_key FROM request_rate_limits")).rows;
  assert.ok(keys.every(({ bucket_key }) => !bucket_key.includes("203.0.113.7")), "IPs are stored hashed");
});

test("the lockout expires with the window", async () => {
  for (let index = 0; index <= OPS_LOGIN_MAX_FAILURES; index += 1) await middleware(request(basic("ops:guess")));
  assert.equal((await middleware(request(basic("ops:secret")))).status, 429);
  await db.exec("UPDATE request_rate_limits SET window_started_at = now() - interval '16 minutes'");
  assert.equal((await middleware(request(basic("ops:secret")))).status, 200);
});

test("an unavailable limiter fails open but still requires the password", async () => {
  rpcFails = true;
  assert.equal((await middleware(request(basic("ops:secret")))).status, 200);
  assert.equal((await middleware(request(basic("ops:guess")))).status, 401);
});
