import "server-only";

import type { VpsScannerAgentStatus } from "@/lib/vps-scanner-agent";
import { getSupabaseAdminClient } from "@/lib/supabase";

type JournalEvent = {
  timestamp: string;
  timestampMs: number;
  message: string;
  meta: Record<string, unknown> | null;
};

type RouteRow = {
  id: string;
  origin_airport: string;
  destination_airport: string;
  destination_city: string;
  bucket: string;
  max_stops: string;
  is_active: boolean;
};

type SnapshotRow = {
  route_id: string;
  price: number;
  currency: string;
  departure_date: string;
  return_date: string | null;
  metadata: Record<string, unknown> | null;
  scanned_at: string;
};

const RUN_START_MESSAGES = ["Starting local scanner.", "Starting local Lux flight scan."];
const REAL_PROGRESS_PREFIXES = [
  "Route start: ",
  "Pattern start: ",
  "Pattern done: ",
  "Pattern no results: ",
  "Pattern timed out: ",
  "Pattern network outage: ",
  "Pattern hard error: ",
  "Pattern error: ",
  "Deal candidate: ",
  "Deal skipped: ",
  "Calendar search: ",
];
const SYSTEMD_FAILURE_RESULTS = new Set([
  "exit-code",
  "failed",
  "resources",
  "signal",
  "timeout",
  "watchdog",
]);

function parseTimestamp(value: string | undefined) {
  if (!value || value === "n/a") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function parseJournalLine(line: string): JournalEvent | null {
  const match = line.match(/\[(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})Z\]\s*(.*)$/);
  if (!match) return null;

  const timestamp = `${match[1]}T${match[2]}Z`;
  const timestampMs = new Date(timestamp).getTime();
  if (!Number.isFinite(timestampMs)) return null;

  const marker = " ||meta|| ";
  const markerIndex = match[3].indexOf(marker);
  if (markerIndex === -1) {
    return { timestamp, timestampMs, message: match[3], meta: null };
  }

  try {
    return {
      timestamp,
      timestampMs,
      message: match[3].slice(0, markerIndex),
      meta: JSON.parse(match[3].slice(markerIndex + marker.length)) as Record<string, unknown>,
    };
  } catch {
    return {
      timestamp,
      timestampMs,
      message: match[3].slice(0, markerIndex),
      meta: null,
    };
  }
}

function latestRunEvents(status: VpsScannerAgentStatus) {
  const events = status.journal
    .map(parseJournalLine)
    .filter((event): event is JournalEvent => Boolean(event))
    .sort((left, right) => left.timestampMs - right.timestampMs);

  let startIndex = -1;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (RUN_START_MESSAGES.includes(events[index].message)) {
      startIndex = index;
      break;
    }
  }

  return startIndex >= 0 ? events.slice(startIndex) : events;
}

function latestRealProgressEvent(events: JournalEvent[]) {
  return [...events].reverse().find((event) =>
    REAL_PROGRESS_PREFIXES.some((prefix) => event.message.startsWith(prefix)),
  ) ?? null;
}

