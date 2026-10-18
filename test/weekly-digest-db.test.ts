import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260925100000_weekly_digest.sql",
    import.meta.url,
  ),
  "utf8",
);
before(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE email_campaigns (id uuid DEFAULT gen_random_uuid(), send_type text CHECK (send_type IN ('digest', 'flash')));
    CREATE TABLE ops_automation_settings (id text PRIMARY KEY, daily_digest_enabled boolean DEFAULT false);
    INSERT INTO ops_automation_settings VALUES ('default', false);`);
  await db.exec(migration);
});
after(async () => db.close());
test("weekly migration is repeatable and preserves daily settings", async () => {
  await db.exec(migration);
  const settings = (
    await db.query<{
      daily_digest_enabled: boolean;
      weekly_digest_enabled: boolean;
    }>("SELECT * FROM ops_automation_settings")
  ).rows[0];
  assert.equal(settings.daily_digest_enabled, false);
  assert.equal(settings.weekly_digest_enabled, false);
  await db.exec(
    "INSERT INTO email_campaigns (send_type) VALUES ('weekly'), ('digest'), ('flash')",
  );
  await assert.rejects(
    db.exec("INSERT INTO email_campaigns (send_type) VALUES ('unknown')"),
    /check constraint/,
  );
});
test("weekly snapshots require Monday, reserve one model and remain private", async () => {
  await db.exec(`INSERT INTO scheduled_weekly_jobs (delivery_date, model) VALUES ('2026-09-28', '{"version":1}');
    INSERT INTO scheduled_weekly_jobs (delivery_date, model) VALUES ('2026-09-28', '{"version":2}') ON CONFLICT DO NOTHING;`);
  assert.deepEqual(
    (
      await db.query<{ model: unknown }>(
        "SELECT model FROM scheduled_weekly_jobs",
      )
    ).rows[0].model,
    { version: 1 },
  );
  await assert.rejects(
    db.exec(
      "INSERT INTO scheduled_weekly_jobs (delivery_date, model) VALUES ('2026-09-29', '{}')",
    ),
    /check constraint/,
  );
  await db.exec("SET ROLE anon");
  try {
    await assert.rejects(
      db.query("SELECT * FROM scheduled_weekly_jobs"),
      /permission denied/,
    );
  } finally {
    await db.exec("RESET ROLE");
  }
});
