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
  airline: string | null;
  airline_code: string | null;
  outbound_departure_at: string | null;
  outbound_arrival_at: string | null;
  return_departure_at: string | null;
  return_arrival_at: string | null;
  outbound_stop_count: number | null;
  return_stop_count: number | null;
};

export type PriceScanRun = {
  id: string;
  runKey: string;
  scannerSource: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  searchWindowStart: string | null;
  searchWindowEnd: string | null;
  scannedCities: string[];
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
  search_window_start: string | null;
  search_window_end: string | null;
  scanned_cities: unknown;
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
  "search_window_start",
  "search_window_end",
  "scanned_cities",
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

function stringArrayValue(value: unknown) {
  return arrayValue<unknown>(value).filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
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

function nullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function patternItineraryKey(pattern: PriceScanPatternSummary) {
  return [
    pattern.route_key,
    pattern.pattern_key,
    pattern.departure_date,
    pattern.return_date,
    pattern.price,
  ].join("|");
}

async function enrichPatternItineraries(run: PriceScanRun) {
  const patterns = run.patterns ?? [];
  if (patterns.length === 0 || patterns.every((pattern) => pattern.airline)) return run;

  const supabase = getSupabaseAdminClient();
  const rows: Array<{
    price: number;
    departure_date: string;
    return_date: string | null;
    metadata: unknown;
  }> = [];
  const pageSize = 1_000;

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("price_snapshots")
      .select("price,departure_date,return_date,metadata")
      .gte("scanned_at", run.startedAt)
      .order("scanned_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (run.completedAt) query = query.lte("scanned_at", run.completedAt);
    const page = await query;
    if (page.error) throw new Error(page.error.message);
    const pageRows = (page.data ?? []) as typeof rows;
    rows.push(...pageRows);
    if (pageRows.length < pageSize) break;
  }

  const itineraries = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const metadata = recordValue(row.metadata);
    const key = [
      nullableString(metadata.local_route_id),
      nullableString(metadata.pattern_key),
      row.departure_date,
      row.return_date,
      numberValue(row.price),
    ].join("|");
    const current = itineraries.get(key) ?? [];
    current.push(metadata);
    itineraries.set(key, current);
  }

  return {
    ...run,
    patterns: patterns.map((pattern) => {
      if (pattern.airline) return pattern;
      const metadata = itineraries.get(patternItineraryKey(pattern))?.shift();
      if (!metadata) return pattern;
      return {
        ...pattern,
        airline: nullableString(metadata.airline_summary) ?? nullableString(metadata.primary_airline),
        airline_code: nullableString(metadata.primary_airline_code),
        outbound_departure_at: nullableString(metadata.outbound_departure_at),
        outbound_arrival_at: nullableString(metadata.outbound_arrival_at),
        return_departure_at: nullableString(metadata.return_departure_at),
        return_arrival_at: nullableString(metadata.return_arrival_at),
        outbound_stop_count: nullableNumber(metadata.outbound_stop_count),
        return_stop_count: nullableNumber(metadata.return_stop_count),
      };
    }),
  };
}

function mapRun(row: PriceScanRunRow): PriceScanRun {
  const destinations = arrayValue<PriceScanDestinationSummary>(row.destinations);
  const storedScannedCities = stringArrayValue(row.scanned_cities);
  const scannedCities = storedScannedCities.length > 0
    ? storedScannedCities
    : destinations
        .filter((destination) => destination.routes_started > 0)
        .map((destination) => destination.destination_city);

  return {
    id: row.id,
    runKey: row.run_key,
    scannerSource: row.scanner_source,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: nullableNumber(row.duration_ms),
    searchWindowStart: row.search_window_start,
    searchWindowEnd: row.search_window_end,
    scannedCities,
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
    destinations,
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

    const run = data ? mapRun(data as unknown as PriceScanRunRow) : null;
    return {
      run: run ? await enrichPatternItineraries(run) : null,
      error: null as string | null,
    };
  } catch (error) {
    return { run: null as PriceScanRun | null, error: formatError(error) };
  }
}