function serviceExitStatus(status: VpsScannerAgentStatus) {
  const raw = status.service.ExecMainStatus;
  if (!raw || raw === "n/a") return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function serviceFailed(status: VpsScannerAgentStatus) {
  const exitStatus = serviceExitStatus(status);
  const result = status.service.Result?.toLowerCase();
  return !status.running && (
    (exitStatus !== null && exitStatus !== 0) ||
    (result ? SYSTEMD_FAILURE_RESULTS.has(result) : false)
  );
}

function scannerStartedDuringServiceAttempt(
  status: VpsScannerAgentStatus,
  startedAt: string,
  completedAt: string,
) {
  const startMs = new Date(startedAt).getTime();
  const completedMs = new Date(completedAt).getTime();
  return status.journal
    .map(parseJournalLine)
    .filter((event): event is JournalEvent => Boolean(event))
    .some((event) =>
      RUN_START_MESSAGES.includes(event.message) &&
      event.timestampMs >= startMs - 5_000 &&
      event.timestampMs <= completedMs + 5_000,
    );
}

async function recoverFailedServiceAttempt(
  status: VpsScannerAgentStatus,
  startedAt: string,
  completedAt: string,
) {
  const supabase = getSupabaseAdminClient();
  const startMs = new Date(startedAt).getTime();
  const exitStatus = serviceExitStatus(status);
  const serviceResult = status.service.Result ?? "failed";
  const reasonCode = exitStatus === 203
    ? "systemd_exec_203"
    : `systemd_${serviceResult.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
  const stoppedReason = exitStatus === 203
    ? "Scanner service could not execute the scanner command (systemd 203/EXEC)."
    : `Scanner service failed before the scanner started (${serviceResult}${exitStatus === null ? "" : `, exit ${exitStatus}`}).`;
  const existingStart = new Date(startMs - 120_000).toISOString();
  const existingEnd = new Date(startMs + 120_000).toISOString();
  const existing = await supabase
    .from("price_scan_runs")
    .select("id,status,error_breakdown,sync_summary")
    .gte("started_at", existingStart)
    .lte("started_at", existingEnd)
    .limit(1);
  if (existing.error) throw new Error(existing.error.message);

  const existingRun = existing.data?.[0] as {
    id: string;
    status: string;
    error_breakdown: Record<string, unknown> | null;
    sync_summary: Record<string, unknown> | null;
  } | undefined;
  const failureFields = {
    status: "failed",
    completed_at: completedAt,
    duration_ms: Math.max(new Date(completedAt).getTime() - startMs, 0),
    stopped_reason: stoppedReason,
    stopped_reason_code: reasonCode,
    error_breakdown: {
      ...(existingRun?.error_breakdown ?? {}),
      systemd_service_failure: 1,
    },
    sync_status: "failed",
    sync_summary: {
      ...(existingRun?.sync_summary ?? {}),
      recovered_from_vps_status: true,
      systemd_result: serviceResult,
      systemd_exit_status: exitStatus,
      failure_before_scanner_start: true,
    },
    updated_at: new Date().toISOString(),
  };

  if (existingRun) {
    if (existingRun.status !== "running") {
      return { recovered: false, reason: "already_stored" };
    }
    const update = await supabase
      .from("price_scan_runs")
      .update(failureFields)
      .eq("id", existingRun.id);
    if (update.error) throw new Error(update.error.message);
    return { recovered: true, reason: "failed_run_updated" };
  }

  const insert = await supabase.from("price_scan_runs").insert({
    run_key: `vps-systemd:${startedAt}`,
    scanner_source: "vps_systemd",
    started_at: startedAt,
    ...failureFields,
  });
  if (insert.error) throw new Error(insert.error.message);
  return { recovered: true, reason: "failed_run_stored" };
}

function numberMeta(meta: Record<string, unknown> | null, key: string) {
  const value = meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringMeta(meta: Record<string, unknown> | null, key: string) {
  const value = meta?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function routeKey(route: RouteRow) {
  return `${route.origin_airport}:${route.destination_airport}:${route.bucket}`;
}

function routeLabel(route: RouteRow) {
  return `${route.origin_airport} -> ${route.destination_airport}`;
}

function counterFromEvents(events: JournalEvent[], prefix: string) {
  return events.filter((event) => event.message.startsWith(prefix)).length;
}

function extractStartedRouteKeys(events: JournalEvent[]) {
  const keys = new Set<string>();
  for (const event of events) {
    if (!event.message.startsWith("Route start: ")) continue;
    const match = event.message.match(/\b([A-Z]{3})\s*->\s*([A-Z]{3})\s*\(([^,()]+)/);
    if (match) keys.add(`${match[1]}:${match[2]}:${match[3].trim()}`);
  }
  return keys;
}

function eventRouteKey(event: JournalEvent) {
  const fromMeta = stringMeta(event.meta, "local_route_id");
  if (fromMeta) return fromMeta;
  const origin = stringMeta(event.meta, "origin_airport") ?? "LUX";
  const airport = stringMeta(event.meta, "destination_airport");
  const bucket = stringMeta(event.meta, "bucket");
  return airport && bucket ? `${origin}:${airport}:${bucket}` : null;
}

function outcomeForEvents(events: JournalEvent[], key: string | null) {
  const matching = key ? events.filter((event) => eventRouteKey(event) === key) : [];
  return {
    no_results: counterFromEvents(matching, "Pattern no results: "),
    timed_out: counterFromEvents(matching, "Pattern timed out: "),
    network_outages: counterFromEvents(matching, "Pattern network outage: "),
    hard_errors:
      counterFromEvents(matching, "Pattern hard error: ") +
      counterFromEvents(matching, "Pattern error: "),
    retries: counterFromEvents(matching, "Pattern retry: "),
  };
}

export async function recordVpsPriceScanStartFailure(
  startedAt: string,
  detail: string,
) {
  const supabase = getSupabaseAdminClient();
  const completedAt = new Date().toISOString();
  const insert = await supabase.from("price_scan_runs").upsert({
    run_key: `vps-start-request:${startedAt}`,
    scanner_source: "vps_control",
    status: "failed",
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: Math.max(new Date(completedAt).getTime() - new Date(startedAt).getTime(), 0),
    stopped_reason: detail,
    stopped_reason_code: "vps_start_failed",
    error_breakdown: { vps_start_failed: 1 },
    sync_status: "failed",
    sync_summary: { failure_before_scanner_start: true },
    updated_at: completedAt,
  }, { onConflict: "run_key" });
  if (insert.error) throw new Error(insert.error.message);
}

async function reconcileSupersededRunningRuns(activeRunStartedAt: string) {
  const supabase = getSupabaseAdminClient();
  const staleRuns = await supabase
    .from("price_scan_runs")
    .select("id,started_at,updated_at,sync_summary")
    .eq("status", "running")
    .lt("started_at", activeRunStartedAt);
  if (staleRuns.error) throw new Error(staleRuns.error.message);

  const runs = (staleRuns.data ?? []) as Array<{
    id: string;
    started_at: string;
    updated_at: string;
    sync_summary: Record<string, unknown> | null;
  }>;

  await Promise.all(runs.map(async (run) => {
    const completedAt = run.updated_at || activeRunStartedAt;
    const update = await supabase
      .from("price_scan_runs")
      .update({
        status: "stopped",
        completed_at: completedAt,
        duration_ms: Math.max(
          new Date(completedAt).getTime() - new Date(run.started_at).getTime(),
          0,
        ),
        stopped_reason: "Scanner stopped before completion. A newer scanner execution started.",
        stopped_reason_code: "superseded_by_new_run",
        sync_status: "partial",
        sync_summary: {
          ...(run.sync_summary ?? {}),
          reconciled_from_vps_status: true,
          superseded_by_started_at: activeRunStartedAt,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .eq("status", "running");
    if (update.error) throw new Error(update.error.message);
  }));

  return runs.length;
}

async function reconcileInactiveRunningRuns() {
  const supabase = getSupabaseAdminClient();
  const staleRuns = await supabase
    .from("price_scan_runs")
    .select("id,started_at,updated_at,sync_summary")
    .eq("status", "running");
  if (staleRuns.error) throw new Error(staleRuns.error.message);

  const runs = (staleRuns.data ?? []) as Array<{
    id: string;
    started_at: string;
    updated_at: string;
    sync_summary: Record<string, unknown> | null;
  }>;

  await Promise.all(runs.map(async (run) => {
    const completedAt = run.updated_at || new Date().toISOString();
    const update = await supabase
      .from("price_scan_runs")
      .update({
        status: "stopped",
        completed_at: completedAt,
        duration_ms: Math.max(
          new Date(completedAt).getTime() - new Date(run.started_at).getTime(),
          0,
        ),
        stopped_reason: "The Price Scanner is no longer running on the VPS. This run was closed at its last saved checkpoint.",
        stopped_reason_code: "vps_service_inactive",
        sync_status: "partial",
        sync_summary: {
          ...(run.sync_summary ?? {}),
          reconciled_from_vps_status: true,
          price_service_running: false,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .eq("status", "running");
    if (update.error) throw new Error(update.error.message);
  }));

  return runs.length;
}

async function recoverActiveVpsRun(status: VpsScannerAgentStatus) {
  const serviceStartedAt = parseTimestamp(status.service.ExecMainStartTimestamp);
  const events = latestRunEvents(status);
  const startedAt = serviceStartedAt ?? events[0]?.timestamp ?? null;
  const latestProgress = latestRealProgressEvent(events);
  if (!startedAt || !latestProgress) {
    return { recovered: false, reason: "missing_active_run_timestamps", count: 0 };
  }

  const latestProgressAgeMs = Date.now() - latestProgress.timestampMs;
  if (latestProgressAgeMs < 0 || latestProgressAgeMs > 15 * 60 * 1_000) {
    return { recovered: false, reason: "active_service_without_recent_progress", count: 0 };
  }

  const supabase = getSupabaseAdminClient();
  const startMs = new Date(startedAt).getTime();
  const existing = await supabase
    .from("price_scan_runs")
    .select("id,status,stopped_reason_code,sync_summary,heartbeat_at")
    .gte("started_at", new Date(startMs - 120_000).toISOString())
    .lte("started_at", new Date(startMs + 120_000).toISOString())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);

  const existingRun = existing.data as {
    id: string;
    status: string;
    stopped_reason_code: string | null;
    sync_summary: Record<string, unknown> | null;
    heartbeat_at: string | null;
  } | null;

  if (existingRun?.status === "running") {
    const savedHeartbeatMs = existingRun.heartbeat_at
      ? new Date(existingRun.heartbeat_at).getTime()
      : 0;
    if (savedHeartbeatMs >= latestProgress.timestampMs) {
      return { recovered: false, reason: "scanner_running", count: 0 };
    }
    const heartbeatUpdate = await supabase
      .from("price_scan_runs")
      .update({
        heartbeat_at: latestProgress.timestamp,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingRun.id)
      .eq("status", "running");
    if (heartbeatUpdate.error) throw new Error(heartbeatUpdate.error.message);
    return { recovered: true, reason: "active_heartbeat_refreshed", count: 1 };
  }

  if (existingRun) {
    if (existingRun.stopped_reason_code !== "heartbeat_expired") {
      return { recovered: false, reason: "active_run_already_terminal", count: 0 };
    }
    const update = await supabase
      .from("price_scan_runs")
      .update({
        status: "running",
        completed_at: null,
        duration_ms: null,
        stopped_reason: null,
        stopped_reason_code: null,
        heartbeat_at: latestProgress.timestamp,
        sync_status: "pending",
        sync_summary: {
          ...(existingRun.sync_summary ?? {}),
          recovered_from_live_vps_activity: true,
          recovered_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingRun.id);
    if (update.error) throw new Error(update.error.message);
    return { recovered: true, reason: "active_run_reopened", count: 1 };
  }

  const insert = await supabase.from("price_scan_runs").insert({
    run_key: `vps-active:${startedAt}`,
    scanner_source: "vps_recovered",
    status: "running",
    started_at: startedAt,
    heartbeat_at: latestProgress.timestamp,
    last_progress_at: latestProgress.timestamp,
    sync_status: "pending",
    sync_summary: {
      recovered_from_live_vps_activity: true,
      recovered_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  });
  if (insert.error) throw new Error(insert.error.message);
  return { recovered: true, reason: "active_run_stored", count: 1 };
}

export async function recoverLatestVpsPriceScanRun(status: VpsScannerAgentStatus) {
  const serviceStartedAt = parseTimestamp(status.service.ExecMainStartTimestamp);
  const serviceCompletedAt = parseTimestamp(status.service.ExecMainExitTimestamp);
  if (
    serviceFailed(status) &&
    serviceStartedAt &&
    serviceCompletedAt &&
    !scannerStartedDuringServiceAttempt(status, serviceStartedAt, serviceCompletedAt)
  ) {
    const recovery = await recoverFailedServiceAttempt(status, serviceStartedAt, serviceCompletedAt);
    const inactiveRunsReconciled = await reconcileInactiveRunningRuns();
    return {
      ...recovery,
      recovered: recovery.recovered || inactiveRunsReconciled > 0,
      count: inactiveRunsReconciled + (recovery.recovered ? 1 : 0),
    };
  }

  if (status.running) {
    const activeRecovery = await recoverActiveVpsRun(status);
    const reconciled = serviceStartedAt
      ? await reconcileSupersededRunningRuns(serviceStartedAt)
      : 0;
    return {
      recovered: activeRecovery.recovered || reconciled > 0,
      reason: activeRecovery.recovered
        ? activeRecovery.reason
        : reconciled > 0
          ? "superseded_runs_reconciled"
          : activeRecovery.reason,
      count: activeRecovery.count + reconciled,
    };
  }

  const inactiveRunsReconciled = await reconcileInactiveRunningRuns();

  const events = latestRunEvents(status);
  const startedAt = events[0]?.timestamp ?? parseTimestamp(status.service.ExecMainStartTimestamp);
  const completedAt =
    [...events].reverse().find((event) =>
      event.message.startsWith("Scanner finished with status ") ||
      event.message === "Scanner and sync finished." ||
      event.message === "Local Lux flight scan finished successfully.",
    )?.timestamp ?? parseTimestamp(status.service.ExecMainExitTimestamp);

  if (!startedAt || !completedAt) {
    return {
      recovered: inactiveRunsReconciled > 0,
      reason: inactiveRunsReconciled > 0
        ? "inactive_runs_reconciled"
        : "missing_run_timestamps",
      count: inactiveRunsReconciled,
    };
  }

  const supabase = getSupabaseAdminClient();
  const startMs = new Date(startedAt).getTime();
  const existingStart = new Date(startMs - 120_000).toISOString();
  const existingEnd = new Date(startMs + 120_000).toISOString();
  const existing = await supabase
    .from("price_scan_runs")
    .select("id")
    .gte("started_at", existingStart)
    .lte("started_at", existingEnd)
    .limit(1);
  if (existing.error) throw new Error(existing.error.message);
  if ((existing.data ?? []).length > 0) {
    return {
      recovered: inactiveRunsReconciled > 0,
      reason: inactiveRunsReconciled > 0 ? "inactive_runs_reconciled" : "already_stored",
      count: inactiveRunsReconciled,
    };
  }

  const [routesQuery, snapshotsQuery] = await Promise.all([
    supabase
      .from("scanned_routes")
      .select("id,origin_airport,destination_airport,destination_city,bucket,max_stops,is_active")
      .eq("is_active", true),
    supabase
      .from("price_snapshots")
      .select("route_id,price,currency,departure_date,return_date,metadata,scanned_at")
      .gte("scanned_at", startedAt)
      .lte("scanned_at", completedAt)
      .order("scanned_at", { ascending: true }),
  ]);
  if (routesQuery.error) throw new Error(routesQuery.error.message);
  if (snapshotsQuery.error) throw new Error(snapshotsQuery.error.message);

  const allRoutes = (routesQuery.data ?? []) as RouteRow[];
  const snapshots = (snapshotsQuery.data ?? []) as SnapshotRow[];
  const snapshotRouteIds = new Set(snapshots.map((snapshot) => snapshot.route_id));
  const startedRouteKeys = extractStartedRouteKeys(events);
  let scannedRoutes = allRoutes.filter(
    (route) => snapshotRouteIds.has(route.id) || startedRouteKeys.has(routeKey(route)),
  );
  const routeStarts = counterFromEvents(events, "Route start: ");
  if (scannedRoutes.length === 0 && routeStarts === allRoutes.length) scannedRoutes = allRoutes;

  const snapshotsByRoute = new Map<string, SnapshotRow[]>();
  for (const snapshot of snapshots) {
    const current = snapshotsByRoute.get(snapshot.route_id) ?? [];
    current.push(snapshot);
    snapshotsByRoute.set(snapshot.route_id, current);
  }

  const routeRows = scannedRoutes.map((route) => {
    const routeSnapshots = snapshotsByRoute.get(route.id) ?? [];
    const outcomes = outcomeForEvents(events, routeKey(route));
    const retries = outcomes.retries;
    const patternsScanned = routeSnapshots.length + outcomes.no_results + outcomes.timed_out +
      outcomes.network_outages + outcomes.hard_errors;
    return {
      route_key: routeKey(route),
      route_label: routeLabel(route),
      origin_airport: route.origin_airport,
      destination_airport: route.destination_airport,
      destination_city: route.destination_city,
      bucket: route.bucket,
      routing: route.max_stops,
      started: true,
      completed: true,
      patterns_scanned: patternsScanned,
      rules_scanned: patternsScanned + retries,
      found_prices: routeSnapshots.length,
      deal_candidates: routeSnapshots.filter(
        (snapshot) => snapshot.metadata?.editorial_deal_candidate === true,
      ).length,
      ...outcomes,
    };
  });

  const destinationsMap = new Map<string, typeof routeRows>();
  for (const route of routeRows) {
    const current = destinationsMap.get(route.destination_city) ?? [];
    current.push(route);
    destinationsMap.set(route.destination_city, current);
  }
  const destinations = [...destinationsMap.entries()].map(([destinationCity, routes]) => ({
    destination_city: destinationCity,
    destination_airports: [...new Set(routes.map((route) => route.destination_airport))].sort(),
    routes_planned: routes.length,
    routes_started: routes.length,
    routes_completed: routes.length,
    patterns_scanned: routes.reduce((sum, route) => sum + route.patterns_scanned, 0),
    rules_scanned: routes.reduce((sum, route) => sum + route.rules_scanned, 0),
    found_prices: routes.reduce((sum, route) => sum + route.found_prices, 0),
    deal_candidates: routes.reduce((sum, route) => sum + route.deal_candidates, 0),
    no_results: routes.reduce((sum, route) => sum + route.no_results, 0),
    timed_out: routes.reduce((sum, route) => sum + route.timed_out, 0),
    network_outages: routes.reduce((sum, route) => sum + route.network_outages, 0),
    hard_errors: routes.reduce((sum, route) => sum + route.hard_errors, 0),
    retries: routes.reduce((sum, route) => sum + route.retries, 0),
  }));

  const noResultBreakdown: Record<string, number> = {};
  for (const event of events) {
    if (!event.message.startsWith("Pattern no results: ")) continue;
    const code = stringMeta(event.meta, "reason_code") ?? "no_results";
    noResultBreakdown[code] = (noResultBreakdown[code] ?? 0) + 1;
  }

  const foundPrices = snapshots.length;
  const noResults = counterFromEvents(events, "Pattern no results: ");
  const timedOut = counterFromEvents(events, "Pattern timed out: ");
  const networkOutages = counterFromEvents(events, "Pattern network outage: ");
  const hardErrors =
    counterFromEvents(events, "Pattern hard error: ") +
    counterFromEvents(events, "Pattern error: ");
  const retries = counterFromEvents(events, "Pattern retry: ");
  const patternsScanned = foundPrices + noResults + timedOut + networkOutages + hardErrors;
  const patternsPlanned = Math.max(counterFromEvents(events, "Pattern start: "), patternsScanned);
  const prices = snapshots.map((snapshot) => Number(snapshot.price)).filter(Number.isFinite);
  const currencies = new Map<string, number>();
  for (const snapshot of snapshots) {
    currencies.set(snapshot.currency, (currencies.get(snapshot.currency) ?? 0) + 1);
  }
  const currency = [...currencies.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
  const searchWindowStart = snapshots.map((snapshot) => snapshot.departure_date).sort()[0] ?? null;
  const searchWindowEnd = snapshots
    .map((snapshot) => snapshot.return_date ?? snapshot.departure_date)
    .sort()
    .at(-1) ?? null;
  const runKey = `vps-recovered:${startedAt}`;
  const runFailed = serviceFailed(status);
  const hasErrors = timedOut + networkOutages + hardErrors > 0;

  const insert = await supabase.from("price_scan_runs").insert({
    run_key: runKey,
    scanner_source: "vps_recovered",
    status: runFailed ? "failed" : hasErrors ? "completed_with_errors" : "completed",
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: Math.max(new Date(completedAt).getTime() - startMs, 0),
    search_window_start: searchWindowStart,
    search_window_end: searchWindowEnd,
    scanned_cities: [...destinationsMap.keys()].sort(),
    routes_planned: routeStarts || scannedRoutes.length,
    routes_started: routeStarts || scannedRoutes.length,
    routes_completed: routeStarts || scannedRoutes.length,
    destinations_planned: destinations.length,
    destinations_scanned: destinations.length,
    patterns_planned: patternsPlanned,
    patterns_scanned: patternsScanned,
    rules_scanned: patternsScanned + retries,
    found_prices: foundPrices,
    deal_candidates: snapshots.filter(
      (snapshot) => snapshot.metadata?.editorial_deal_candidate === true,
    ).length,
    no_results: noResults,
    timed_out: timedOut,
    network_outages: networkOutages,
    hard_errors: hardErrors,
    retries,
    currency,
    min_price: prices.length > 0 ? Math.min(...prices) : null,
    max_price: prices.length > 0 ? Math.max(...prices) : null,
    average_price: prices.length > 0
      ? Math.round((prices.reduce((sum, price) => sum + price, 0) / prices.length) * 100) / 100
      : null,
    median_price: median(prices),
    destinations,
    routes: routeRows,
    patterns: snapshots.map((snapshot) => ({
      route_key: stringMeta(snapshot.metadata, "local_route_id") ?? snapshot.route_id,
      route_label: null,
      destination_airport: stringMeta(snapshot.metadata, "destination_airport"),
      destination_city: stringMeta(snapshot.metadata, "destination_city"),
      bucket: stringMeta(snapshot.metadata, "bucket"),
      pattern_key: stringMeta(snapshot.metadata, "pattern_key"),
      pattern_label: stringMeta(snapshot.metadata, "pattern_label"),
      departure_weekday: stringMeta(snapshot.metadata, "pattern_departure_weekday"),
      return_weekday: stringMeta(snapshot.metadata, "pattern_return_weekday"),
      trip_nights: numberMeta(snapshot.metadata, "search_max_trip_nights"),
      status: "tracked",
      price: snapshot.price,
      currency: snapshot.currency,
      departure_date: snapshot.departure_date,
      return_date: snapshot.return_date,
      reason_code: null,
      reason: null,
      error_type: null,
      error: null,
      retry_count: 0,
      rules_scanned: 1,
    })),
    no_result_breakdown: noResultBreakdown,
    error_breakdown: {
      timeout: timedOut,
      network_outage: networkOutages,
      hard_error: hardErrors,
      ...(runFailed ? { systemd_service_failure: 1 } : {}),
    },
    stopped_reason: runFailed ? "Scanner service exited before completing the run." : null,
    stopped_reason_code: runFailed ? "systemd_service_failure" : null,
    sync_status: runFailed ? "failed" : "completed",
    sync_summary: {
      recovered_from_vps_status: true,
      recovered_snapshot_count: snapshots.length,
      journal_event_count: events.length,
      systemd_result: status.service.Result ?? null,
      systemd_exit_status: serviceExitStatus(status),
    },
    updated_at: new Date().toISOString(),
  });
  if (insert.error) throw new Error(insert.error.message);

  return { recovered: true, reason: "stored", runKey };
}
