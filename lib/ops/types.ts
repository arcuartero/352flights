import "server-only";
import { type EmailLocale } from "@/lib/email";
import {
  type CampaignPreviewDeal,
  type CampaignPreview,
  type CampaignSendType,
  type DealLifecycleState,
  type DigestAutomationSummary,
  type RecentCampaignSummary,
} from "@/lib/ops-shared";
import {
  type BucketValue,
  type DeliveryModeValue,
  type MaxStopsPreferenceValue,
  type WeekdayValue,
} from "@/lib/preferences-shared";

export type CountResult = {
  count: number;
  error: string | null;
};

export type SubscriberRow = {
  id: string;
  email: string;
  source: string;
  status: string;
  created_at: string;
  home_airport: string;
  onboarding_completed: boolean;
  preference_token: string;
  unsubscribe_token: string;
  email_confirmed: boolean;
  preferred_locale: string | null;
};

export type SubscriberPreferenceRow = {
  subscriber_id: string;
  preferred_buckets: string[] | null;
  max_stops_preference: MaxStopsPreferenceValue | null;
  max_stops_preferences: MaxStopsPreferenceValue[] | null;
  departure_weekdays: WeekdayValue[] | null;
  min_trip_nights: number | null;
  max_trip_nights: number | null;
  budget_ceiling_eur: number | null;
  earliest_departure_hour: number | null;
  latest_arrival_hour: number | null;
  min_destination_stay_hours: number | null;
  delivery_mode: DeliveryModeValue | null;
  delivery_modes: DeliveryModeValue[] | null;
};

export type SubscriberCustomAlertRow = {
  id: string;
  subscriber_id: string;
  name: string;
  destination_city: string | null;
  bucket: BucketValue | null;
  max_stops_preferences: MaxStopsPreferenceValue[] | null;
  budget_ceiling_eur: number | null;
  departure_weekdays: WeekdayValue[] | null;
  min_trip_nights: number | null;
  max_trip_nights: number | null;
  is_active: boolean;
  sort_order: number;
};

export type SubscriberRoutePreferenceRow = {
  subscriber_id: string;
  destination_airport: string;
  destination_city: string;
  bucket: string;
  is_enabled: boolean;
};

export type RouteRow = {
  id: string;
  origin_airport: string;
  destination_airport: string;
  destination_city: string;
  bucket: string;
  trip_nights: number;
  min_trip_nights: number | null;
  max_trip_nights: number | null;
  max_stops: string;
  is_active: boolean;
};

export type SnapshotRow = {
  id: number;
  route_id: string;
  scan_run_id?: string | null;
  price: number;
  currency: string;
  departure_date: string;
  return_date: string | null;
  trip_nights: number;
  max_stops: string;
  metadata: Record<string, unknown> | null;
  scanned_at: string;
};

export type DealRow = {
  id: string;
  route_id: string;
  snapshot_id: number;
  title: string;
  summary: string;
  deal_price: number;
  baseline_price: number | null;
  drop_ratio: number | null;
  score: number;
  send_type: CampaignSendType;
  status: string;
  created_at: string;
};

export type EmailCampaignRow = {
  id: string;
  send_type: CampaignSendType;
  subject: string;
  status: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  route_labels: string[] | null;
  created_at: string;
  sent_at: string | null;
};

export type AutomationSettingsRow = {
  id: string;
  daily_digest_enabled: boolean;
  weekly_digest_enabled: boolean;
  last_weekly_sent_on: string | null;
  daily_digest_hour: number;
  daily_digest_minute: number;
  test_email: string | null;
  last_digest_sent_on: string | null;
};

export type RouteSummary = {
  id: string;
  label: string;
  bucket: string;
  tripNights: number;
  minTripNights: number | null;
  maxTripNights: number | null;
  maxStops: string;
  isActive: boolean;
};

