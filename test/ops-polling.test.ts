import assert from "node:assert/strict";
import test from "node:test";
import { createOpsPoller, hasActiveScan, type PollResult } from "../lib/ops-polling";

function harness() {
  let now = 0, available = true, nextId = 0;
  let running = false;
  const jobs = new Map<number, { at: number; callback: () => void }>();
  const requests: { at: number; resources: string[]; signal: AbortSignal }[] = [];
  let fetcher = async (resources: string[], signal: AbortSignal) => {
    requests.push({ at: now, resources, signal });
    return Object.fromEntries(resources.map((key) => [key, { status: 200, body: { running } }]));
  };
  const poller = createOpsPoller({
    available: () => available, now: () => now,
    schedule(callback, delay) { const id = ++nextId; jobs.set(id, { at: now + delay, callback }); return id as unknown as ReturnType<typeof setTimeout>; },
    cancel(timer) { jobs.delete(timer as unknown as number); },
    fetch: (resources, signal) => fetcher(resources, signal),
  });
  async function advance(ms: number) {
    const end = now + ms;
    while (true) {
      const next = [...jobs].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; jobs.delete(next[0]); next[1].callback();
      for (let i = 0; i < 8; i++) await Promise.resolve();
    }
    now = end;
  }
  return { poller, requests, advance, setRunning: (value: boolean) => { running = value; },
    setAvailable(value: boolean) { available = value; poller.availabilityChanged(); },
    setFetcher(value: typeof fetcher) { fetcher = value; } };
}

test("six resources and repeated consumers stay below 120 idle requests/hour", async () => {
  const h = harness(); let received = 0;
  const resources = ["scanner-status", "pattern-discovery-status", "pattern-discovery-live-status", "price-scan-runs", "date-scan-runs", "vps-scanner/status"];
  for (const key of resources) h.poller.subscribe(key, () => { received++; });
  h.poller.subscribe("scanner-status", () => { received++; });
  await h.advance(3_600_000);
  assert.equal(h.requests.length, 60);
  assert.equal(received, 60 * 7);
  assert.deepEqual(h.requests[0].resources, resources.sort());
});

test("active and pending scans poll at 7.5s; idle returns to 60s", async () => {
  const h = harness(); h.setRunning(true); h.poller.subscribe("scanner-status", () => {});
  await h.advance(15_100); assert.deepEqual(h.requests.map((r) => r.at), [100, 7600, 15100]);
  h.setRunning(false); await h.advance(7500); const count = h.requests.length;
  await h.advance(59999); assert.equal(h.requests.length, count);
  await h.advance(1); assert.equal(h.requests.length, count + 1);
  assert.equal(hasActiveScan({ pendingAction: "start" }), true);
  assert.equal(hasActiveScan({ runs: [{ status: "running" }] }), true);
});

test("hidden/offline tabs stop, resume once, and unused widgets unsubscribe", async () => {
  const h = harness(); const stop = h.poller.subscribe("scanner-status", () => {});
  await h.advance(100); h.setAvailable(false); await h.advance(180_000);
  assert.equal(h.requests.length, 1);
  h.setAvailable(true); await h.advance(100); assert.equal(h.requests.length, 2);
  stop(); await h.advance(180_000); assert.equal(h.requests.length, 2);
});

test("slow requests never overlap; hiding aborts the request", async () => {
  const h = harness(); let signal: AbortSignal | undefined, requests = 0;
  h.setFetcher(async (_resources, currentSignal) => { requests++; signal = currentSignal; return new Promise(() => {}); });
  h.poller.subscribe("scanner-status", () => {}); await h.advance(100);
  h.poller.refresh(); h.poller.subscribe("date-scan-runs", () => {}); await h.advance(10_000);
  assert.equal(requests, 1); h.setAvailable(false); assert.equal(signal!.aborted, true);
});

test("cached response is reused on remount without another request", async () => {
  const h = harness(); const first = h.poller.subscribe("scanner-status", () => {});
  await h.advance(100); first(); let result: PollResult | undefined;
  h.poller.subscribe("scanner-status", (value) => { result = value; }); await h.advance(1000);
  assert.equal(h.requests.length, 1); assert.equal(result?.status, 200);
});

test("network errors retry and do not create a tight loop", async () => {
  const h = harness(); let calls = 0;
  h.setFetcher(async () => { calls++; throw new Error("offline"); });
  h.poller.subscribe("scanner-status", () => {}); await h.advance(60_100); assert.equal(calls, 2);
});
