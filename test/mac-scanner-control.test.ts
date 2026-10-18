import "./helpers/server-runtime";
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { getMacScannerControlState } from "../lib/mac-scanner-control";

const originalFetch = globalThis.fetch;
const oldEnv = { ...process.env };
let latestCommand: Record<string, unknown> | null;

beforeEach(() => {
  process.env.SUPABASE_URL = "https://control.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/scanner_control_agents")) {
      return Response.json([{ id: "mac", last_seen_at: new Date().toISOString(), price_scanner_running: false, dates_scanner_running: false, active_owner: null, active_pid: null, metadata: null }]);
    }
    // The pending/claimed lookup filters by status; the latest-command lookup does not.
    if (url.searchParams.get("status")) return Response.json([]);
    return Response.json(latestCommand ? [latestCommand] : []);
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...oldEnv };
});

const failed = (minutesAgo: number) => ({
  id: "c1", scanner_type: "price_scanner", action: "start", status: "failed",
  requested_at: new Date(Date.now() - minutesAgo * 60_000 - 5_000).toISOString(),
  claimed_at: null,
  completed_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  error: 'Could not start the Mac Price Scanner: Could not find service "com.luxcheapflights.scanner"',
});

test("a recent failed start is reported so Ops can explain it", async () => {
  latestCommand = failed(1);
  const state = await getMacScannerControlState("price_scanner");
  assert.equal(state.online, true);
  assert.equal(state.pendingCommand, null);
  assert.equal(state.recentFailure?.action, "start");
  assert.match(state.recentFailure?.error ?? "", /Could not find service/);
});

test("old failures and successful commands are not reported", async () => {
  latestCommand = failed(20);
  assert.equal((await getMacScannerControlState("price_scanner")).recentFailure, null);
  latestCommand = { ...failed(1), status: "completed", error: null };
  assert.equal((await getMacScannerControlState("price_scanner")).recentFailure, null);
});
