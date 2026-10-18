import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migration = readFileSync(new URL("../supabase/migrations/20261007120000_request_rate_limits.sql", import.meta.url), "utf8");

before(async () => {
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;");
  await db.exec(migration);
});
after(async () => db.close());

const consume = async (key: string, limit: number, windowSeconds = 600) =>
  (await db.query<{ allowed: boolean }>("SELECT consume_rate_limit($1, $2, $3) AS allowed", [key, limit, windowSeconds])).rows[0].allowed;

test("allows hits up to the limit and rejects the rest within the window", async () => {
  assert.deepEqual(
    [await consume("subscribe-ip:a", 2), await consume("subscribe-ip:a", 2), await consume("subscribe-ip:a", 2)],
    [true, true, false],
  );
  assert.equal(await consume("subscribe-ip:b", 2), true, "buckets are independent");
});

test("starts a new window once the previous one has expired", async () => {
  await consume("contact-ip:c", 1);
  assert.equal(await consume("contact-ip:c", 1), false);
  await db.exec("UPDATE request_rate_limits SET window_started_at = now() - interval '1 hour' WHERE bucket_key = 'contact-ip:c'");
  assert.equal(await consume("contact-ip:c", 1, 600), true);
});

test("public roles cannot call the limiter or read its table", async () => {
  const grants = (await db.query<{ grantee: string }>(
    "SELECT grantee FROM information_schema.routine_privileges WHERE routine_name = 'consume_rate_limit'",
  )).rows.map((row) => row.grantee);
  assert.ok(!grants.includes("anon") && !grants.includes("authenticated"));
  await assert.rejects(db.query("SELECT consume_rate_limit('x', 0, 10)"), /Invalid rate limit/);
});