export type DealSummary = {
  id: string;
  routeId: string;
  title: string;
  summary: string;
  status: string;
  sendType: CampaignSendType;
  score: number;
  dealPrice: number;
  baselinePrice: number | null;
  dropRatio: number | null;
  createdAt: string;
  routeLabel: string;
  routeBucket: string;
  patternKey: string | null;
  patternLabel: string | null;
  destinationCity: string;
  destinationAirport: string;
  tripNights: number;
  maxStops: string;
  airlineNames: string[];
  airlineSummary: string | null;
  primaryAirlineCode: string | null;
  outboundStopCount: number | null;
  returnStopCount: number | null;
  bookingUrl: string | null;
  departureDate: string | null;
  returnDate: string | null;
  outboundDepartureAt: string | null;
  outboundArrivalAt: string | null;
  returnDepartureAt: string | null;
  returnArrivalAt: string | null;
  destinationStayHours: number | null;
  verifiedAt: string | null;
  baselineHistoryDays: number | null;
};

export type SupabaseReadResult<T> = {
  data: T | null;
  error: unknown;
};

export type ScannerHealthAlert = {
  routeId: string;
  routeLabel: string;
  destinationAirport: string;
  destinationCity: string;
  routeBucket: string;
  routeRouting: string;
  latestSeenAt: string | null;
  latestPrice: number | null;
  missedScanRuns: number;
  severity: "warning" | "critical";
  activeRuleCount: number;
  activeRuleLabels: string[];
  examplePatternLabel: string | null;
  exampleDepartureDate: string | null;
  exampleReturnDate: string | null;
  exampleBookingUrl: string | null;
  detectedDepartureSummary: string | null;
  datesScannerLastCheckedAt: string | null;
  latestScannerReasonCode: string | null;
  latestScannerReasonLabel: string | null;
  latestScannerReasonDetail: string | null;
  latestScannerReasonAt: string | null;
  likelyIssue:
    | "no_active_rules"
    | "no_detected_departures"
    | "no_matching_departures_for_rules"
    | "rules_and_dates_present_but_no_fresh_price";
};

export type ScannerHealthSummary = {
  latestRun: {
    id: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    routesPlanned: number;
    routesStarted: number;
    routesCompleted: number;
    foundPrices: number;
    errors: number;
  } | null;
  latestRunAt: string | null;
  previousRunAt: string | null;
  recentRunCount: number;
  activeRoutes: number;
  routesPlannedInLatestRun: number;
  routesSeenInLatestRun: number;
  routesMissingLatestRun: number;
  latestRunMissingRoutes: ScannerHealthAlert[];
  routesWithoutAnySnapshot: number;
  neverSnapshotRoutes: ScannerHealthAlert[];
  routesMissingData: number;
  criticalRoutes: number;
  healthyRoutes: number;
  alerts: ScannerHealthAlert[];
};

export type OpsAutomatedAlert = {
  id: string;
  kind: "scanner_not_running" | "route_without_price" | "sync_failure";
  severity: "warning" | "critical";
  title: string;
  summary: string;
  detail: string;
  detectedAt: string | null;
};

export type OpsAutomatedAlertsSummary = {
  generatedAt: string;
  total: number;
  critical: number;
  warning: number;
  items: OpsAutomatedAlert[];
};

export type ScannerHealthServiceMonthRow = {
  route_id: string;
  month_start: string;
  routing: string;
  departure_dates: string[] | null;
  departure_weekdays: string[] | null;
  last_checked_at: string | null;
};

export type ScannerHealthRuleRow = {
  route_id: string;
  month_start: string;
  pattern_label: string;
  departure_weekday: string;
  return_weekday: string;
  trip_nights: number;
  max_stops: string;
  sort_order: number;
  is_active: boolean;
};

export type ScannerHealthRunRow = {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  routes_planned: number;
  routes_started: number;
  routes_completed: number;
  found_prices: number;
  timed_out: number;
  network_outages: number;
  hard_errors: number;
  routes: unknown;
};

