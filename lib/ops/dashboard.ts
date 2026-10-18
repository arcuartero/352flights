import "server-only";
import { getSiteUrl, hasCronSecret, hasResendEnv } from "@/lib/env";
import { sendResendEmail } from "@/lib/email";
import {
  campaignSendTypes,
  type DigestAutomationSummary,
} from "@/lib/ops-shared";
import {
  deriveStayBucketFromNights,
  formatStayBucketListLabel,
} from "@/lib/stay-buckets";
import { getSupabaseAdminClient } from "@/lib/supabase";
import {
  EDITORIAL_DEAL_MAX_DROP_RATIO,
  autoExpireStaleDeals,
  buildRouteMap,
  buildSeriesKey,
  countEditorialDeals,
  countTable,
  defaultDigestAutomationSummary,
  defaultOpsAutomatedAlertsSummary,
  defaultScannerHealthSummary,
  extractPatternKey,
  formatError,
  formatTimeParts,
  isMissingTableError,
  luxembourgParts,
  unique,
} from "@/lib/ops/shared";
import {
  type AutomationSettingsRow,
  type DealRow,
  type EmailCampaignRow,
  type OpsDashboardData,
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
  OPS_ALERT_RECIPIENT_EMAIL,
  SCANNER_HEALTH_LOOKAHEAD_END_DAYS,
  SCANNER_HEALTH_LOOKAHEAD_START_DAYS,
  buildOpsAlertEmail,
  buildOpsAlertStateKey,
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
import { buildCampaignPreview, loadCampaignModel } from "@/lib/ops/campaigns";

export async function getOpsDashboardData(): Promise<OpsDashboardData> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      configured: false,
      schemaReady: false,
      onboardingMessage:
        "Supabase is not configured yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.",
      metrics: {
        subscribers: 0,
        activeRoutes: 0,
        newDeals: 0,
        snapshots24h: 0,
      },
      dealStateCounts: {
        new: 0,
        reviewed: 0,
        sent: 0,
        expired: 0,
      },
      digestAutomation: defaultDigestAutomationSummary(),
      subscribers: [],
      routes: [],
      newDeals: [],
      newDealSeries: [],
      scannerHealth: defaultScannerHealthSummary(),
      automatedAlerts: defaultOpsAutomatedAlertsSummary(),
      recentSnapshots: [],
      sendQueue: [],
      recentCampaigns: [],
    };
  }

  await autoExpireStaleDeals();

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
    subscribersQuery,
    preferencesQuery,
    routePreferencesQuery,
    customAlertRulesQuery,
    routesQuery,
    newDealsQuery,
    reviewedDealsQuery,
    recentSnapshotsQuery,
    scannerHealthSnapshotsQuery,
    scannerHealthRunsQuery,
    recentCampaignsQuery,
    automationQuery,
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
    supabase
      .from("newsletter_subscribers")
      .select(
        "id,email,source,status,created_at,home_airport,onboarding_completed,preference_token,unsubscribe_token,email_confirmed,preferred_locale",
      )
      .order("created_at", { ascending: false }),
    supabase.from("subscriber_preferences").select("*"),
    supabase
      .from("subscriber_route_preferences")
      .select(
        "subscriber_id,destination_airport,destination_city,bucket,is_enabled",
      ),
    supabase
      .from("subscriber_custom_alerts")
      .select("*")
      .order("sort_order", { ascending: true }),
    supabase
      .from("scanned_routes")
      .select(
        "id,origin_airport,destination_airport,destination_city,bucket,trip_nights,min_trip_nights,max_trip_nights,max_stops,is_active",
      )
      .order("bucket")
      .order("destination_city"),
    supabase
      .from("deal_candidates")
      .select(
        "id,route_id,snapshot_id,title,summary,deal_price,baseline_price,drop_ratio,score,send_type,status,created_at",
      )
      .eq("status", "new")
      .lte("drop_ratio", EDITORIAL_DEAL_MAX_DROP_RATIO)
      .order("score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("deal_candidates")
      .select(
        "id,route_id,snapshot_id,title,summary,deal_price,baseline_price,drop_ratio,score,send_type,status,created_at",
      )
      .eq("status", "reviewed")
      .lte("drop_ratio", EDITORIAL_DEAL_MAX_DROP_RATIO)
      .order("score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("price_snapshots")
      .select(
        "id,route_id,price,currency,departure_date,return_date,trip_nights,max_stops,metadata,scanned_at",
      )
      .order("scanned_at", { ascending: false })
      .limit(10),
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
    supabase
      .from("email_campaigns")
      .select(
        "id,send_type,subject,status,recipient_count,sent_count,failed_count,route_labels,created_at,sent_at",
      )
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("ops_automation_settings")
      .select(
        "id,daily_digest_enabled,daily_digest_hour,daily_digest_minute,test_email,last_digest_sent_on,weekly_digest_enabled,last_weekly_sent_on",
      )
      .eq("id", "default")
      .maybeSingle(),
  ]);

  const errors = [
    subscriberCount.error,
    routeCount.error,
    newDealCount.error,
    reviewedDealCount.error,
    sentDealCount.error,
    expiredDealCount.error,
    snapshotCountQuery.error ? formatError(snapshotCountQuery.error) : null,
    subscribersQuery.error ? formatError(subscribersQuery.error) : null,
    preferencesQuery.error ? formatError(preferencesQuery.error) : null,
    routePreferencesQuery.error
      ? formatError(routePreferencesQuery.error)
      : null,
    customAlertRulesQuery.error
      ? formatError(customAlertRulesQuery.error)
      : null,
    routesQuery.error ? formatError(routesQuery.error) : null,
    newDealsQuery.error ? formatError(newDealsQuery.error) : null,
    reviewedDealsQuery.error ? formatError(reviewedDealsQuery.error) : null,
    recentSnapshotsQuery.error ? formatError(recentSnapshotsQuery.error) : null,
    scannerHealthSnapshotsQuery.error
      ? formatError(scannerHealthSnapshotsQuery.error)
      : null,
    scannerHealthRunsQuery.error
      ? formatError(scannerHealthRunsQuery.error)
      : null,
    recentCampaignsQuery.error ? formatError(recentCampaignsQuery.error) : null,
    automationQuery.error ? formatError(automationQuery.error) : null,
  ].filter(Boolean) as string[];

  if (errors.length > 0) {
    const message = errors[0];
    return {
      configured: true,
      schemaReady: false,
      onboardingMessage: isMissingTableError(message)
        ? "Supabase is reachable, but the latest tables are not created yet. Re-run supabase/schema.sql and then supabase/seed.sql in the SQL Editor."
        : `Supabase responded with an error: ${message}`,
      metrics: {
        subscribers: 0,
        activeRoutes: 0,
        newDeals: 0,
        snapshots24h: 0,
      },
      dealStateCounts: {
        new: 0,
        reviewed: 0,
        sent: 0,
        expired: 0,
      },
      digestAutomation: defaultDigestAutomationSummary(),
      subscribers: [],
      routes: [],
      newDeals: [],
      newDealSeries: [],
      scannerHealth: defaultScannerHealthSummary(),
      automatedAlerts: defaultOpsAutomatedAlertsSummary(),
      recentSnapshots: [],
      sendQueue: [],
      recentCampaigns: [],
    };
  }

  const newDealRows = (newDealsQuery.data ?? []) as DealRow[];
  const reviewedDealRows = (
    (reviewedDealsQuery.data ?? []) as DealRow[]
  ).filter((deal) => deal.deal_price > 0);
  const snapshotIds = unique(
    [...newDealRows, ...reviewedDealRows].map((deal) => deal.snapshot_id),
  );

  const dealSnapshotsQuery =
    snapshotIds.length === 0
      ? { data: [] as SnapshotRow[], error: null }
      : await supabase
          .from("price_snapshots")
          .select(
            "id,route_id,price,currency,departure_date,return_date,trip_nights,max_stops,metadata,scanned_at",
          )
          .in("id", snapshotIds);

  // Historical series are intentionally not fetched for the dashboard. The
  // exact route + pattern history is loaded through the authenticated API only
  // when an operator opens a deal.
  const dealHistorySnapshotsQuery = {
    data: [] as Array<
      Pick<SnapshotRow, "route_id" | "metadata" | "scanned_at">
    >,
    error: null,
  };
  const newDealSeriesSnapshotsQuery = {
    data: [] as SnapshotRow[],
    error: null,
  };

  if (dealSnapshotsQuery.error) {
    const message = formatError(dealSnapshotsQuery.error);
    return {
      configured: true,
      schemaReady: false,
      onboardingMessage: isMissingTableError(message)
        ? "Supabase is reachable, but the latest tables are not created yet. Re-run supabase/schema.sql and then supabase/seed.sql in the SQL Editor."
        : `Supabase responded with an error: ${message}`,
      metrics: {
        subscribers: 0,
        activeRoutes: 0,
        newDeals: 0,
        snapshots24h: 0,
      },
      dealStateCounts: {
        new: 0,
        reviewed: 0,
        sent: 0,
        expired: 0,
      },
      digestAutomation: defaultDigestAutomationSummary(),
      subscribers: [],
      routes: [],
      newDeals: [],
      newDealSeries: [],
      scannerHealth: defaultScannerHealthSummary(),
      automatedAlerts: defaultOpsAutomatedAlertsSummary(),
      recentSnapshots: [],
      sendQueue: [],
      recentCampaigns: [],
    };
  }

  if (dealHistorySnapshotsQuery.error) {
    const message = formatError(dealHistorySnapshotsQuery.error);
    return {
      configured: true,
      schemaReady: false,
      onboardingMessage: isMissingTableError(message)
        ? "Supabase is reachable, but the latest tables are not created yet. Re-run supabase/schema.sql and then supabase/seed.sql in the SQL Editor."
        : `Supabase responded with an error: ${message}`,
      metrics: {
        subscribers: 0,
        activeRoutes: 0,
        newDeals: 0,
        snapshots24h: 0,
      },
      dealStateCounts: {
        new: 0,
        reviewed: 0,
        sent: 0,
        expired: 0,
      },
      digestAutomation: defaultDigestAutomationSummary(),
      subscribers: [],
      routes: [],
      newDeals: [],
      newDealSeries: [],
      scannerHealth: defaultScannerHealthSummary(),
      automatedAlerts: defaultOpsAutomatedAlertsSummary(),
      recentSnapshots: [],
      sendQueue: [],
      recentCampaigns: [],
    };
  }

  if (newDealSeriesSnapshotsQuery.error) {
    const message = formatError(newDealSeriesSnapshotsQuery.error);
    return {
      configured: true,
      schemaReady: false,
      onboardingMessage: isMissingTableError(message)
        ? "Supabase is reachable, but the latest tables are not created yet. Re-run supabase/schema.sql and then supabase/seed.sql in the SQL Editor."
        : `Supabase responded with an error: ${message}`,
      metrics: {
        subscribers: 0,
        activeRoutes: 0,
        newDeals: 0,
        snapshots24h: 0,
      },
      dealStateCounts: {
        new: 0,
        reviewed: 0,
        sent: 0,
        expired: 0,
      },
      digestAutomation: defaultDigestAutomationSummary(),
      subscribers: [],
      routes: [],
      newDeals: [],
      newDealSeries: [],
      scannerHealth: defaultScannerHealthSummary(),
      automatedAlerts: defaultOpsAutomatedAlertsSummary(),
      recentSnapshots: [],
      sendQueue: [],
      recentCampaigns: [],
    };
  }

  const routes = (routesQuery.data ?? []) as RouteRow[];
  const activeRouteIds = routes
    .filter((route) => route.is_active)
    .map((route) => route.id);
  const today = new Date();
  const scannerHealthWindowStart = new Date(today);
  scannerHealthWindowStart.setDate(
    scannerHealthWindowStart.getDate() + SCANNER_HEALTH_LOOKAHEAD_START_DAYS,
  );
  const scannerHealthWindowEnd = new Date(today);
  scannerHealthWindowEnd.setDate(
    scannerHealthWindowEnd.getDate() + SCANNER_HEALTH_LOOKAHEAD_END_DAYS,
  );
  const scannerHealthMonthStartFrom = new Date(
    scannerHealthWindowStart.getFullYear(),
    scannerHealthWindowStart.getMonth(),
    1,
  )
    .toISOString()
    .slice(0, 10);
  const scannerHealthMonthStartTo = new Date(
    scannerHealthWindowEnd.getFullYear(),
    scannerHealthWindowEnd.getMonth(),
    1,
  )
    .toISOString()
    .slice(0, 10);
  const [scannerHealthServiceMonthsQuery, scannerHealthRulesQuery] =
    activeRouteIds.length === 0
      ? [
          { data: [] as ScannerHealthServiceMonthRow[], error: null },
          { data: [] as ScannerHealthRuleRow[], error: null },
        ]
      : await Promise.all([
          supabase
            .from("route_service_months")
            .select(
              "route_id,month_start,routing,departure_dates,departure_weekdays,last_checked_at",
            )
            .in("route_id", activeRouteIds)
            .gte("month_start", scannerHealthMonthStartFrom)
            .lte("month_start", scannerHealthMonthStartTo)
            .order("month_start"),
          supabase
            .from("route_search_rules")
            .select(
              "route_id,month_start,pattern_label,departure_weekday,return_weekday,trip_nights,max_stops,sort_order,is_active",
            )
            .in("route_id", activeRouteIds)
            .gte("month_start", scannerHealthMonthStartFrom)
            .lte("month_start", scannerHealthMonthStartTo)
            .order("month_start")
            .order("sort_order"),
        ]);
  const scannerHealthContextErrors = [
    scannerHealthServiceMonthsQuery.error
      ? formatError(scannerHealthServiceMonthsQuery.error)
      : null,
    scannerHealthRulesQuery.error
      ? formatError(scannerHealthRulesQuery.error)
      : null,
  ].filter(Boolean) as string[];
  if (scannerHealthContextErrors.length > 0) {
    const message = scannerHealthContextErrors[0];
    return {
      configured: true,
      schemaReady: false,
      onboardingMessage: isMissingTableError(message)
        ? "Supabase is reachable, but the latest tables are not created yet. Re-run supabase/schema.sql and then supabase/seed.sql in the SQL Editor."
        : `Supabase responded with an error: ${message}`,
      metrics: {
        subscribers: 0,
        activeRoutes: 0,
        newDeals: 0,
        snapshots24h: 0,
      },
      dealStateCounts: {
        new: 0,
        reviewed: 0,
        sent: 0,
        expired: 0,
      },
      digestAutomation: defaultDigestAutomationSummary(),
      subscribers: [],
      routes: [],
      newDeals: [],
      newDealSeries: [],
      scannerHealth: defaultScannerHealthSummary(),
      automatedAlerts: defaultOpsAutomatedAlertsSummary(),
      recentSnapshots: [],
      sendQueue: [],
      recentCampaigns: [],
    };
  }
  const routeMap = buildRouteMap(routes);
  const dealSnapshotMap = new Map(
    ((dealSnapshotsQuery.data ?? []) as SnapshotRow[]).map((snapshot) => [
      snapshot.id,
      snapshot,
    ]),
  );
  const baselineSeriesStartMap = new Map<string, string>();
  for (const snapshot of (dealHistorySnapshotsQuery.data ?? []) as Array<
    Pick<SnapshotRow, "route_id" | "metadata" | "scanned_at">
  >) {
    const patternKey = extractPatternKey(snapshot.metadata);
    if (!patternKey) {
      continue;
    }

    const seriesKey = buildSeriesKey(snapshot.route_id, patternKey);
    baselineSeriesStartMap.set(seriesKey, snapshot.scanned_at);
  }
  const subscriberSummaries = buildSubscriberSummaries(
    (subscribersQuery.data ?? []) as SubscriberRow[],
    (preferencesQuery.data ?? []) as SubscriberPreferenceRow[],
    (routePreferencesQuery.data ?? []) as SubscriberRoutePreferenceRow[],
    (customAlertRulesQuery.data ?? []) as SubscriberCustomAlertRow[],
  );

  const newDeals = enrichDeals(
    newDealRows,
    routeMap,
    dealSnapshotMap,
    baselineSeriesStartMap,
  );
  const reviewedDeals = enrichDeals(
    reviewedDealRows,
    routeMap,
    dealSnapshotMap,
    baselineSeriesStartMap,
  );
  const newDealSeriesKeys = new Set(
    newDeals
      .map((deal) =>
        deal.patternKey ? buildSeriesKey(deal.routeId, deal.patternKey) : null,
      )
      .filter((value): value is string => Boolean(value)),
  );
  const newDealSeries = buildPriceSeries(
    (newDealSeriesSnapshotsQuery.data ?? []) as SnapshotRow[],
    routeMap,
  ).filter((series) => newDealSeriesKeys.has(series.seriesKey));

  const activeAudience = subscriberSummaries.filter(
    (subscriber) =>
      subscriber.status === "active" &&
      subscriber.onboardingCompleted &&
      subscriber.emailConfirmed,
  );
  const automationSettings =
    (automationQuery.data as AutomationSettingsRow | null) ?? null;
  const siteUrl = getSiteUrl();
  const digestAutomation: DigestAutomationSummary = automationSettings
    ? {
        enabled: automationSettings.daily_digest_enabled,
        weeklyEnabled: automationSettings.weekly_digest_enabled,
        lastWeeklySentOn: automationSettings.last_weekly_sent_on,
        localTime: formatTimeParts(
          automationSettings.daily_digest_hour,
          automationSettings.daily_digest_minute,
        ),
        testEmail:
          automationSettings.test_email ??
          process.env.RESEND_REPLY_TO_EMAIL ??
          null,
        lastDigestSentOn: automationSettings.last_digest_sent_on,
        endpointReady: hasCronSecret() && !siteUrl.includes("localhost"),
        blockedReason: !hasCronSecret()
          ? "Add CRON_SECRET to the deployed app and GitHub Actions before automatic digests can run."
          : siteUrl.includes("localhost")
            ? "NEXT_PUBLIC_SITE_URL still points to localhost, so the GitHub workflow has nowhere public to call."
            : null,
      }
    : defaultDigestAutomationSummary();

  const sendQueue = campaignSendTypes
    .filter((sendType) => sendType !== "weekly")
    .map((sendType) =>
      buildCampaignPreview(
        sendType,
        reviewedDeals.filter((deal) => deal.sendType === sendType),
        activeAudience,
        digestAutomation.testEmail,
      ),
    );

  const weeklyModel = await loadCampaignModel("weekly");
  sendQueue.push(
    buildCampaignPreview(
      "weekly",
      weeklyModel.deals,
      weeklyModel.subscribers,
      digestAutomation.testEmail,
    ),
  );

  const recentSnapshots = enrichSnapshots(
    (recentSnapshotsQuery.data ?? []) as SnapshotRow[],
    routeMap,
  );
  const latestScannerIssuesByRoute = await readLatestScannerIssuesByRoute();
  const scannerHealth = buildScannerHealthSummary(
    routes,
    (scannerHealthSnapshotsQuery.data ?? []) as SnapshotRow[],
    (scannerHealthRunsQuery.data ?? []) as ScannerHealthRunRow[],
    routeMap,
    (scannerHealthServiceMonthsQuery.data ??
      []) as ScannerHealthServiceMonthRow[],
    (scannerHealthRulesQuery.data ?? []) as ScannerHealthRuleRow[],
    latestScannerIssuesByRoute,
  );
  const automatedAlerts = buildOpsAutomatedAlertsSummary(
    scannerHealth,
    latestScannerIssuesByRoute.syncFailures,
  );

  const recentCampaigns = (
    (recentCampaignsQuery.data ?? []) as EmailCampaignRow[]
  ).map((campaign) => ({
    id: campaign.id,
    sendType: campaign.send_type,
    status: campaign.status,
    subject: campaign.subject,
    recipientCount: campaign.recipient_count,
    sentCount: campaign.sent_count,
    failedCount: campaign.failed_count,
    createdAt: campaign.created_at,
    sentAt: campaign.sent_at,
    routeLabels: campaign.route_labels ?? [],
  }));

  return {
    configured: true,
    schemaReady: true,
    onboardingMessage: null,
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
    digestAutomation,
    subscribers: subscriberSummaries.map((subscriber) => ({
      id: subscriber.id,
      email: subscriber.email,
      source: subscriber.source,
      status: subscriber.status,
      createdAt: subscriber.createdAt,
      homeAirport: subscriber.homeAirport,
      managePreferencesPath: subscriber.managePreferencesPath,
      onboardingCompleted: subscriber.onboardingCompleted,
      emailConfirmed: subscriber.emailConfirmed,
      preferredLocale: subscriber.preferredLocale,
      deliveryModes: subscriber.deliveryModes,
      maxStopsPreferences: subscriber.maxStopsPreferences,
      departureWeekdays: subscriber.departureWeekdays,
      minTripNights: subscriber.minTripNights,
      maxTripNights: subscriber.maxTripNights,
      budgetCeilingEur: subscriber.budgetCeilingEur,
      earliestDepartureHour: subscriber.earliestDepartureHour,
      latestArrivalHour: subscriber.latestArrivalHour,
      minDestinationStayHours: subscriber.minDestinationStayHours,
      preferredBuckets: subscriber.preferredBuckets,
      selectedRouteLabels: subscriber.selectedRouteLabels,
      customAlertRules: subscriber.customAlertRules,
    })),
    routes: routes.map((route) => ({
      id: route.id,
      label: `${route.origin_airport} -> ${route.destination_airport} (${route.destination_city})`,
      bucket: formatStayBucketListLabel([
        deriveStayBucketFromNights(route.trip_nights),
      ]),
      tripNights: route.trip_nights,
      minTripNights: route.min_trip_nights,
      maxTripNights: route.max_trip_nights,
      maxStops: route.max_stops,
      isActive: route.is_active,
    })),
    newDeals,
    newDealSeries,
    scannerHealth,
    automatedAlerts,
    recentSnapshots,
    sendQueue,
    recentCampaigns,
  };
}

