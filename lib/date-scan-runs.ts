import "server-only";

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

export async function getDateScanRunHistory(limit = 100) {
  try {
    const { data, error } = await getSupabaseAdminClient()
      .from("date_scan_runs")
      .select(select)
      .order("started_at", { ascending: false })
      .limit(Math.max(1, Math.min(limit, 200)));

    if (error) return { runs: [] as DateScanRun[], error: error.message };
    return { runs: (data ?? []).map((row) => mapRun(row as unknown as DateScanRunRow)), error: null };
  } catch (error) {
    return { runs: [] as DateScanRun[], error: errorMessage(error) };
  }
}
