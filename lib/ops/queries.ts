import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase";
import {
  EDITORIAL_DEAL_MAX_DROP_RATIO,
  buildRouteMap,
  buildSeriesKey,
  countEditorialDeals,
  countTable,
  defaultOpsAutomatedAlertsSummary,
  defaultScannerHealthSummary,
  extractPatternKey,
  formatError,
  opsConfigurationMessage,
  opsQueryMessage,
  unique,
} from "@/lib/ops/shared";
import {
  type DealRow,
  type OpsDealPriceSeriesData,
  type OpsRecentSnapshotsData,
  type OpsReviewQueueData,
  type OpsScannerData,
  type OpsSubscribersData,
  type OpsSummaryData,
  type RouteRow,
  type ScannerHealthRuleRow,
  type ScannerHealthRunRow,
  type ScannerHealthServiceMonthRow,
  type SnapshotRow,
  type SubscriberCustomAlertRow,
  type SubscriberPreferenceRow,
  type SubscriberRoutePreferenceRow,
  type SubscriberRow,
} from "@/lib/ops/types";
import {
  SCANNER_HEALTH_LOOKAHEAD_END_DAYS,
  SCANNER_HEALTH_LOOKAHEAD_START_DAYS,
  buildOpsAutomatedAlertsSummary,
  buildScannerHealthSummary,
  readLatestScannerIssuesByRoute,
} from "@/lib/ops/scanner-health";
import { buildSubscriberSummaries } from "@/lib/ops/audience";
import {
  buildPriceSeries,
  enrichDeals,
  enrichSnapshots,
} from "@/lib/ops/enrichment";

export async function getOpsSummaryData(): Promise<OpsSummaryData> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const configurationError = opsConfigurationMessage();
    return {
      configured: false,
      schemaReady: false,
      onboardingMessage: configurationError,
      metrics: {
        subscribers: 0,
        activeRoutes: 0,
        newDeals: 0,
        snapshots24h: 0,
      },
      dealStateCounts: { new: 0, reviewed: 0, sent: 0, expired: 0 },
      verificationErrors: {
        subscribers: configurationError,
        activeRoutes: configurationError,
        newDeals: configurationError,
        reviewedDeals: configurationError,
        sentDeals: configurationError,
        expiredDeals: configurationError,
        snapshots24h: configurationError,
      },
    };
  }

  const supabase = getSupabaseAdminClient();
  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();
  const [
    subscriberCount,
    routeCount,
    newDealCount,
    reviewedDealCount,
    sentDealCount,
    expiredDealCount,
    snapshotCountQuery,
  ] = await Promise.all([
    countTable("newsletter_subscribers"),
    countTable("scanned_routes", { column: "is_active", value: true }),
    countEditorialDeals("new"),
    countEditorialDeals("reviewed"),
    countTable("deal_candidates", { column: "status", value: "sent" }),
    countTable("deal_candidates", { column: "status", value: "expired" }),
    supabase
      .from("price_snapshots")
      .select("*", { count: "exact", head: true })
      .gte("scanned_at", twentyFourHoursAgo),
  ]);

  const snapshotCountError = snapshotCountQuery.error
    ? formatError(snapshotCountQuery.error)
    : null;
  const errors = [
    subscriberCount.error,
    routeCount.error,
    newDealCount.error,
    reviewedDealCount.error,
    sentDealCount.error,
    expiredDealCount.error,
    snapshotCountError,
  ].filter(Boolean) as string[];

  return {
    configured: true,
    schemaReady: errors.length === 0,
    onboardingMessage: errors[0] ? opsQueryMessage(errors[0]) : null,
    metrics: {
      subscribers: subscriberCount.count,
      activeRoutes: routeCount.count,
      newDeals: newDealCount.count,
      snapshots24h: snapshotCountQuery.count ?? 0,
    },
    dealStateCounts: {
      new: newDealCount.count,
      reviewed: reviewedDealCount.count,
      sent: sentDealCount.count,
      expired: expiredDealCount.count,
    },
    verificationErrors: {
      subscribers: subscriberCount.error,
      activeRoutes: routeCount.error,
      newDeals: newDealCount.error,
      reviewedDeals: reviewedDealCount.error,
      sentDeals: sentDealCount.error,
      expiredDeals: expiredDealCount.error,
      snapshots24h: snapshotCountError,
    },
  };
}

