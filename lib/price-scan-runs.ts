import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase";

export type PriceScanDestinationSummary = {
  destination_city: string;
  destination_airports: string[];
  routes_planned: number;
  routes_started: number;
  routes_completed: number;
  patterns_scanned: number;
  rules_scanned: number;
  found_prices: number;
  deal_candidates: number;
  no_results: number;
  timed_out: number;
  network_outages: number;
  hard_errors: number;
  retries: number;
};

export type PriceScanRouteSummary = {
  route_key: string;
  route_label: string;
  origin_airport: string;
  destination_airport: string;
  destination_city: string;
  bucket: string;
  routing: string;
  started: boolean;
  completed: boolean;
  patterns_scanned: number;
  rules_scanned: number;
  found_prices: number;
  deal_candidates: number;
  no_results: number;
  timed_out: number;
  network_outages: number;
  hard_errors: number;
  retries: number;
};

export type PriceScanPatternSummary = {
  route_key: string;
  route_label: string;
  destination_airport: string;
  destination_city: string;
  bucket: string;
  pattern_key: string;
  pattern_label: string;
  departure_weekday: string;
  return_weekday: string;
  trip_nights: number;
  status: string;
  price: number | null;
  currency: string | null;
  departure_date: string | null;
  return_date: string | null;
  reason_code: string | null;
  reason: string | null;
  error_type: string | null;
  error: string | null;
  retry_count: number;
  rules_scanned: number;
};

export type PriceScanRun = {
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
  destinationsPlanned: number;
  destinationsScanned: number;
  patternsPlanned: number;
  patternsScanned: number;
  rulesScanned: number;
  foundPrices: number;
  dealCandidates: number;
  noResults: number;
  timedOut: number;
  networkOutages: number;
  hardErrors: number;
  retries: number;
  currency: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  averagePrice: number | null;
  medianPrice: number | null;
  stoppedReason: string | null;
  stoppedReasonCode: string | null;
  destinations: PriceScanDestinationSummary[];
  routes: PriceScanRouteSummary[];
  patterns?: PriceScanPatternSummary[];
  noResultBreakdown: Record<string, number>;
  errorBreakdown: Record<string, number>;
  syncStatus: string;
  syncSummary: Record<string, unknown>;
};

type PriceScanRunRow = {
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
  destinations_planned: number;
  destinations_scanned: number;
  patterns_planned: number;
  patterns_scanned: number;
  rules_scanned: number;
  found_prices: number;
  deal_candidates: number;
  no_results: number;
  timed_out: number;
  network_outages: number;
  hard_errors: number;
  retries: number;
  currency: string | null;
  min_price: number | null;
  max_price: number | null;
  average_price: number | null;
  median_price: number | null;
  stopped_reason: string | null;
  stopped_reason_code: string | null;
  destinations: unknown;
  routes: unknown;
  patterns?: unknown;
  no_result_breakdown: unknown;
  error_breakdown: unknown;
  sync_status: string;
  sync_summary: unknown;
};

const baseSelect = [
  "id",
  "run_key",
  "scanner_source",
  "status",
  "started_at",
  "completed_at",
  "duration_ms",
  "routes_planned",
  "routes_started",
  "routes_completed",
  "destinations_planned",
  "destinations_scanned",
  "patterns_planned",
  "patterns_scanned",
  "rules_scanned",
  "found_prices",
  "deal_candidates",
  "no_results",
  "timed_out",
  "network_outages",
  "hard_errors",
  "retries",
  "currency",
  "min_price",
  "max_price",
  "average_price",
  "median_price",
  "stopped_reason",
  "stopped_reason_code",
  "destinations",
  "routes",
  "no_result_breakdown",
  "error_breakdown",
  "sync_status",
  "sync_summary",
].join(",");

function numberValue(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function arrayValue<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function countRecord(value: unknown) {
  return Object.fromEntries(
    Object.entries(recordValue(value)).map(([key, count]) => [key, numberValue(count)]),
  );
}

function mapRun(row: PriceScanRunRow): PriceScanRun {
  return {
    id: row.id,
    runKey: row.run_key,
    scannerSource: row.scanner_source,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: nullableNumber(row.duration_ms),
    routesPlanned: numberValue(row.routes_planned),
    routesStarted: numberValue(row.routes_started),
    routesCompleted: numberValue(row.routes_completed),
    destinationsPlanned: numberValue(row.destinations_planned),
    destinationsScanned: numberValue(row.destinations_scanned),
    patternsPlanned: numberValue(row.patterns_planned),
    patternsScanned: numberValue(row.patterns_scanned),
    rulesScanned: numberValue(row.rules_scanned),
    foundPrices: numberValue(row.found_prices),
    dealCandidates: numberValue(row.deal_candidates),
    noResults: numberValue(row.no_results),
    timedOut: numberValue(row.timed_out),
    networkOutages: numberValue(row.network_outages),
    hardErrors: numberValue(row.hard_errors),
    retries: numberValue(row.retries),
    currency: row.currency,
    minPrice: nullableNumber(row.min_price),
    maxPrice: nullableNumber(row.max_price),
    averagePrice: nullableNumber(row.average_price),
    medianPrice: nullableNumber(row.median_price),
    stoppedReason: row.stopped_reason,
    stoppedReasonCode: row.stopped_reason_code,
    destinations: arrayValue<PriceScanDestinationSummary>(row.destinations),
    routes: arrayValue<PriceScanRouteSummary>(row.routes),
    patterns: row.patterns
      ? arrayValue<PriceScanPatternSummary>(row.patterns)
      : undefined,
    noResultBreakdown: countRecord(row.no_result_breakdown),
    errorBreakdown: countRecord(row.error_breakdown),
    syncStatus: row.sync_status,
    syncSummary: recordValue(row.sync_summary),
  };
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return String(error);
}

export async function getPriceScanRunHistory(limit = 100) {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("price_scan_runs")
      .select(baseSelect)
      .order("started_at", { ascending: false })
      .limit(Math.max(1, Math.min(limit, 200)));

    if (error) {
      return { runs: [] as PriceScanRun[], error: formatError(error) };
    }

    return {
      runs: ((data ?? []) as unknown as PriceScanRunRow[]).map(mapRun),
      error: null as string | null,
    };
  } catch (error) {
    return { runs: [] as PriceScanRun[], error: formatError(error) };
  }
}

export async function getPriceScanRun(id: string) {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("price_scan_runs")
      .select(`${baseSelect},patterns`)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return { run: null as PriceScanRun | null, error: formatError(error) };
    }

    return {
      run: data ? mapRun(data as unknown as PriceScanRunRow) : null,
      error: null as string | null,
    };
  } catch (error) {
    return { run: null as PriceScanRun | null, error: formatError(error) };
  }
}
