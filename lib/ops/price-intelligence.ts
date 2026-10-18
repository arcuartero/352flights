import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase";
import {
  buildRouteMap,
  fetchPagedSnapshots,
  formatDisplayRouteLabel,
  formatError,
  isMissingTableError,
} from "@/lib/ops/shared";
import {
  type OpsPriceIntelligenceData,
  type RouteRow,
  type SnapshotRow,
} from "@/lib/ops/types";
import { buildPriceSeries } from "@/lib/ops/enrichment";

export async function getOpsPriceIntelligenceData(): Promise<OpsPriceIntelligenceData> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      configured: false,
      schemaReady: false,
      onboardingMessage:
        "Supabase is not configured yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.",
      scannerNote:
        "The current scanner stores one cheapest itinerary per exact search pattern and cron run. This board shows that tracked history.",
      totals: {
        routesTracked: 0,
        snapshotsLoaded: 0,
        latestSnapshotAt: null,
        liveLowestPrice: null,
        liveLowestRouteLabel: null,
      },
      series: [],
      tableRows: [],
    };
  }

  const supabase = getSupabaseAdminClient();
  const [routesQuery, snapshotsQuery] = await Promise.all([
    supabase
      .from("scanned_routes")
      .select(
        "id,origin_airport,destination_airport,destination_city,bucket,trip_nights,min_trip_nights,max_trip_nights,max_stops,is_active",
      )
      .eq("is_active", true)
      .order("bucket")
      .order("destination_city"),
    fetchPagedSnapshots<SnapshotRow>((from, to) =>
      supabase
        .from("price_snapshots")
        .select(
          "id,route_id,price,currency,departure_date,return_date,trip_nights,max_stops,metadata,scanned_at",
        )
        .order("scanned_at", { ascending: false })
        .range(from, to),
    ),
  ]);

  const errors = [
    routesQuery.error ? formatError(routesQuery.error) : null,
    snapshotsQuery.error ? formatError(snapshotsQuery.error) : null,
  ].filter(Boolean) as string[];

  if (errors.length > 0) {
    const message = errors[0];
    return {
      configured: true,
      schemaReady: false,
      onboardingMessage: isMissingTableError(message)
        ? "Supabase is reachable, but the latest tables are not created yet. Re-run supabase/schema.sql and then supabase/seed.sql in the SQL Editor."
        : `Supabase responded with an error: ${message}`,
      scannerNote:
        "The current scanner stores one cheapest itinerary per exact search pattern and cron run. This board shows that tracked history.",
      totals: {
        routesTracked: 0,
        snapshotsLoaded: 0,
        latestSnapshotAt: null,
        liveLowestPrice: null,
        liveLowestRouteLabel: null,
      },
      series: [],
      tableRows: [],
    };
  }

  const routes = (routesQuery.data ?? []) as RouteRow[];
  const routeMap = buildRouteMap(routes);
  const snapshotRows = (snapshotsQuery.data ?? []) as SnapshotRow[];
  const series = buildPriceSeries(snapshotRows, routeMap);
  const tableRows = series
    .flatMap((routeSeries) => routeSeries.points)
    .sort(
      (left, right) =>
        new Date(right.scannedAt).getTime() -
        new Date(left.scannedAt).getTime(),
    );

  const latestPerRoute = series.filter(
    (routeSeries) => routeSeries.latestPrice !== null,
  );
  const liveLowest = [...latestPerRoute].sort((left, right) => {
    const leftValue = left.latestPrice ?? Number.POSITIVE_INFINITY;
    const rightValue = right.latestPrice ?? Number.POSITIVE_INFINITY;
    return leftValue - rightValue;
  })[0];

  return {
    configured: true,
    schemaReady: true,
    onboardingMessage: null,
    scannerNote:
      "The current scanner stores one cheapest itinerary per active route pattern on each cron run. To see every itinerary option returned by Google Flights, the scanner would need a wider capture mode.",
    totals: {
      routesTracked: series.length,
      snapshotsLoaded: tableRows.length,
      latestSnapshotAt: tableRows[0]?.scannedAt ?? null,
      liveLowestPrice: liveLowest?.latestPrice ?? null,
      liveLowestRouteLabel: liveLowest
        ? formatDisplayRouteLabel(
            liveLowest.routeLabel,
            liveLowest.patternLabel,
          )
        : null,
    },
    series,
    tableRows,
  };
}