export async function getOpsSubscribersData(
  limit: number = 50,
): Promise<OpsSubscribersData> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      configured: false,
      schemaReady: false,
      onboardingMessage: opsConfigurationMessage(),
      subscribers: [],
    };
  }

  const supabase = getSupabaseAdminClient();
  const subscribersQuery = await supabase
    .from("newsletter_subscribers")
    .select(
      "id,email,source,status,created_at,home_airport,onboarding_completed,preference_token,unsubscribe_token,email_confirmed,preferred_locale",
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));

  if (subscribersQuery.error) {
    const message = formatError(subscribersQuery.error);
    return {
      configured: true,
      schemaReady: false,
      onboardingMessage: opsQueryMessage(message),
      subscribers: [],
    };
  }

  const subscribers = (subscribersQuery.data ?? []) as SubscriberRow[];
  const subscriberIds = subscribers.map((subscriber) => subscriber.id);
  const empty = { data: [], error: null };
  const [preferencesQuery, routePreferencesQuery, customAlertRulesQuery] =
    subscriberIds.length === 0
      ? [empty, empty, empty]
      : await Promise.all([
          supabase
            .from("subscriber_preferences")
            .select("*")
            .in("subscriber_id", subscriberIds),
          supabase
            .from("subscriber_route_preferences")
            .select(
              "subscriber_id,destination_airport,destination_city,bucket,is_enabled",
            )
            .in("subscriber_id", subscriberIds),
          supabase
            .from("subscriber_custom_alerts")
            .select("*")
            .in("subscriber_id", subscriberIds)
            .order("sort_order", { ascending: true }),
        ]);
  const errors = [
    preferencesQuery.error ? formatError(preferencesQuery.error) : null,
    routePreferencesQuery.error
      ? formatError(routePreferencesQuery.error)
      : null,
    customAlertRulesQuery.error
      ? formatError(customAlertRulesQuery.error)
      : null,
  ].filter(Boolean) as string[];

  return {
    configured: true,
    schemaReady: errors.length === 0,
    onboardingMessage: errors[0] ? opsQueryMessage(errors[0]) : null,
    subscribers: errors.length
      ? []
      : buildSubscriberSummaries(
          subscribers,
          (preferencesQuery.data ?? []) as SubscriberPreferenceRow[],
          (routePreferencesQuery.data ?? []) as SubscriberRoutePreferenceRow[],
          (customAlertRulesQuery.data ?? []) as SubscriberCustomAlertRow[],
        ),
  };
}

export async function getOpsScannerData(): Promise<OpsScannerData> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      configured: false,
      schemaReady: false,
      onboardingMessage: opsConfigurationMessage(),
      scannerHealth: defaultScannerHealthSummary(),
      automatedAlerts: defaultOpsAutomatedAlertsSummary(),
    };
  }

  const supabase = getSupabaseAdminClient();
  const [routesQuery, snapshotsQuery, scanRunsQuery] = await Promise.all([
    supabase
      .from("scanned_routes")
      .select(
        "id,origin_airport,destination_airport,destination_city,bucket,trip_nights,min_trip_nights,max_trip_nights,max_stops,is_active",
      )
      .order("bucket")
      .order("destination_city"),
    supabase
      .from("ops_latest_price_snapshots")
      .select(
        "id,route_id,scan_run_id,price,currency,departure_date,return_date,trip_nights,max_stops,metadata,scanned_at",
      )
      .order("scanned_at", { ascending: false }),
    supabase
      .from("price_scan_runs")
      .select(
        "id,status,started_at,completed_at,routes_planned,routes_started,routes_completed,found_prices,timed_out,network_outages,hard_errors,routes",
      )
      .neq("status", "running")
      .order("started_at", { ascending: false })
      .limit(6),
  ]);
  const firstError =
    routesQuery.error ?? snapshotsQuery.error ?? scanRunsQuery.error;
  if (firstError) {
    const message = formatError(firstError);
    return {
      configured: true,
      schemaReady: false,
      onboardingMessage: opsQueryMessage(message),
      scannerHealth: defaultScannerHealthSummary(),
      automatedAlerts: defaultOpsAutomatedAlertsSummary(),
    };
  }

  const routes = (routesQuery.data ?? []) as RouteRow[];
  const activeRouteIds = routes
    .filter((route) => route.is_active)
    .map((route) => route.id);
  const today = new Date();
  const windowStart = new Date(today);
  windowStart.setDate(
    windowStart.getDate() + SCANNER_HEALTH_LOOKAHEAD_START_DAYS,
  );
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + SCANNER_HEALTH_LOOKAHEAD_END_DAYS);
  const monthFrom = new Date(
    windowStart.getFullYear(),
    windowStart.getMonth(),
    1,
  )
    .toISOString()
    .slice(0, 10);
  const monthTo = new Date(windowEnd.getFullYear(), windowEnd.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const noRows = { data: [], error: null };
  const [serviceMonthsQuery, rulesQuery] =
    activeRouteIds.length === 0
      ? [noRows, noRows]
      : await Promise.all([
          supabase
            .from("route_service_months")
            .select(
              "route_id,month_start,routing,departure_dates,departure_weekdays,last_checked_at",
            )
            .in("route_id", activeRouteIds)
            .gte("month_start", monthFrom)
            .lte("month_start", monthTo)
            .order("month_start"),
          supabase
            .from("route_search_rules")
            .select(
              "route_id,month_start,pattern_label,departure_weekday,return_weekday,trip_nights,max_stops,sort_order,is_active",
            )
            .in("route_id", activeRouteIds)
            .gte("month_start", monthFrom)
            .lte("month_start", monthTo)
            .order("month_start")
            .order("sort_order"),
        ]);
  const contextError = serviceMonthsQuery.error ?? rulesQuery.error;
  if (contextError) {
    const message = formatError(contextError);
    return {
      configured: true,
      schemaReady: false,
      onboardingMessage: opsQueryMessage(message),
      scannerHealth: defaultScannerHealthSummary(),
      automatedAlerts: defaultOpsAutomatedAlertsSummary(),
    };
  }

  const routeMap = buildRouteMap(routes);
  const latestIssues = await readLatestScannerIssuesByRoute();
  const scannerHealth = buildScannerHealthSummary(
    routes,
    (snapshotsQuery.data ?? []) as SnapshotRow[],
    (scanRunsQuery.data ?? []) as ScannerHealthRunRow[],
    routeMap,
    (serviceMonthsQuery.data ?? []) as ScannerHealthServiceMonthRow[],
    (rulesQuery.data ?? []) as ScannerHealthRuleRow[],
    latestIssues,
  );

  return {
    configured: true,
    schemaReady: true,
    onboardingMessage: null,
    scannerHealth,
    automatedAlerts: buildOpsAutomatedAlertsSummary(
      scannerHealth,
      latestIssues.syncFailures,
    ),
  };
}

