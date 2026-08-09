import "server-only";

import { getPatternDiscoveryStatus } from "@/lib/pattern-discovery-status";
import { getSupabaseAdminClient } from "@/lib/supabase";

export type DateScanRouteSummary = {
  route_key: string;
  route_label: string;
  destination_city: string | null;
  status: string;
  service_months: number;
  departures_detected: number;
  cadence_changes: number;
  error: string | null;
};

export type DateScanRun = {
  id: string;
  runKey: string;
  scannerSource: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  routesPlanned: number;
  routesStarted: number;
  routesCompleted: number;
  destinationsScanned: number;
  serviceMonthsScanned: number;
  departuresDetected: number;
  cadenceChanges: number;
  noDatesFound: number;
  skippedComplete: number;
  hardErrors: number;
  routes: DateScanRouteSummary[];
  error: string | null;
};

type DateScanRunRow = {
  id: string;
  run_key: string;
  scanner_source: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  routes_planned: number;
  routes_started: number;
  routes_completed: number;
  destinations_scanned: number;
  service_months_scanned: number;
  departures_detected: number;
  cadence_changes: number;
  no_dates_found: number;
  skipped_complete: number;
  hard_errors: number;
  routes: unknown;
  error: string | null;
};

const select = [
  "id", "run_key", "scanner_source", "status", "started_at", "completed_at", "duration_ms",
  "routes_planned", "routes_started", "routes_completed", "destinations_scanned",
  "service_months_scanned", "departures_detected", "cadence_changes", "no_dates_found",
  "skipped_complete", "hard_errors", "routes", "error",
].join(",");

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapRun(row: DateScanRunRow): DateScanRun {
  return {
    id: row.id,
    runKey: row.run_key,
    scannerSource: row.scanner_source,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms === null ? null : numberValue(row.duration_ms),
    routesPlanned: numberValue(row.routes_planned),
    routesStarted: numberValue(row.routes_started),
    routesCompleted: numberValue(row.routes_completed),
    destinationsScanned: numberValue(row.destinations_scanned),
    serviceMonthsScanned: numberValue(row.service_months_scanned),
    departuresDetected: numberValue(row.departures_detected),
    cadenceChanges: numberValue(row.cadence_changes),
    noDatesFound: numberValue(row.no_dates_found),
    skippedComplete: numberValue(row.skipped_complete),
    hardErrors: numberValue(row.hard_errors),
    routes: Array.isArray(row.routes) ? row.routes as DateScanRouteSummary[] : [],
    error: row.error,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function liveRunFromStatus(status: Awaited<ReturnType<typeof getPatternDiscoveryStatus>>): DateScanRun | null {
  if (!status.running) return null;

  const startedAt = status.startedAt ?? new Date().toISOString();
  const routesStarted = status.startedRoutes ?? 0;
  const currentRoute = status.currentRouteLabel;

  return {
    id: `live:${startedAt}`,
    runKey: `live:${startedAt}`,
    scannerSource: status.source,
    status: "running",
    startedAt,
    completedAt: null,
    durationMs: null,
    routesPlanned: status.totalRoutes ?? 0,
    routesStarted,
    routesCompleted: routesStarted,
    destinationsScanned: 0,
    serviceMonthsScanned: 0,
    departuresDetected: 0,
    cadenceChanges: status.liveTotals?.cadenceChanges ?? 0,
    noDatesFound: status.liveTotals?.noSupportedPatterns ?? 0,
    skippedComplete: status.liveTotals?.usesDefaults ?? 0,
    hardErrors: status.liveTotals?.hardErrors ?? 0,
    routes: currentRoute
      ? [{
          route_key: currentRoute,
          route_label: currentRoute,
          destination_city: null,
          status: "running",
          service_months: 0,
          departures_detected: 0,
          cadence_changes: 0,
          error: null,
        }]
      : [],
    error: null,
  };
}

function mergeLiveRun(persisted: DateScanRun, live: DateScanRun): DateScanRun {
  const routes = [...persisted.routes];
  const currentRoute = live.routes[0];
  if (currentRoute && !routes.some((route) => route.route_key === currentRoute.route_key)) {
    routes.push(currentRoute);
  }

  return {
    ...persisted,
    status: "running",
    completedAt: null,
    durationMs: null,
    routesPlanned: live.routesPlanned || persisted.routesPlanned,
    routesStarted: Math.max(persisted.routesStarted, live.routesStarted),
    routes: routes.slice(-200),
    error: null,
  };
}

function validTimestamp(value: string | null | undefined) {
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
}

function finishStaleRun(
  run: DateScanRun,
  status: Awaited<ReturnType<typeof getPatternDiscoveryStatus>>,
  nextRunStartedAt?: string,
): DateScanRun {
  if (run.status !== "running") return run;

  const runStartedAt = validTimestamp(run.startedAt) ?? Date.now();
  const failedAt = validTimestamp(status.latestFailedAt);
  const finishedAt = validTimestamp(status.latestFinishedAt);
  const nextStartedAt = validTimestamp(nextRunStartedAt);
  const failedDuringThisRun = !status.running && failedAt !== null && failedAt >= runStartedAt;

  let completedTimestamp = Date.now();
  if (nextStartedAt !== null && nextStartedAt >= runStartedAt) {
    completedTimestamp = nextStartedAt;
  } else if (failedDuringThisRun && failedAt !== null) {
    completedTimestamp = failedAt;
  } else if (!status.running && finishedAt !== null && finishedAt >= runStartedAt) {
    completedTimestamp = finishedAt;
  }

  const completedAt = new Date(completedTimestamp).toISOString();
  const durationMs = Math.max(completedTimestamp - runStartedAt, 0);

  return {
    ...run,
    status: failedDuringThisRun ? "failed" : "stopped",
    completedAt,
    durationMs,
    error:
      run.error ??
      (failedDuringThisRun
        ? "El servicio VPS terminó con un error antes de completar esta ejecución."
        : nextRunStartedAt
          ? "Otra ejecución del Date Scanner empezó después; esta entrada anterior se cerró automáticamente."
          : "El servicio VPS ya no está activo; esta ejecución quedó detenida."),
  };
}

function reconcileLiveRun(
  runs: DateScanRun[],
  status: Awaited<ReturnType<typeof getPatternDiscoveryStatus>>,
  liveRun: DateScanRun | null,
) {
  if (!liveRun) {
    return runs.map((run) => finishStaleRun(run, status));
  }

  const liveStartedAt = validTimestamp(liveRun.startedAt);
  const matchingIndex = runs.findIndex((run) => {
    const runStartedAt = validTimestamp(run.startedAt);
    return (
      run.status === "running" &&
      run.scannerSource === liveRun.scannerSource &&
      liveStartedAt !== null &&
      runStartedAt !== null &&
      Math.abs(runStartedAt - liveStartedAt) <= 120_000
    );
  });

  const reconciled = runs.map((run, index) => {
    if (index === matchingIndex) return mergeLiveRun(run, liveRun);
    return finishStaleRun(run, status, liveRun.startedAt);
  });

  if (matchingIndex < 0) reconciled.unshift(liveRun);
  return reconciled;
}

export async function getDateScanRunHistory(limit = 100) {
  try {
    const liveStatusPromise = getPatternDiscoveryStatus().catch(() => null);
    const { data, error } = await getSupabaseAdminClient()
      .from("date_scan_runs")
      .select(select)
      .order("started_at", { ascending: false })
      .limit(Math.max(1, Math.min(limit, 200)));

    let runs = (data ?? []).map((row) => mapRun(row as unknown as DateScanRunRow));
    const liveStatus = await liveStatusPromise;
    const liveRun = liveStatus ? liveRunFromStatus(liveStatus) : null;
    if (liveStatus) {
      runs = reconcileLiveRun(runs, liveStatus, liveRun);
    }

    if (error) return { runs, error: error.message };
    return { runs, error: null };
  } catch (error) {
    return { runs: [] as DateScanRun[], error: errorMessage(error) };
  }
}
