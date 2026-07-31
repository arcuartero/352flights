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

export async function recoverLatestVpsPriceScanRun(status: VpsScannerAgentStatus) {
  if (status.running) return { recovered: false, reason: "scanner_running" };

  const events = latestRunEvents(status);
  const startedAt = events[0]?.timestamp ?? parseTimestamp(status.service.ExecMainStartTimestamp);
  const completedAt =
    [...events].reverse().find((event) =>
      event.message.startsWith("Scanner finished with status ") ||
      event.message === "Scanner and sync finished." ||
      event.message === "Local Lux flight scan finished successfully.",
    )?.timestamp ?? parseTimestamp(status.service.ExecMainExitTimestamp);

  if (!startedAt || !completedAt) {
    return { recovered: false, reason: "missing_run_timestamps" };
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
    return { recovered: false, reason: "already_stored" };
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
  const hasErrors = timedOut + networkOutages + hardErrors > 0;

  const insert = await supabase.from("price_scan_runs").insert({
    run_key: runKey,
    scanner_source: "vps_recovered",
    status: hasErrors ? "completed_with_errors" : "completed",
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
    },
    sync_status: "completed",
    sync_summary: {
      recovered_from_vps_status: true,
      recovered_snapshot_count: snapshots.length,
      journal_event_count: events.length,
    },
    updated_at: new Date().toISOString(),
  });
  if (insert.error) throw new Error(insert.error.message);

  return { recovered: true, reason: "stored", runKey };
}