export async function getOpsReviewQueueData(
  requestedPage: number = 1,
  requestedPageSize: number = 50,
): Promise<OpsReviewQueueData> {
  const page = Math.max(1, Math.floor(requestedPage));
  const pageSize = Math.min(50, Math.max(1, Math.floor(requestedPageSize)));
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      configured: false,
      schemaReady: false,
      onboardingMessage: opsConfigurationMessage(),
      deals: [],
      totalDeals: null,
      totalDealsError: opsConfigurationMessage(),
      page,
      pageSize,
    };
  }

  const supabase = getSupabaseAdminClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const [countResult, dealsQuery] = await Promise.all([
    countEditorialDeals("new"),
    supabase
      .from("deal_candidates")
      .select(
        "id,route_id,snapshot_id,title,summary,deal_price,baseline_price,drop_ratio,score,send_type,status,created_at",
      )
      .eq("status", "new")
      .lte("drop_ratio", EDITORIAL_DEAL_MAX_DROP_RATIO)
      .order("score", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to),
  ]);
  const dealsError = dealsQuery.error ? formatError(dealsQuery.error) : null;
  if (dealsError) {
    return {
      configured: true,
      schemaReady: false,
      onboardingMessage: opsQueryMessage(dealsError),
      deals: [],
      totalDeals: countResult.error ? null : countResult.count,
      totalDealsError: countResult.error,
      page,
      pageSize,
    };
  }

  const dealRows = (dealsQuery.data ?? []) as DealRow[];
  const routeIds = unique(dealRows.map((deal) => deal.route_id));
  const snapshotIds = unique(dealRows.map((deal) => deal.snapshot_id));
  const noRows = { data: [], error: null };
  const [routesQuery, snapshotsQuery] = await Promise.all([
    routeIds.length === 0
      ? noRows
      : supabase
          .from("scanned_routes")
          .select(
            "id,origin_airport,destination_airport,destination_city,bucket,trip_nights,min_trip_nights,max_trip_nights,max_stops,is_active",
          )
          .in("id", routeIds),
    snapshotIds.length === 0
      ? noRows
      : supabase
          .from("price_snapshots")
          .select(
            "id,route_id,price,currency,departure_date,return_date,trip_nights,max_stops,metadata,scanned_at",
          )
          .in("id", snapshotIds),
  ]);
  const relatedError = routesQuery.error ?? snapshotsQuery.error;
  if (relatedError) {
    return {
      configured: true,
      schemaReady: false,
      onboardingMessage: opsQueryMessage(formatError(relatedError)),
      deals: [],
      totalDeals: countResult.error ? null : countResult.count,
      totalDealsError: countResult.error,
      page,
      pageSize,
    };
  }

  const routes = (routesQuery.data ?? []) as RouteRow[];
  const snapshotMap = new Map(
    ((snapshotsQuery.data ?? []) as SnapshotRow[]).map((snapshot) => [
      snapshot.id,
      snapshot,
    ]),
  );

  return {
    configured: true,
    schemaReady: true,
    onboardingMessage: null,
    deals: enrichDeals(dealRows, buildRouteMap(routes), snapshotMap, new Map()),
    totalDeals: countResult.error ? null : countResult.count,
    totalDealsError: countResult.error,
    page,
    pageSize,
  };
}

