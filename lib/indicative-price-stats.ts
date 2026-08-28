import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase";

export type IndicativePriceOverview = {
  observations: number;
  combinations: number;
  routes: number;
  rules: number;
  departureMonths: number;
  independentScanRuns: number;
  verifiedCalendarPrices: number;
  lastUpdatedAt: string | null;
  tableBytes: number;
};

export type IndicativePriceStatistic = {
  routeId: string;
  originAirport: string;
  destinationAirport: string;
  ruleKey: string;
  ruleLabel: string;
  departureMonth: string;
  routingType: string;
  maxStops: string;
  currency: string;
  combinationsObserved: number;
  observations: number;
  independentScanRuns: number;
  minimumPrice: number;
  medianPrice: number;
  lowerQuartilePrice: number;
  maximumPrice: number;
  lastUpdatedAt: string;
};

type RpcRow = Record<string, unknown>;

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : String(value ?? "");
}

export async function getIndicativePriceCoverage(limit = 50) {
  const supabase = getSupabaseAdminClient();
  const [overviewQuery, statisticsQuery] = await Promise.all([
    supabase.rpc("get_indicative_price_overview"),
    supabase.rpc("get_indicative_price_statistics", {
      p_limit: Math.max(1, Math.min(limit, 500)),
      p_route_id: null,
    }),
  ]);

  if (overviewQuery.error || statisticsQuery.error) {
    return {
      overview: null,
      statistics: [] as IndicativePriceStatistic[],
      error: overviewQuery.error?.message ?? statisticsQuery.error?.message ?? "Unknown error",
    };
  }

  const rawOverview = ((overviewQuery.data ?? [])[0] ?? {}) as RpcRow;
  const overview: IndicativePriceOverview = {
    observations: numberValue(rawOverview.observations),
    combinations: numberValue(rawOverview.combinations),
    routes: numberValue(rawOverview.routes),
    rules: numberValue(rawOverview.rules),
    departureMonths: numberValue(rawOverview.departure_months),
    independentScanRuns: numberValue(rawOverview.independent_scan_runs),
    verifiedCalendarPrices: numberValue(rawOverview.verified_calendar_prices),
    lastUpdatedAt:
      typeof rawOverview.last_updated_at === "string" ? rawOverview.last_updated_at : null,
    tableBytes: numberValue(rawOverview.table_bytes),
  };

  const statistics = ((statisticsQuery.data ?? []) as RpcRow[]).map(
    (row): IndicativePriceStatistic => ({
      routeId: stringValue(row.route_id),
      originAirport: stringValue(row.origin_airport),
      destinationAirport: stringValue(row.destination_airport),
      ruleKey: stringValue(row.rule_key),
      ruleLabel: stringValue(row.rule_label),
      departureMonth: stringValue(row.departure_month),
      routingType: stringValue(row.routing_type),
      maxStops: stringValue(row.max_stops),
      currency: stringValue(row.currency || "EUR"),
      combinationsObserved: numberValue(row.combinations_observed),
      observations: numberValue(row.observations),
      independentScanRuns: numberValue(row.independent_scan_runs),
      minimumPrice: numberValue(row.minimum_price),
      medianPrice: numberValue(row.median_price),
      lowerQuartilePrice: numberValue(row.lower_quartile_price),
      maximumPrice: numberValue(row.maximum_price),
      lastUpdatedAt: stringValue(row.last_updated_at),
    }),
  );

  return { overview, statistics, error: null };
}
