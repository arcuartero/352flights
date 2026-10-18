import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migration = (name: string) =>
  readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");

before(async () => {
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;");
  for (const name of [
    "20260731120000_price_scan_runs",
    "20260731193000_price_scan_run_scope",
    "20260822183000_price_scan_run_liveness",
    "20260823073000_resume_live_price_scan_runs",
    "20260825073000_keep_mac_price_scan_live",
    "20261018120000_reopen_resumed_price_scan_runs",
  ]) {
    await db.exec(migration(name));
  }
});
after(async () => db.close());
beforeEach(async () => {
  await db.exec("DELETE FROM price_scan_runs");
});

const STARTED = "2026-10-02T19:45:30Z";

async function closedRun(reasonCode: string, heartbeatMinutesAgo = 60) {
  await db.query(
    `INSERT INTO price_scan_runs (run_key, scanner_source, status, started_at, heartbeat_at,
       completed_at, duration_ms, stopped_reason, stopped_reason_code, found_prices)
     VALUES ('run-1', 'mac', 'partial', $1, now() - make_interval(mins => $2),
       now() - make_interval(mins => $2), 1000, 'closed', $3, 100)`,
    [STARTED, heartbeatMinutesAgo, reasonCode],
  );
}

async function checkpoint(heartbeat: string, startedAt = STARTED) {
  await db.query(
    `UPDATE price_scan_runs SET status = 'running', heartbeat_at = ${heartbeat},
       started_at = $1, found_prices = 120, updated_at = now()
     WHERE run_key = 'run-1'`,
    [startedAt],
  );
  return (
    await db.query<{ status: string; completed_at: string | null; stopped_reason_code: string | null; found_prices: number; reason: string | null }>(
      "SELECT status, completed_at, stopped_reason_code, found_prices, sync_summary->>'reopened_from_reason' AS reason FROM price_scan_runs WHERE run_key = 'run-1'",
    )
  ).rows[0];
}

for (const code of ["provider_unavailable", "network_outage", "heartbeat_expired"]) {
  test(`a resumed run closed by ${code} becomes visible as running again`, async () => {
    await closedRun(code);
    const row = await checkpoint("now()");
    assert.equal(row.status, "running");
    assert.equal(row.completed_at, null);
    assert.equal(row.stopped_reason_code, null);
    assert.equal(row.found_prices, 120);
    assert.equal(row.reason, code);
  });
}

for (const code of ["superseded_by_new_run", "fatal_error", "vps_start_failed"]) {
  test(`a run closed by ${code} stays closed`, async () => {
    await closedRun(code);
    const row = await checkpoint("now()");
    assert.equal(row.status, "partial");
    assert.equal(row.found_prices, 100, "the whole update is discarded");
  });
}

test("delayed local state with an old heartbeat cannot reopen a run", async () => {
  await closedRun("provider_unavailable", 60);
  const row = await checkpoint("now() - interval '2 hours'");
  assert.equal(row.status, "partial");
});

test("a stale heartbeat older than 15 minutes cannot reopen a run", async () => {
  await closedRun("provider_unavailable", 120);
  const row = await checkpoint("now() - interval '30 minutes'");
  assert.equal(row.status, "partial");
});

test("a different start time (another run) cannot reopen it", async () => {
  await closedRun("provider_unavailable");
  const row = await checkpoint("now()", "2026-10-03T00:00:00Z");
  assert.equal(row.status, "partial");
});