export async function sendOpsAutomatedAlertsEmail(
  input: { force?: boolean } = {},
) {
  if (!hasResendEnv()) {
    return {
      status: "skipped" as const,
      reason: "Add RESEND_API_KEY before sending ops alert emails.",
      email: OPS_ALERT_RECIPIENT_EMAIL,
    };
  }

  const dashboard = await getOpsDashboardData();
  const alerts = dashboard.automatedAlerts;

  if (alerts.items.length === 0) {
    return {
      status: "skipped" as const,
      reason: "No active ops alerts.",
      email: OPS_ALERT_RECIPIENT_EMAIL,
    };
  }

  const now = luxembourgParts(new Date());
  const rendered = buildOpsAlertEmail(alerts);
  const idempotencyKey = input.force
    ? `lux-ops-alert-force-${Date.now()}`
    : buildOpsAlertStateKey(alerts, now.date);
  const providerMessageId = await sendResendEmail({
    to: OPS_ALERT_RECIPIENT_EMAIL,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    emailType: "ops_alert",
    idempotencyKey,
  });

  return {
    status: "sent" as const,
    email: OPS_ALERT_RECIPIENT_EMAIL,
    providerMessageId,
    alertCount: alerts.total,
    criticalCount: alerts.critical,
    warningCount: alerts.warning,
  };
}
