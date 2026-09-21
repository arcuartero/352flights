import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migration = readFileSync(new URL("../supabase/migrations/20260921130000_analytics_aggregates.sql", import.meta.url), "utf8");

before(async () => {
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;");
  await db.exec(migration);
});
after(async () => db.close());

test("anonymous analytics stores only atomic daily totals, not visitor records", async () => {
  await db.exec("SELECT increment_analytics_aggregate('reject', 'all'); SELECT increment_analytics_aggregate('reject', 'all'); SELECT increment_analytics_aggregate('declined_view', 'deals');");
  const rows = (await db.query<{ kind: string; page_group: string; total: string }>(
    "SELECT kind, page_group, total FROM analytics_aggregates ORDER BY kind DESC",
  )).rows;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(({ kind, page_group, total }) => [kind, page_group, Number(total)]), [
    ["reject", "all", 2], ["declined_view", "deals", 1],
  ]);
  const columns = (await db.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'analytics_aggregates' ORDER BY column_name",
  )).rows.map((row) => row.column_name);
  assert.deepEqual(columns, ["day", "kind", "page_group", "total"]);
});

test("aggregate function rejects granular or unknown dimensions", async () => {
  await assert.rejects(db.query("SELECT increment_analytics_aggregate('reject', 'deals')"), /Invalid aggregate dimensions/);
  await assert.rejects(db.query("SELECT increment_analytics_aggregate('location', 'home')"), /Invalid aggregate dimensions/);
});