export type ScannerHealthLoggedIssue = {
  code: string;
  label: string;
  detail: string;
  at: string;
};

export type ScannerSyncFailure = {
  at: string;
  detail: string;
  source: "live_sync_log" | "final_sync_report";
};

export type SnapshotSummary = {
  id: number;
  routeLabel: string;
  routeBucket: string;
  patternKey: string | null;
  patternLabel: string | null;
  destinationCity: string;
  destinationAirport: string;
  tripNights: number;
  maxStops: string;
  airlineNames: string[];
  airlineSummary: string | null;
  bookingUrl: string | null;
  price: number;
  currency: string;
  departureDate: string;
  returnDate: string | null;
  outboundDepartureAt: string | null;
  outboundArrivalAt: string | null;
  returnDepartureAt: string | null;
  returnArrivalAt: string | null;
  destinationStayHours: number | null;
  scannedAt: string;
};

export type SubscriberSummary = {
  id: string;
  email: string;
  source: string;
  status: string;
  createdAt: string;
  homeAirport: string;
  managePreferencesPath: string;
  onboardingCompleted: boolean;
  emailConfirmed: boolean;
  preferredLocale: EmailLocale;
  deliveryModes: DeliveryModeValue[];
  maxStopsPreferences: MaxStopsPreferenceValue[];
  departureWeekdays: WeekdayValue[];
  minTripNights: number | null;
  maxTripNights: number | null;
  budgetCeilingEur: number | null;
  earliestDepartureHour: number | null;
  latestArrivalHour: number | null;
  minDestinationStayHours: number | null;
  preferredBuckets: string[];
  selectedRouteLabels: string[];
  customAlertRules: Array<{
    id: string;
    name: string;
    destinationCity: string | null;
    bucket: BucketValue | null;
    maxStopsPreferences: MaxStopsPreferenceValue[];
    budgetCeilingEur: number | null;
    departureWeekdays: WeekdayValue[];
    minTripNights: number | null;
    maxTripNights: number | null;
    isActive: boolean;
  }>;
};

export type AudienceMember = SubscriberSummary & {
  preferenceToken: string;
  unsubscribeToken: string;
  selectedRouteKeys: Set<string>;
};

export type MatchedRecipient = {
  subscriber: AudienceMember;
  deals: DealSummary[];
};

export type OpsDashboardData = {
  configured: boolean;
  schemaReady: boolean;
  onboardingMessage: string | null;
  metrics: {
    subscribers: number;
    activeRoutes: number;
    newDeals: number;
    snapshots24h: number;
  };
  dealStateCounts: Record<DealLifecycleState, number>;
  digestAutomation: DigestAutomationSummary;
  scannerHealth: ScannerHealthSummary;
  automatedAlerts: OpsAutomatedAlertsSummary;
  subscribers: SubscriberSummary[];
  routes: RouteSummary[];
  newDeals: DealSummary[];
  newDealSeries: OpsPriceSeries[];
  recentSnapshots: SnapshotSummary[];
  sendQueue: CampaignPreview[];
  recentCampaigns: RecentCampaignSummary[];
};

export type OpsSummaryData = {
  configured: boolean;
  schemaReady: boolean;
  onboardingMessage: string | null;
  metrics: OpsDashboardData["metrics"];
  dealStateCounts: OpsDashboardData["dealStateCounts"];
  verificationErrors: {
    subscribers: string | null;
    activeRoutes: string | null;
    newDeals: string | null;
    reviewedDeals: string | null;
    sentDeals: string | null;
    expiredDeals: string | null;
    snapshots24h: string | null;
  };
};

export type OpsSubscribersData = {
  configured: boolean;
  schemaReady: boolean;
  onboardingMessage: string | null;
  subscribers: SubscriberSummary[];
};

export type OpsScannerData = {
  configured: boolean;
  schemaReady: boolean;
  onboardingMessage: string | null;
  scannerHealth: ScannerHealthSummary;
  automatedAlerts: OpsAutomatedAlertsSummary;
};