export async function getOpsDealPriceSeries(
  dealId: string,
  limit: number = 180,
): Promise<OpsDealPriceSeriesData> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { series: null, error: opsConfigurationMessage() };
  }

  const supabase = getSupabaseAdminClient();
  const dealQuery = await supabase
    .from("deal_candidates")
    .select("route_id,snapshot_id")
    .eq("id", dealId)
    .maybeSingle();
  if (dealQuery.error) {
    return { series: null, error: formatError(dealQuery.error) };
  }
  if (!dealQuery.data) {
    return { series: null, error: "Deal not found." };
  }

  const [routeQuery, selectedSnapshotQuery] = await Promise.all([
    supabase
      .from("scanned_routes")
      .select(
        "id,origin_airport,destination_airport,destination_city,bucket,trip_nights,min_trip_nights,max_trip_nights,max_stops,is_active",
      )
      .eq("id", dealQuery.data.route_id)
      .maybeSingle(),
    supabase
      .from("price_snapshots")
      .select("metadata")
      .eq("id", dealQuery.data.snapshot_id)
      .maybeSingle(),
  ]);
  const setupError = routeQuery.error ?? selectedSnapshotQuery.error;
  if (setupError) {
    return { series: null, error: formatError(setupError) };
  }
  if (!routeQuery.data) {
    return { series: null, error: "Route not found." };
  }

  const patternKey = extractPatternKey(
    (selectedSnapshotQuery.data?.metadata as Record<string, unknown> | null) ??
      null,
  );
  if (!patternKey) {
    return { series: null, error: null };
  }

  const historyQuery = await supabase
    .from("price_snapshots")
    .select(
      "id,route_id,price,currency,departure_date,return_date,trip_nights,max_stops,metadata,scanned_at",
    )
    .eq("route_id", dealQuery.data.route_id)
    .eq("metadata->>pattern_key", patternKey)
    .order("scanned_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(Math.min(365, Math.max(1, limit)));
  if (historyQuery.error) {
    return { series: null, error: formatError(historyQuery.error) };
  }

  const route = routeQuery.data as RouteRow;
  const seriesKey = buildSeriesKey(route.id, patternKey);
  const series = buildPriceSeries(
    (historyQuery.data ?? []) as SnapshotRow[],
    buildRouteMap([route]),
  ).find((item) => item.seriesKey === seriesKey);
  return { series: series ?? null, error: null };
}

export async function getOpsRecentSnapshotsData(
  requestedLimit: number = 10,
): Promise<OpsRecentSnapshotsData> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      configured: false,
      schemaReady: false,
      onboardingMessage: opsConfigurationMessage(),
      snapshots: [],
    };
  }

  const supabase = getSupabaseAdminClient();
  const limit = Math.min(50, Math.max(1, Math.floor(requestedLimit)));
  const snapshotsQuery = await supabase
    .from("price_snapshots")
    .select(
      "id,route_id,price,currency,departure_date,return_date,trip_nights,max_stops,metadata,scanned_at",
    )
    .gt("price", 0)
    .order("scanned_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (snapshotsQuery.error) {
    return {
      configured: true,
      schemaReady: false,
      onboardingMessage: opsQueryMessage(formatError(snapshotsQuery.error)),
      snapshots: [],
    };
  }

  const snapshotRows = (snapshotsQuery.data ?? []) as SnapshotRow[];
  const routeIds = unique(snapshotRows.map((snapshot) => snapshot.route_id));
  const routesQuery =
    routeIds.length === 0
      ? { data: [] as RouteRow[], error: null }
      : await supabase
          .from("scanned_routes")
          .select(
            "id,origin_airport,destination_airport,destination_city,bucket,trip_nights,min_trip_nights,max_trip_nights,max_stops,is_active",
          )
          .in("id", routeIds);

  if (routesQuery.error) {
    return {
      configured: true,
      schemaReady: false,
      onboardingMessage: opsQueryMessage(formatError(routesQuery.error)),
      snapshots: [],
    };
  }

  return {
    configured: true,
    schemaReady: true,
    onboardingMessage: null,
    snapshots: enrichSnapshots(
      snapshotRows,
      buildRouteMap((routesQuery.data ?? []) as RouteRow[]),
    ),
  };
}