export type OpsRecentSnapshotsData = {
  configured: boolean;
  schemaReady: boolean;
  onboardingMessage: string | null;
  snapshots: SnapshotSummary[];
};

export type OpsEmailCampaignsData = {
  configured: boolean;
  schemaReady: boolean;
  onboardingMessage: string | null;
  digestAutomation: DigestAutomationSummary;
  sendQueue: CampaignPreview[];
  subscribers: SubscriberSummary[];
  recentCampaigns: RecentCampaignSummary[];
};

export type OpsReviewQueueData = {
  configured: boolean;
  schemaReady: boolean;
  onboardingMessage: string | null;
  deals: DealSummary[];
  totalDeals: number | null;
  totalDealsError: string | null;
  page: number;
  pageSize: number;
};

export type OpsDealPriceSeriesData = {
  series: OpsPriceSeries | null;
  error: string | null;
};

export type PublicDealsPageData = {
  configured: boolean;
  schemaReady: boolean;
  onboardingMessage: string | null;
  deals: CampaignPreviewDeal[];
  sections: Array<{
    key:
      | "best_short_trips_this_week"
      | "best_long_trips_this_week"
      | "lux_school_holidays";
    label: string;
    description: string;
    items: CampaignPreviewDeal[];
  }>;
  updatedAt: string | null;
};

export type OpsPricePoint = {
  id: number;
  seriesKey: string;
  routeId: string;
  routeLabel: string;
  routeBucket: string;
  patternKey: string | null;
  patternLabel: string | null;
  destinationCity: string;
  destinationAirport: string;
  tripNights: number;
  routeTripNights: number;
  routeMinTripNights: number | null;
  routeMaxTripNights: number | null;
  maxStops: string;
  airlineNames: string[];
  airlineSummary: string | null;
  bookingUrl: string | null;
  price: number;
  currency: string;
  departureDate: string;
  returnDate: string | null;
  outboundDepartureAt: string | null;
  outboundArrivalAt: string | null;
  returnDepartureAt: string | null;
  returnArrivalAt: string | null;
  destinationStayHours: number | null;
  scannedAt: string;
};

export type OpsPriceSeries = {
  seriesKey: string;
  routeId: string;
  routeLabel: string;
  routeBucket: string;
  patternKey: string | null;
  patternLabel: string | null;
  destinationCity: string;
  destinationAirport: string;
  routeTripNights: number;
  routeMinTripNights: number | null;
  routeMaxTripNights: number | null;
  latestTripNights: number | null;
  maxStops: string;
  latestAirlineSummary: string | null;
  latestBookingUrl: string | null;
  latestPrice: number | null;
  previousPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  latestDepartureDate: string | null;
  latestReturnDate: string | null;
  latestOutboundDepartureAt: string | null;
  latestOutboundArrivalAt: string | null;
  latestReturnDepartureAt: string | null;
  latestReturnArrivalAt: string | null;
  latestDestinationStayHours: number | null;
  latestScannedAt: string | null;
  points: OpsPricePoint[];
};

export type OpsPriceIntelligenceData = {
  configured: boolean;
  schemaReady: boolean;
  onboardingMessage: string | null;
  scannerNote: string;
  totals: {
    routesTracked: number;
    snapshotsLoaded: number;
    latestSnapshotAt: string | null;
    liveLowestPrice: number | null;
    liveLowestRouteLabel: string | null;
  };
  series: OpsPriceSeries[];
  tableRows: OpsPricePoint[];
};

export type ScannerHealthRun = {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  latestAt: string;
  routesPlanned: number;
  routesStarted: number;
  routesCompleted: number;
  foundPrices: number;
  errors: number;
  routeOutcomes: Map<
    string,
    {
      started: boolean;
      completed: boolean;
      foundPrices: number;
    }
  >;
};
