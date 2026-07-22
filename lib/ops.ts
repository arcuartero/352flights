import "server-only";

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { unstable_cache } from "next/cache";

import { formatAirlineSummary, normalizeAirlineNames } from "@/lib/airline-summary";
import { matchesDestinationSlug } from "@/lib/destination-slugs";
import {
  buildEditorialSections,
  getPrimaryEditorialSection,
} from "@/lib/editorial-sections";
import { getCronSecret, getSiteUrl, hasCronSecret, hasResendEnv } from "@/lib/env";
import {
  buildCampaignPreviewText,
  buildCampaignSubject,
  normalizeEmailLocale,
  renderCampaignEmail,
  sendResendEmail,
  type EmailLocale,
} from "@/lib/email";
import {
  campaignSendTypes,
  type CampaignPreviewDeal,
  type CampaignPreview,
  type CampaignSendType,
  type DealLifecycleState,
  type DigestAutomationSummary,
  type FarePricePosition,
  type RecentCampaignSummary,
} from "@/lib/ops-shared";
import {
  type BucketValue,
  type DeliveryModeValue,
  defaultPreferenceValues,
  type MaxStopsPreferenceValue,
  normalizeBucketValue,
  type WeekdayValue,
} from "@/lib/preferences-shared";
import {
  deriveStayBucketFromNights,
  formatStayBucketListLabel,
} from "@/lib/stay-buckets";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { getMatchingLuxSchoolHoliday } from "@/lib/lux-school-holidays";

const DEAL_AUTO_EXPIRE_DAYS = 4;
const PUBLIC_FARE_LOOKBACK_DAYS = 14;
const PUBLIC_FARES_PER_DESTINATION = 3;
const PUBLIC_ALL_FARES_PER_DESTINATION = null;
const PUBLIC_FARE_MIN_HISTORY_POINTS = 3;
const PUBLIC_FARE_HISTORY_LIMIT = 45;
const SUPABASE_READ_RETRY_DELAYS_MS = [200, 700] as const;
const EDITORIAL_DEAL_MAX_DROP_RATIO = 0.85;
const PUBLIC_EXCEPTIONAL_PRICE_RATIO = 0.85;
const PUBLIC_BELOW_USUAL_PRICE_RATIO = 0.95;
const PUBLIC_TYPICAL_PRICE_RATIO = 1.05;

type CountResult = {
  count: number;
  error: string | null;
};

type SubscriberRow = {
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

type SubscriberPreferenceRow = {
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

type SubscriberCustomAlertRow = {
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

type SubscriberRoutePreferenceRow = {
  subscriber_id: string;
  destination_airport: string;
  destination_city: string;
  bucket: string;
  is_enabled: boolean;
};

type RouteRow = {
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

type SnapshotRow = {
  id: number;
  route_id: string;
  price: number;
  currency: string;
  departure_date: string;
  return_date: string | null;
  trip_nights: number;
  max_stops: string;
  metadata: Record<string, unknown> | null;
  scanned_at: string;
};

type DealRow = {
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

type EmailCampaignRow = {
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

type AutomationSettingsRow = {
  id: string;
  daily_digest_enabled: boolean;
  daily_digest_hour: number;
  daily_digest_minute: number;
  test_email: string | null;
  last_digest_sent_on: string | null;
};

type RouteSummary = {
  id: string;
  label: string;
  bucket: string;
  tripNights: number;
  minTripNights: number | null;
  maxTripNights: number | null;
  maxStops: string;
  isActive: boolean;
};

type DealSummary = {
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

async function autoExpireStaleDeals() {
  const supabase = getSupabaseAdminClient();
  const cutoffIso = new Date(Date.now() - DEAL_AUTO_EXPIRE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("deal_candidates")
    .update({
      status: "expired",
      reviewed_at: null,
    })
    .in("status", ["new", "reviewed"])
    .lt("created_at", cutoffIso);

  if (error) {
    throw new Error(formatError(error));
  }
}

async function fetchPagedSnapshots<T extends Record<string, unknown>>(
  buildPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const query = await readSupabaseWithRetry(() =>
      buildPage(from, from + pageSize - 1),
    );
    if (query.error) {
      return {
        data: [] as T[],
        error: formatError(query.error),
      };
    }

    const pageRows = (query.data ?? []) as T[];
    rows.push(...pageRows);

    if (pageRows.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return {
    data: rows,
    error: null as string | null,
  };
}

type SupabaseReadResult<T> = {
  data: T | null;
  error: unknown;
};

function isTransientSupabaseReadError(error: unknown) {
  const message = formatError(error).toLowerCase();
  return [
    "fetch failed",
    "failed to fetch",
    "network",
    "timeout",
    "timed out",
    "econnreset",
    "socket",
    "connection",
    "terminated",
    "und_err",
  ].some((fragment) => message.includes(fragment));
}

function waitForRetry(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function readSupabaseWithRetry<T>(
  buildQuery: () => PromiseLike<SupabaseReadResult<T>>,
): Promise<SupabaseReadResult<T>> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= SUPABASE_READ_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const result = await buildQuery();
      if (!result.error) {
        return result;
      }
      lastError = result.error;
    } catch (error) {
      lastError = error;
    }

    const retryDelay = SUPABASE_READ_RETRY_DELAYS_MS[attempt];
    if (retryDelay === undefined || !isTransientSupabaseReadError(lastError)) {
      break;
    }
    await waitForRetry(retryDelay);
  }

  return {
    data: null,
    error: lastError,
  };
}

type ScannerHealthAlert = {
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

type ScannerHealthSummary = {
  latestRunAt: string | null;
  previousRunAt: string | null;
  recentRunCount: number;
  activeRoutes: number;
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

type OpsAutomatedAlert = {
  id: string;
  kind: "scanner_not_running" | "route_without_price" | "sync_failure";
  severity: "warning" | "critical";
  title: string;
  summary: string;
  detail: string;
  detectedAt: string | null;
};

type OpsAutomatedAlertsSummary = {
  generatedAt: string;
  total: number;
  critical: number;
  warning: number;
  items: OpsAutomatedAlert[];
};

type ScannerHealthServiceMonthRow = {
  route_id: string;
  month_start: string;
  routing: string;
  departure_dates: string[] | null;
  departure_weekdays: string[] | null;
  last_checked_at: string | null;
};

type ScannerHealthRuleRow = {
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

type ScannerHealthLoggedIssue = {
  code: string;
  label: string;
  detail: string;
  at: string;
};

type ScannerSyncFailure = {
  at: string;
  detail: string;
  source: "live_sync_log" | "final_sync_report";
};

const SCANNER_HEALTH_LOG_META_MARKER = " ||meta|| ";

type SnapshotSummary = {
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

type SubscriberSummary = {
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

type AudienceMember = SubscriberSummary & {
  preferenceToken: string;
  unsubscribeToken: string;
  selectedRouteKeys: Set<string>;
};

type MatchedRecipient = {
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

type ScannerHealthRun = {
  latestAt: string;
  routeIds: Set<string>;
};

function formatError(error: unknown) {
  if (typeof error === "string") {
    const trimmed = error.trim();
    return trimmed.length > 0 ? trimmed : "Unknown error";
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    return message.length > 0 ? message : "Unknown error";
  }

  if (!error || typeof error !== "object") {
    return "Unknown error";
  }

  if ("message" in error && typeof error.message === "string") {
    const message = error.message.trim();
    return message.length > 0 ? message : "Unknown error";
  }

  return "Unknown error";
}

function isMissingTableError(message: string) {
  return message.includes("schema cache") || message.includes("does not exist");
}

function makeRouteKey(destinationAirport: string, _bucket?: string | null) {
  return destinationAirport;
}

function normalizeDeliveryModes(
  values: DeliveryModeValue[] | null | undefined,
  legacyValue: DeliveryModeValue | null | undefined,
) {
  if (values && values.length > 0) {
    return unique(values);
  }

  if (legacyValue) {
    return [legacyValue];
  }

  return [...defaultPreferenceValues.deliveryModes];
}

function normalizeMaxStopsPreferences(
  values: MaxStopsPreferenceValue[] | null | undefined,
  legacyValue: MaxStopsPreferenceValue | null | undefined,
) {
  if (values && values.length > 0) {
    return unique(values);
  }

  if (legacyValue) {
    return [legacyValue];
  }

  return [...defaultPreferenceValues.maxStopsPreferences];
}

function normalizeDepartureWeekdays(
  values: WeekdayValue[] | null | undefined,
) {
  if (values && values.length > 0) {
    return unique(values);
  }

  return [...defaultPreferenceValues.departureWeekdays];
}

function normalizeComfortHour(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (value < 0 || value > 23) {
    return null;
  }

  return Math.trunc(value);
}

function normalizeMinDestinationStayHours(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (value <= 0 || value > 336) {
    return null;
  }

  return Math.trunc(value);
}

function unique<T>(values: T[]) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function weekdayForDate(value: string | null) {
  if (!value) {
    return null;
  }

  const day = new Date(`${value}T00:00:00Z`).getUTCDay();
  const mapping: WeekdayValue[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return mapping[day] ?? null;
}

function luxembourgParts(value: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Luxembourg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");

  return {
    date: `${year}-${month}-${day}`,
    hour: Number(hour),
    minute: Number(minute),
    time: `${hour}:${minute}`,
  };
}

function formatTimeParts(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeToMinutes(value: string) {
  const [hourString, minuteString] = value.split(":");
  return Number(hourString) * 60 + Number(minuteString);
}

function defaultDigestAutomationSummary(): DigestAutomationSummary {
  const siteUrl = getSiteUrl();
  return {
    enabled: false,
    localTime: "09:05",
    testEmail: process.env.RESEND_REPLY_TO_EMAIL ?? null,
    lastDigestSentOn: null,
    endpointReady: hasCronSecret() && !siteUrl.includes("localhost"),
    blockedReason: !hasCronSecret()
      ? "Add CRON_SECRET to the deployed app and GitHub Actions before automatic digests can run."
      : siteUrl.includes("localhost")
        ? "NEXT_PUBLIC_SITE_URL still points to localhost, so the GitHub workflow has nowhere public to call."
        : null,
  };
}

function defaultScannerHealthSummary(): ScannerHealthSummary {
  return {
    latestRunAt: null,
    previousRunAt: null,
    recentRunCount: 0,
    activeRoutes: 0,
    routesSeenInLatestRun: 0,
    routesMissingLatestRun: 0,
    latestRunMissingRoutes: [],
    routesWithoutAnySnapshot: 0,
    neverSnapshotRoutes: [],
    routesMissingData: 0,
    criticalRoutes: 0,
    healthyRoutes: 0,
    alerts: [],
  };
}

function defaultOpsAutomatedAlertsSummary(): OpsAutomatedAlertsSummary {
  return {
    generatedAt: new Date().toISOString(),
    total: 0,
    critical: 0,
    warning: 0,
    items: [],
  };
}

function extractAirlineNames(metadata: Record<string, unknown> | null | undefined) {
  return normalizeAirlineNames(metadata?.["airline_names"]);
}

function extractPrimaryAirlineCode(metadata: Record<string, unknown> | null | undefined) {
  const directCode = metadata?.["primary_airline_code"];
  const airlineCodes = metadata?.["airline_codes"];
  const candidate =
    typeof directCode === "string"
      ? directCode
      : Array.isArray(airlineCodes)
        ? airlineCodes.find((value): value is string => typeof value === "string")
        : null;
  const normalized = candidate?.trim().toUpperCase() ?? "";

  return /^[A-Z0-9]{2,3}$/.test(normalized) ? normalized : null;
}

function extractPatternKey(metadata: Record<string, unknown> | null | undefined) {
  const value = metadata?.["pattern_key"];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function extractPatternLabel(metadata: Record<string, unknown> | null | undefined) {
  const value = metadata?.["pattern_label"];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function extractMetadataDateTime(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function extractDestinationStayHours(metadata: Record<string, unknown> | null | undefined) {
  const value = metadata?.["destination_stay_hours"];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function hasShortDestinationStay(metadata: Record<string, unknown> | null | undefined) {
  const stayHours = extractDestinationStayHours(metadata);
  return stayHours !== null && stayHours < 24;
}

function extractMetadataNumber(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = metadata?.[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function extractStopCount(
  metadata: Record<string, unknown> | null | undefined,
  key: "outbound_stop_count" | "return_stop_count",
) {
  const value = extractMetadataNumber(metadata, key);
  return value !== null && value >= 0 ? Math.trunc(value) : null;
}

function medianPrice(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function classifyFarePrice(
  dropRatio: number | null,
  historyPoints: number,
): FarePricePosition {
  if (historyPoints < PUBLIC_FARE_MIN_HISTORY_POINTS || dropRatio === null) {
    return "new_price";
  }

  if (dropRatio <= PUBLIC_EXCEPTIONAL_PRICE_RATIO) {
    return "exceptional";
  }

  if (dropRatio <= PUBLIC_BELOW_USUAL_PRICE_RATIO) {
    return "below_usual";
  }

  if (dropRatio <= PUBLIC_TYPICAL_PRICE_RATIO) {
    return "typical";
  }

  return "above_usual";
}

function buildSeriesKey(routeId: string, patternKey: string | null) {
  return `${routeId}:${patternKey ?? "legacy"}`;
}

function formatDisplayRouteLabel(routeLabel: string, patternLabel: string | null) {
  return patternLabel ? `${routeLabel} · ${patternLabel}` : routeLabel;
}

function formatSkyscannerDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${year.slice(2)}${month}${day}`;
}

function toSkyscannerPlace(code: string) {
  const cityOverrides: Record<string, string> = {
    LHR: "lond",
    LGW: "lond",
  };

  return cityOverrides[code.toUpperCase()] ?? code.toLowerCase();
}

function buildSkyscannerUrl(input: {
  originAirport: string | null | undefined;
  destinationAirport: string | null | undefined;
  departureDate: string | null | undefined;
  returnDate: string | null | undefined;
  maxStops: string;
}) {
  if (!input.originAirport || !input.destinationAirport || !input.departureDate || !input.returnDate) {
    return null;
  }

  const params = new URLSearchParams({
    adultsv2: "1",
    cabinclass: "economy",
    childrenv2: "",
    ref: "home",
    rtn: "1",
    outboundaltsenabled: "false",
    inboundaltsenabled: "false",
    preferdirects: String(input.maxStops === "NON_STOP"),
  });

  if (input.maxStops === "NON_STOP") {
    params.set("stops", "!oneStop,!twoPlusStops");
  } else if (input.maxStops === "ONE_STOP_OR_FEWER") {
    params.set("stops", "!twoPlusStops");
  }

  return [
    "https://www.skyscanner.net/transport/vols",
    toSkyscannerPlace(input.originAirport),
    toSkyscannerPlace(input.destinationAirport),
    formatSkyscannerDate(input.departureDate),
    formatSkyscannerDate(input.returnDate),
  ].join("/") + `/?${params.toString()}`;
}

const SCANNER_HEALTH_LOOKAHEAD_START_DAYS = 14;
const SCANNER_HEALTH_LOOKAHEAD_END_DAYS = 180;
const OPS_SCANNER_STALE_WARNING_HOURS = 30;
const OPS_SCANNER_STALE_CRITICAL_HOURS = 48;
const OPS_SYNC_FAILURE_LOOKBACK_HOURS = 24;
const OPS_ALERT_RECIPIENT_EMAIL = "arcuartero@gmail.com";
const HEALTH_WEEKDAY_CODES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

function parseIsoDateUtc(value: string) {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatIsoDateUtc(value: Date) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekdayCodeForIsoDate(value: string) {
  const parsed = parseIsoDateUtc(value);
  if (!parsed) {
    return null;
  }

  return HEALTH_WEEKDAY_CODES[parsed.getUTCDay()] ?? null;
}

function addDaysToIsoDate(value: string, days: number) {
  const parsed = parseIsoDateUtc(value);
  if (!parsed) {
    return null;
  }

  parsed.setUTCDate(parsed.getUTCDate() + days);
  return formatIsoDateUtc(parsed);
}

async function pathExists(targetPath: string) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readTextIfExists(targetPath: string) {
  if (!(await pathExists(targetPath))) {
    return "";
  }

  return readFile(targetPath, "utf-8");
}

function parseScannerHealthLogTimestamp(raw: string) {
  const match = raw.match(/^\[(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(Z?)\]\s*(.*)$/);
  if (!match) {
    return null;
  }

  const [, calendarDate, clockTime, utcSuffix, message] = match;
  const parsed = new Date(
    utcSuffix === "Z" ? `${calendarDate}T${clockTime}Z` : `${calendarDate}T${clockTime}`,
  );
  const timestampMs = parsed.getTime();
  if (!Number.isFinite(timestampMs)) {
    return null;
  }

  return {
    timestampIso: parsed.toISOString(),
    timestampMs,
    message,
  };
}

function parseScannerHealthLogEvents(contents: string) {
  return contents
    .split(/\r?\n/)
    .map((line) => parseScannerHealthLogTimestamp(line.trim()))
    .filter(Boolean) as Array<{
    timestampIso: string;
    timestampMs: number;
    message: string;
  }>;
}

function parseScannerHealthLogMeta(message: string) {
  const markerIndex = message.indexOf(SCANNER_HEALTH_LOG_META_MARKER);
  if (markerIndex === -1) {
    return { message, diagnostic: null };
  }

  const baseMessage = message.slice(0, markerIndex);
  const rawPayload = message.slice(markerIndex + SCANNER_HEALTH_LOG_META_MARKER.length);

  try {
    const payload = JSON.parse(rawPayload) as Record<string, unknown>;
    return {
      message: baseMessage,
      diagnostic: {
        routeLabel:
          typeof payload.route_label === "string" && payload.route_label.length > 0
            ? payload.route_label
            : null,
        routing:
          typeof payload.routing === "string" && payload.routing.length > 0
            ? payload.routing
            : null,
        reasonCode:
          typeof payload.reason_code === "string" && payload.reason_code.length > 0
            ? payload.reason_code
            : "unknown",
        reasonLabel:
          typeof payload.reason_label === "string" && payload.reason_label.length > 0
            ? payload.reason_label
            : "Unknown reason",
        reason:
          typeof payload.reason === "string" && payload.reason.length > 0
            ? payload.reason
            : "No reason recorded.",
      },
    };
  } catch {
    return {
      message: baseMessage,
      diagnostic: null,
    };
  }
}

function extractShortRouteLabelFromScannerMessage(message: string) {
  const match = message.match(/(?:\d+\/\d+\s+·\s+)?([A-Z]{3}\s*->\s*[A-Z]{3})\b/);
  return match ? match[1].replace(/\s+/g, " ").trim() : null;
}

function formatScannerHealthRouting(value: string) {
  if (value === "NON_STOP") {
    return "Non-stop only";
  }
  if (value === "ONE_STOP_OR_FEWER") {
    return "Up to 1 stop";
  }
  if (value === "TWO_OR_FEWER_STOPS") {
    return "Up to 2 stops";
  }
  return value;
}

function buildScannerHealthIssueKey(routeLabel: string, routing: string) {
  return `${routeLabel.replace(/\s+/g, " ").trim()}::${routing}`;
}

function hoursSince(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return Math.max(0, (Date.now() - timestamp) / (60 * 60 * 1000));
}

function formatAlertAge(hours: number) {
  if (hours < 1) {
    return "less than 1h ago";
  }

  if (hours < 48) {
    return `${Math.round(hours)}h ago`;
  }

  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function isWithinHours(value: string, hours: number) {
  const ageHours = hoursSince(value);
  return ageHours !== null && ageHours <= hours;
}

async function readRecentSyncReportFailures(logsDir: string): Promise<ScannerSyncFailure[]> {
  let entries: string[] = [];
  try {
    entries = await readdir(logsDir);
  } catch {
    return [];
  }

  const syncReports = entries
    .filter((entry) => /^(mac|vps)-sync-\d{8}T\d{6}Z\.json$/.test(entry))
    .sort()
    .slice(-8);
  const failures: ScannerSyncFailure[] = [];

  for (const reportFile of syncReports) {
    try {
      const raw = await readFile(path.join(logsDir, reportFile), "utf-8");
      const payload = JSON.parse(raw) as {
        generated_at?: unknown;
        errors?: unknown;
      };
      const generatedAt =
        typeof payload.generated_at === "string" && payload.generated_at.length > 0
          ? payload.generated_at
          : null;
      const errors = Array.isArray(payload.errors) ? payload.errors : [];
      if (!generatedAt || errors.length === 0 || !isWithinHours(generatedAt, OPS_SYNC_FAILURE_LOOKBACK_HOURS)) {
        continue;
      }

      const firstError = errors[0] as Record<string, unknown>;
      const errorDetail =
        typeof firstError.error === "string" && firstError.error.length > 0
          ? firstError.error
          : "Sync report contains errors.";
      failures.push({
        at: generatedAt,
        detail: `${reportFile}: ${errorDetail}`,
        source: "final_sync_report",
      });
    } catch {
      continue;
    }
  }

  return failures;
}

async function readLatestScannerIssuesByRoute() {
  const candidates = [
    process.cwd(),
    process.env.LOCAL_SCANNER_ROOT,
    path.join(os.homedir(), "Projects", "Luxcheapflights"),
    path.join(os.homedir(), "Documents", "Luxcheapflights"),
  ].filter(Boolean) as string[];

  let scannerRoot: string | null = null;
  for (const candidate of candidates) {
    if (await pathExists(path.join(candidate, "logs"))) {
      scannerRoot = candidate;
      break;
    }
  }

  if (!scannerRoot) {
    return {
      exact: new Map<string, ScannerHealthLoggedIssue>(),
      loose: new Map<string, ScannerHealthLoggedIssue>(),
      syncFailures: [],
    };
  }

  const logsDir = path.join(scannerRoot, "logs");
  const [stdoutContents, stderrContents] = await Promise.all([
    readTextIfExists(path.join(logsDir, "local-scanner.stdout.log")),
    readTextIfExists(path.join(logsDir, "local-scanner.stderr.log")),
  ]);
  const events = [...parseScannerHealthLogEvents(stdoutContents), ...parseScannerHealthLogEvents(stderrContents)].sort(
    (left, right) => left.timestampMs - right.timestampMs,
  );

  const exact = new Map<string, ScannerHealthLoggedIssue>();
  const loose = new Map<string, ScannerHealthLoggedIssue>();
  const syncFailures: ScannerSyncFailure[] = [];

  for (const event of events) {
    const parsed = parseScannerHealthLogMeta(event.message);
    if (
      (parsed.message.startsWith("Deal live sync failed: ") ||
        parsed.message.startsWith("Fare live sync failed: ")) &&
      isWithinHours(event.timestampIso, OPS_SYNC_FAILURE_LOOKBACK_HOURS)
    ) {
      syncFailures.push({
        at: event.timestampIso,
        detail: parsed.message
          .replace("Deal live sync failed: ", "")
          .replace("Fare live sync failed: ", ""),
        source: "live_sync_log",
      });
    }

    if (parsed.message.startsWith("Pattern no results: ")) {
      const routeLabel =
        parsed.diagnostic?.routeLabel ??
        extractShortRouteLabelFromScannerMessage(parsed.message.replace("Pattern no results: ", ""));
      const routing = parsed.diagnostic?.routing ?? null;
      if (!routeLabel) {
        continue;
      }

      const issue: ScannerHealthLoggedIssue = {
        code: parsed.diagnostic?.reasonCode ?? "unknown",
        label: parsed.diagnostic?.reasonLabel ?? "Unknown reason",
        detail: parsed.diagnostic?.reason ?? "No reason recorded.",
        at: event.timestampIso,
      };

      loose.set(routeLabel, issue);
      if (routing) {
        exact.set(buildScannerHealthIssueKey(routeLabel, routing), issue);
      }
      continue;
    }

    if (
      parsed.message.startsWith("Pattern timed out: ") ||
      parsed.message.startsWith("Pattern hard error: ") ||
      parsed.message.startsWith("Pattern error: ")
    ) {
      const trimmed = parsed.message
        .replace("Pattern timed out: ", "")
        .replace("Pattern hard error: ", "")
        .replace("Pattern error: ", "");
      const routeLabel = extractShortRouteLabelFromScannerMessage(trimmed);
      if (!routeLabel) {
        continue;
      }

      const isTimedOut = parsed.message.startsWith("Pattern timed out: ");
      loose.set(routeLabel, {
        code: isTimedOut ? "timed_out" : "hard_error",
        label: isTimedOut ? "Timed out" : "Hard error",
        detail: trimmed,
        at: event.timestampIso,
      });
    }
  }

  const reportSyncFailures = await readRecentSyncReportFailures(logsDir);
  syncFailures.push(...reportSyncFailures);
  syncFailures.sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime());

  return { exact, loose, syncFailures };
}

function summarizeDetectedDepartureMonths(rows: ScannerHealthServiceMonthRow[]) {
  const parts = rows
    .filter((row) => (row.departure_weekdays ?? []).length > 0)
    .slice(0, 3)
    .map((row) => {
      const monthLabel = new Intl.DateTimeFormat("en-GB", {
        month: "short",
      }).format(new Date(`${row.month_start}T00:00:00`));
      return `${monthLabel} ${(row.departure_weekdays ?? []).join("/")}`;
    });

  return parts.length > 0 ? parts.join(" · ") : null;
}

function buildScannerHealthSummary(
  routes: RouteRow[],
  snapshots: SnapshotRow[],
  routeMap: ReturnType<typeof buildRouteMap>,
  serviceMonths: ScannerHealthServiceMonthRow[],
  routeRules: ScannerHealthRuleRow[],
  latestIssuesByRoute: {
    exact: Map<string, ScannerHealthLoggedIssue>;
    loose: Map<string, ScannerHealthLoggedIssue>;
  },
): ScannerHealthSummary {
  const activeRoutes = routes.filter((route) => route.is_active);
  if (activeRoutes.length === 0) {
    return defaultScannerHealthSummary();
  }

  const filteredSnapshots = snapshots
    .filter((snapshot) => !hasShortDestinationStay(snapshot.metadata))
    .slice()
    .sort(
      (left, right) =>
        new Date(right.scanned_at).getTime() - new Date(left.scanned_at).getTime(),
    );

  const recentRuns: ScannerHealthRun[] = [];
  const runGapMs = 90 * 60 * 1000;
  let previousTimestamp: number | null = null;

  for (const snapshot of filteredSnapshots) {
    const currentTimestamp = new Date(snapshot.scanned_at).getTime();
    if (!Number.isFinite(currentTimestamp)) {
      continue;
    }

    const currentRun = recentRuns.at(-1);
    if (!currentRun || (previousTimestamp !== null && previousTimestamp - currentTimestamp > runGapMs)) {
      recentRuns.push({
        latestAt: snapshot.scanned_at,
        routeIds: new Set([snapshot.route_id]),
      });
    } else {
      currentRun.routeIds.add(snapshot.route_id);
    }

    previousTimestamp = currentTimestamp;
  }

  const runs = recentRuns.slice(0, 6);
  const latestSnapshotByRoute = new Map<string, SnapshotRow>();
  for (const snapshot of filteredSnapshots) {
    if (!latestSnapshotByRoute.has(snapshot.route_id)) {
      latestSnapshotByRoute.set(snapshot.route_id, snapshot);
    }
  }
  const routesWithoutAnySnapshot = activeRoutes.filter(
    (route) => !latestSnapshotByRoute.has(route.id),
  ).length;

  const today = new Date();
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() + SCANNER_HEALTH_LOOKAHEAD_START_DAYS);
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + SCANNER_HEALTH_LOOKAHEAD_END_DAYS);
  const monthStartFrom = new Date(windowStart.getFullYear(), windowStart.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const monthStartTo = new Date(windowEnd.getFullYear(), windowEnd.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const serviceMonthsByRoute = new Map<string, ScannerHealthServiceMonthRow[]>();
  for (const row of serviceMonths) {
    const current = serviceMonthsByRoute.get(row.route_id) ?? [];
    current.push(row);
    serviceMonthsByRoute.set(row.route_id, current);
  }

  const rulesByRoute = new Map<string, ScannerHealthRuleRow[]>();
  for (const row of routeRules) {
    if (!row.is_active) {
      continue;
    }
    const current = rulesByRoute.get(row.route_id) ?? [];
    current.push(row);
    rulesByRoute.set(row.route_id, current);
  }

  const compareScannerHealthRoutes = (left: ScannerHealthAlert, right: ScannerHealthAlert) => {
    if (left.severity !== right.severity) {
      return left.severity === "critical" ? -1 : 1;
    }

    if (right.missedScanRuns !== left.missedScanRuns) {
      return right.missedScanRuns - left.missedScanRuns;
    }

    if (left.latestSeenAt && right.latestSeenAt) {
      return new Date(left.latestSeenAt).getTime() - new Date(right.latestSeenAt).getTime();
    }

    if (left.latestSeenAt) {
      return 1;
    }

    if (right.latestSeenAt) {
      return -1;
    }

    return left.routeLabel.localeCompare(right.routeLabel);
  };

  const routeDiagnostics = activeRoutes.map((route) => {
    const latestSnapshot = latestSnapshotByRoute.get(route.id) ?? null;
    const firstSeenRunIndex = runs.findIndex((run) => run.routeIds.has(route.id));
    const missedScanRuns = firstSeenRunIndex === -1 ? runs.length : firstSeenRunIndex;

    const routeServiceMonths = (serviceMonthsByRoute.get(route.id) ?? [])
      .filter((row) => row.routing === route.max_stops)
      .filter((row) => row.month_start >= monthStartFrom && row.month_start <= monthStartTo)
      .sort((left, right) => left.month_start.localeCompare(right.month_start));
    const activeRulesForRoute = (rulesByRoute.get(route.id) ?? [])
      .filter((row) => row.max_stops === route.max_stops)
      .filter((row) => row.month_start >= monthStartFrom && row.month_start <= monthStartTo)
      .sort((left, right) =>
        left.month_start === right.month_start
          ? left.sort_order - right.sort_order
          : left.month_start.localeCompare(right.month_start),
      );

    let examplePatternLabel: string | null = null;
    let exampleDepartureDate: string | null = null;
    let exampleReturnDate: string | null = null;
    let exampleBookingUrl: string | null = null;

    for (const rule of activeRulesForRoute) {
      const month = routeServiceMonths.find((row) => row.month_start === rule.month_start);
      const departureDates = [...(month?.departure_dates ?? [])].sort();
      for (const departureDate of departureDates) {
        if (
          departureDate < windowStart.toISOString().slice(0, 10) ||
          departureDate > windowEnd.toISOString().slice(0, 10)
        ) {
          continue;
        }
        if (weekdayCodeForIsoDate(departureDate) !== rule.departure_weekday) {
          continue;
        }

        const returnDate = addDaysToIsoDate(departureDate, rule.trip_nights);
        if (!returnDate) {
          continue;
        }

        examplePatternLabel = rule.pattern_label;
        exampleDepartureDate = departureDate;
        exampleReturnDate = returnDate;
        exampleBookingUrl = buildSkyscannerUrl({
          originAirport: route.origin_airport,
          destinationAirport: route.destination_airport,
          departureDate,
          returnDate,
          maxStops: route.max_stops,
        });
        break;
      }
      if (exampleDepartureDate) {
        break;
      }
    }

    const datesScannerLastCheckedAt =
      routeServiceMonths
        .map((row) => row.last_checked_at)
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;

    const activeRuleLabels = unique(activeRulesForRoute.map((row) => row.pattern_label));
    const detectedDepartureSummary = summarizeDetectedDepartureMonths(routeServiceMonths);
    const hasDetectedDates = routeServiceMonths.some((row) => (row.departure_dates ?? []).length > 0);
    const routeShortLabel = `${route.origin_airport} -> ${route.destination_airport}`;
    const routeRoutingLabel = formatScannerHealthRouting(route.max_stops);
    const latestLoggedIssue =
      latestIssuesByRoute.exact.get(buildScannerHealthIssueKey(routeShortLabel, routeRoutingLabel)) ??
      latestIssuesByRoute.loose.get(routeShortLabel) ??
      null;
    const likelyIssue =
      activeRulesForRoute.length === 0
        ? "no_active_rules"
        : !hasDetectedDates
          ? "no_detected_departures"
          : !exampleDepartureDate
            ? "no_matching_departures_for_rules"
            : "rules_and_dates_present_but_no_fresh_price";

    return {
      routeId: route.id,
      routeLabel: routeMap.get(route.id)?.label ?? "Unknown route",
      destinationAirport: route.destination_airport,
      destinationCity: route.destination_city,
      routeBucket: deriveStayBucketFromNights(route.trip_nights),
      routeRouting: route.max_stops,
      latestSeenAt: latestSnapshot?.scanned_at ?? null,
      latestPrice: latestSnapshot ? Number(latestSnapshot.price) : null,
      missedScanRuns,
      severity: missedScanRuns >= 5 ? "critical" : "warning",
      activeRuleCount: activeRulesForRoute.length,
      activeRuleLabels,
      examplePatternLabel,
      exampleDepartureDate,
      exampleReturnDate,
      exampleBookingUrl,
      detectedDepartureSummary,
      datesScannerLastCheckedAt,
      latestScannerReasonCode: latestLoggedIssue?.code ?? null,
      latestScannerReasonLabel: latestLoggedIssue?.label ?? null,
      latestScannerReasonDetail: latestLoggedIssue?.detail ?? null,
      latestScannerReasonAt: latestLoggedIssue?.at ?? null,
      likelyIssue,
    } satisfies ScannerHealthAlert;
  });

  const alerts = routeDiagnostics.filter((route) => route.missedScanRuns >= 3);
  alerts.sort(compareScannerHealthRoutes);

  const latestRunMissingRoutes = runs[0]
    ? routeDiagnostics.filter((route) => !runs[0].routeIds.has(route.routeId))
    : [];
  latestRunMissingRoutes.sort(compareScannerHealthRoutes);

  const neverSnapshotRoutes = routeDiagnostics.filter((route) => !route.latestSeenAt);
  neverSnapshotRoutes.sort(compareScannerHealthRoutes);

  return {
    latestRunAt: runs[0]?.latestAt ?? null,
    previousRunAt: runs[1]?.latestAt ?? null,
    recentRunCount: runs.length,
    activeRoutes: activeRoutes.length,
    routesSeenInLatestRun: runs[0]?.routeIds.size ?? 0,
    routesMissingLatestRun: latestRunMissingRoutes.length,
    latestRunMissingRoutes,
    routesWithoutAnySnapshot,
    neverSnapshotRoutes,
    routesMissingData: alerts.length,
    criticalRoutes: alerts.filter((alert) => alert.severity === "critical").length,
    healthyRoutes: Math.max(0, activeRoutes.length - alerts.length),
    alerts,
  };
}

function buildOpsAutomatedAlertsSummary(
  scannerHealth: ScannerHealthSummary,
  syncFailures: ScannerSyncFailure[],
): OpsAutomatedAlertsSummary {
  const items: OpsAutomatedAlert[] = [];
  const latestRunAgeHours = hoursSince(scannerHealth.latestRunAt);

  if (scannerHealth.activeRoutes > 0 && !scannerHealth.latestRunAt) {
    items.push({
      id: "scanner:no-runs",
      kind: "scanner_not_running",
      severity: "critical",
      title: "Scanner has no completed price run",
      summary: "No snapshot-writing run is visible yet.",
      detail:
        "The ops dashboard cannot see any completed scanner run in Supabase. Check the scheduler, service status, and scanner logs before relying on route health.",
      detectedAt: null,
    });
  } else if (
    latestRunAgeHours !== null &&
    latestRunAgeHours >= OPS_SCANNER_STALE_WARNING_HOURS
  ) {
    const severity =
      latestRunAgeHours >= OPS_SCANNER_STALE_CRITICAL_HOURS ? "critical" : "warning";
    items.push({
      id: "scanner:stale-run",
      kind: "scanner_not_running",
      severity,
      title: severity === "critical" ? "Scanner is overdue" : "Scanner may be late",
      summary: `Latest snapshot run was ${formatAlertAge(latestRunAgeHours)}.`,
      detail: `The scanner should be writing fresh price snapshots regularly. The latest visible run was at ${scannerHealth.latestRunAt}.`,
      detectedAt: scannerHealth.latestRunAt,
    });
  }

  if (scannerHealth.routesMissingData > 0) {
    const severity = scannerHealth.criticalRoutes > 0 ? "critical" : "warning";
    const routeCount = scannerHealth.routesMissingData;
    const criticalDetail =
      scannerHealth.criticalRoutes > 0
        ? `${scannerHealth.criticalRoutes} route${scannerHealth.criticalRoutes === 1 ? "" : "s"} already crossed the critical threshold.`
        : "No route has crossed the critical threshold yet.";
    items.push({
      id: "routes:stale-prices",
      kind: "route_without_price",
      severity,
      title: "Routes without fresh prices",
      summary: `${routeCount} active route${routeCount === 1 ? "" : "s"} missed 3+ recent runs.`,
      detail: `${criticalDetail} Open scanner health details for the exact route, latest scanner reason, rules, detected departures, and a manual Skyscanner check.`,
      detectedAt: scannerHealth.latestRunAt,
    });
  }

  const latestSyncFailure = syncFailures[0] ?? null;
  if (latestSyncFailure) {
    const failureCount = syncFailures.length;
    items.push({
      id: "sync:recent-failures",
      kind: "sync_failure",
      severity: failureCount >= 3 ? "critical" : "warning",
      title: "Supabase sync is failing",
      summary: `${failureCount} sync failure${failureCount === 1 ? "" : "s"} in the last ${OPS_SYNC_FAILURE_LOOKBACK_HOURS}h.`,
      detail: latestSyncFailure.detail,
      detectedAt: latestSyncFailure.at,
    });
  }

  items.sort((left, right) => {
    if (left.severity !== right.severity) {
      return left.severity === "critical" ? -1 : 1;
    }

    const leftTime = left.detectedAt ? new Date(left.detectedAt).getTime() : 0;
    const rightTime = right.detectedAt ? new Date(right.detectedAt).getTime() : 0;
    return rightTime - leftTime;
  });

  return {
    generatedAt: new Date().toISOString(),
    total: items.length,
    critical: items.filter((item) => item.severity === "critical").length,
    warning: items.filter((item) => item.severity === "warning").length,
    items,
  };
}

function escapeOpsAlertHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatOpsAlertEmailTimestamp(value: string | null) {
  if (!value) {
    return "No timestamp yet";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Luxembourg",
    timeZoneName: "short",
  }).format(new Date(value));
}

function formatOpsAlertKind(value: OpsAutomatedAlert["kind"]) {
  if (value === "scanner_not_running") {
    return "Scanner";
  }
  if (value === "route_without_price") {
    return "Routes";
  }
  return "Sync";
}

function buildOpsAlertEmail(alerts: OpsAutomatedAlertsSummary) {
  const siteUrl = getSiteUrl();
  const opsUrl = `${siteUrl}/ops`;
  const subject =
    alerts.critical > 0
      ? `+352 Flights ops alert: ${alerts.critical} critical`
      : `+352 Flights ops warning: ${alerts.warning} warning`;
  const intro = `${alerts.total} active operational alert${alerts.total === 1 ? "" : "s"}: ${alerts.critical} critical, ${alerts.warning} warning.`;
  const rows = alerts.items
    .map(
      (alert) => `
        <tr>
          <td style="padding: 16px 0; border-top: 1px solid #dbe4f0;">
            <p style="margin: 0 0 6px; color: #64748b; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;">${escapeOpsAlertHtml(formatOpsAlertKind(alert.kind))} · ${escapeOpsAlertHtml(alert.severity.toUpperCase())}</p>
            <h2 style="margin: 0; color: #0f172a; font-size: 18px; line-height: 1.3;">${escapeOpsAlertHtml(alert.title)}</h2>
            <p style="margin: 8px 0 0; color: #0f172a; font-size: 14px; line-height: 1.6; font-weight: 700;">${escapeOpsAlertHtml(alert.summary)}</p>
            <p style="margin: 8px 0 0; color: #475569; font-size: 14px; line-height: 1.6;">${escapeOpsAlertHtml(alert.detail)}</p>
            <p style="margin: 10px 0 0; color: #64748b; font-size: 13px;">Signal: ${escapeOpsAlertHtml(formatOpsAlertEmailTimestamp(alert.detectedAt))}</p>
          </td>
        </tr>
      `,
    )
    .join("");

  const html = `<!doctype html>
<html>
  <body style="margin: 0; padding: 0; background: #f8fafc; font-family: Inter, Arial, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #f8fafc; padding: 28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 640px; background: #ffffff; border: 1px solid #dbe4f0; border-radius: 16px; padding: 28px;">
            <tr>
              <td>
                <p style="margin: 0 0 8px; color: #2563eb; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase;">+352 Flights Ops</p>
                <h1 style="margin: 0; color: #0f172a; font-size: 26px; line-height: 1.2;">Automatic scanner alerts</h1>
                <p style="margin: 12px 0 0; color: #475569; font-size: 15px; line-height: 1.6;">${escapeOpsAlertHtml(intro)}</p>
              </td>
            </tr>
            ${rows}
            <tr>
              <td style="padding-top: 20px;">
                <a href="${escapeOpsAlertHtml(opsUrl)}" style="display: inline-block; padding: 12px 16px; border-radius: 999px; background: #2563eb; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none;">Open ops dashboard</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "+352 Flights Ops",
    "",
    "Automatic scanner alerts",
    intro,
    "",
    ...alerts.items.flatMap((alert) => [
      `${formatOpsAlertKind(alert.kind)} · ${alert.severity.toUpperCase()}: ${alert.title}`,
      alert.summary,
      alert.detail,
      `Signal: ${formatOpsAlertEmailTimestamp(alert.detectedAt)}`,
      "",
    ]),
    `Open ops dashboard: ${opsUrl}`,
  ].join("\n");

  return { subject, html, text };
}

function buildOpsAlertStateKey(alerts: OpsAutomatedAlertsSummary, dateKey: string) {
  const payload = alerts.items.map((alert) => ({
    id: alert.id,
    severity: alert.severity,
    summary: alert.summary,
    detectedAt: alert.detectedAt,
  }));
  const digest = createHash("sha1")
    .update(JSON.stringify({ dateKey, payload }))
    .digest("hex");

  return `lux-ops-alert-${digest}`;
}

function toRenderableDeal(deal: DealSummary): CampaignPreviewDeal {
  const historyPoints = deal.baselinePrice === null ? 0 : PUBLIC_FARE_MIN_HISTORY_POINTS;
  return {
    id: deal.id,
    score: deal.score,
    routeLabel: formatDisplayRouteLabel(deal.routeLabel, deal.patternLabel),
    title: deal.title,
    summary: deal.summary,
    routeBucket: deal.routeBucket,
    editorialSection: getPrimaryEditorialSection({
      routeBucket: deal.routeBucket,
      tripNights: deal.tripNights,
      dropRatio: deal.dropRatio,
      departureDate: deal.departureDate,
    }),
    destinationCity: deal.destinationCity,
    destinationAirport: deal.destinationAirport,
    dealPrice: deal.dealPrice,
    baselinePrice: deal.baselinePrice,
    dropRatio: deal.dropRatio,
    pricePosition: classifyFarePrice(deal.dropRatio, historyPoints),
    historyPoints,
    isEditorialDeal: true,
    departureDate: deal.departureDate,
    returnDate: deal.returnDate,
    tripNights: deal.tripNights,
    maxStops: deal.maxStops,
    airlineSummary: deal.airlineSummary,
    primaryAirlineCode: deal.primaryAirlineCode,
    outboundStopCount: deal.outboundStopCount,
    returnStopCount: deal.returnStopCount,
    outboundDepartureAt: deal.outboundDepartureAt,
    outboundArrivalAt: deal.outboundArrivalAt,
    returnDepartureAt: deal.returnDepartureAt,
    returnArrivalAt: deal.returnArrivalAt,
    destinationStayHours: deal.destinationStayHours,
    verifiedAt: deal.verifiedAt,
    bookingUrl: deal.bookingUrl,
  };
}

function hasValidPublicDealDate(value: string | null | undefined) {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(new Date(value).getTime());
}

function isRenderablePublicDeal(deal: CampaignPreviewDeal) {
  return (
    deal.dealPrice > 0 &&
    hasValidPublicDealDate(deal.departureDate) &&
    hasValidPublicDealDate(deal.returnDate) &&
    hasValidPublicDealDate(deal.outboundDepartureAt) &&
    hasValidPublicDealDate(deal.outboundArrivalAt) &&
    hasValidPublicDealDate(deal.returnDepartureAt) &&
    hasValidPublicDealDate(deal.returnArrivalAt) &&
    typeof deal.bookingUrl === "string" &&
    deal.bookingUrl.length > 0
  );
}

function buildPublicFaresFromSnapshots(
  snapshots: SnapshotRow[],
  routeMap: ReturnType<typeof buildRouteMap>,
  options?: {
    maxFaresPerDestination?: number | null;
  },
) {
  const snapshotsBySeries = new Map<string, SnapshotRow[]>();

  for (const snapshot of snapshots) {
    if (Number(snapshot.price) <= 0 || hasShortDestinationStay(snapshot.metadata)) {
      continue;
    }

    const route = routeMap.get(snapshot.route_id);
    if (!route) {
      continue;
    }

    const patternKey = extractPatternKey(snapshot.metadata);
    const seriesKey = buildSeriesKey(
      snapshot.route_id,
      patternKey ?? `${snapshot.max_stops}:${snapshot.trip_nights}`,
    );
    const series = snapshotsBySeries.get(seriesKey) ?? [];
    series.push(snapshot);
    snapshotsBySeries.set(seriesKey, series);
  }

  const fares: CampaignPreviewDeal[] = [];

  for (const series of snapshotsBySeries.values()) {
    series.sort(
      (left, right) =>
        new Date(right.scanned_at).getTime() - new Date(left.scanned_at).getTime(),
    );
    const snapshot = series[0];
    const route = routeMap.get(snapshot.route_id);
    if (!route) {
      continue;
    }

    const historyPrices = series
      .slice(1, PUBLIC_FARE_HISTORY_LIMIT + 1)
      .map((item) => Number(item.price))
      .filter((value) => Number.isFinite(value) && value > 0);
    const metadataHistoryPoints = extractMetadataNumber(
      snapshot.metadata,
      "historical_history_points",
    );
    const historyPoints = Math.max(
      0,
      Math.trunc(metadataHistoryPoints ?? historyPrices.length),
    );
    const metadataBaseline = extractMetadataNumber(
      snapshot.metadata,
      "historical_baseline_price",
    );
    const baselinePrice =
      metadataBaseline ??
      (historyPrices.length >= PUBLIC_FARE_MIN_HISTORY_POINTS
        ? medianPrice(historyPrices)
        : null);
    const metadataDropRatio = extractMetadataNumber(
      snapshot.metadata,
      "historical_drop_ratio",
    );
    const dropRatio =
      metadataDropRatio ??
      (baselinePrice && baselinePrice > 0 ? Number(snapshot.price) / baselinePrice : null);
    const pricePosition = classifyFarePrice(dropRatio, historyPoints);
    const patternLabel = extractPatternLabel(snapshot.metadata);
    const airlineNames = extractAirlineNames(snapshot.metadata);
    const airlineSummary = formatAirlineSummary(airlineNames);
    const bookingUrl = buildSkyscannerUrl({
      originAirport: route.originAirport,
      destinationAirport: route.destinationAirport,
      departureDate: snapshot.departure_date,
      returnDate: snapshot.return_date,
      maxStops: snapshot.max_stops || route.maxStops,
    });
    const price = Number(snapshot.price);
    const positionScore: Record<FarePricePosition, number> = {
      exceptional: 100,
      below_usual: 80,
      typical: 60,
      above_usual: 40,
      new_price: 50,
    };

    fares.push({
      id: `fare-${snapshot.id}`,
      score: positionScore[pricePosition],
      routeLabel: formatDisplayRouteLabel(route.label, patternLabel),
      title: `Luxembourg to ${route.destinationCity} from ${price.toFixed(0)} ${snapshot.currency}`,
      summary: `Live ${snapshot.trip_nights}-night return fare, last verified ${snapshot.scanned_at}.`,
      routeBucket: deriveStayBucketFromNights(snapshot.trip_nights),
      editorialSection: getPrimaryEditorialSection({
        routeBucket: deriveStayBucketFromNights(snapshot.trip_nights),
        tripNights: snapshot.trip_nights,
        dropRatio,
        departureDate: snapshot.departure_date,
      }),
      destinationCity: route.destinationCity,
      destinationAirport: route.destinationAirport,
      dealPrice: price,
      baselinePrice,
      dropRatio,
      pricePosition,
      historyPoints,
      isEditorialDeal: snapshot.metadata?.["editorial_deal_candidate"] === true,
      departureDate: snapshot.departure_date,
      returnDate: snapshot.return_date,
      tripNights: snapshot.trip_nights,
      maxStops: snapshot.max_stops || route.maxStops,
      airlineSummary,
      primaryAirlineCode: extractPrimaryAirlineCode(snapshot.metadata),
      outboundStopCount: extractStopCount(snapshot.metadata, "outbound_stop_count"),
      returnStopCount: extractStopCount(snapshot.metadata, "return_stop_count"),
      outboundDepartureAt: extractMetadataDateTime(
        snapshot.metadata,
        "outbound_departure_at",
      ),
      outboundArrivalAt: extractMetadataDateTime(
        snapshot.metadata,
        "outbound_arrival_at",
      ),
      returnDepartureAt: extractMetadataDateTime(
        snapshot.metadata,
        "return_departure_at",
      ),
      returnArrivalAt: extractMetadataDateTime(
        snapshot.metadata,
        "return_arrival_at",
      ),
      destinationStayHours: extractDestinationStayHours(snapshot.metadata),
      verifiedAt: snapshot.scanned_at,
      bookingUrl,
    });
  }

  const grouped = new Map<string, CampaignPreviewDeal[]>();
  for (const fare of dedupePublicDealsByItinerary(fares.filter(isRenderablePublicDeal))) {
    const destinationKey = fare.destinationCity.trim().toLowerCase();
    const destinationFares = grouped.get(destinationKey) ?? [];
    destinationFares.push(fare);
    grouped.set(destinationKey, destinationFares);
  }

  const maxFaresPerDestination =
    options?.maxFaresPerDestination === undefined
      ? PUBLIC_FARES_PER_DESTINATION
      : options.maxFaresPerDestination;

  return [...grouped.values()]
    .flatMap((destinationFares) => {
      const sortedDestinationFares = destinationFares.sort(comparePublicDealsByPrice);
      return maxFaresPerDestination === null
        ? sortedDestinationFares
        : sortedDestinationFares.slice(0, maxFaresPerDestination);
    })
    .sort(comparePublicDealsByPrice);
}

function getLuxDateKey(value: string | Date, timeZone = "Europe/Luxembourg") {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function getDealFreshnessKey(deal: CampaignPreviewDeal) {
  return deal.verifiedAt ?? null;
}

function comparePublicDealsByPrice(left: CampaignPreviewDeal, right: CampaignPreviewDeal) {
  if (left.dealPrice !== right.dealPrice) {
    return left.dealPrice - right.dealPrice;
  }

  const leftDrop = left.dropRatio ?? Number.POSITIVE_INFINITY;
  const rightDrop = right.dropRatio ?? Number.POSITIVE_INFINITY;
  if (leftDrop !== rightDrop) {
    return leftDrop - rightDrop;
  }

  const leftVerified = left.verifiedAt ? new Date(left.verifiedAt).getTime() : 0;
  const rightVerified = right.verifiedAt ? new Date(right.verifiedAt).getTime() : 0;
  if (rightVerified !== leftVerified) {
    return rightVerified - leftVerified;
  }

  return left.routeLabel.localeCompare(right.routeLabel);
}

function getPublicDealItineraryKey(deal: CampaignPreviewDeal) {
  return [
    deal.destinationAirport.trim().toUpperCase(),
    deal.destinationCity.trim().toLowerCase(),
    deal.routeBucket.trim().toLowerCase(),
    deal.maxStops.trim().toUpperCase(),
    deal.airlineSummary?.trim().toLowerCase() ?? "",
    deal.outboundDepartureAt ?? "",
    deal.outboundArrivalAt ?? "",
    deal.returnDepartureAt ?? "",
    deal.returnArrivalAt ?? "",
  ].join("|");
}

function dedupePublicDealsByItinerary(deals: CampaignPreviewDeal[]) {
  const bestByItinerary = new Map<string, CampaignPreviewDeal>();

  for (const deal of deals) {
    const key = getPublicDealItineraryKey(deal);
    const existing = bestByItinerary.get(key);

    if (!existing || comparePublicDealsByPrice(deal, existing) < 0) {
      bestByItinerary.set(key, deal);
    }
  }

  return [...bestByItinerary.values()];
}

function takeSectionDeals(candidates: CampaignPreviewDeal[], limit: number, maxPerDestination: number = 2) {
  const destinationCounts = new Map<string, number>();
  const items: CampaignPreviewDeal[] = [];

  for (const deal of [...candidates].sort(comparePublicDealsByPrice)) {
    const destinationKey =
      deal.destinationAirport?.trim().toUpperCase() ||
      deal.destinationCity?.trim().toLowerCase() ||
      deal.routeLabel;
    const seenForDestination = destinationCounts.get(destinationKey) ?? 0;

    if (seenForDestination >= maxPerDestination) {
      continue;
    }

    items.push(deal);
    destinationCounts.set(destinationKey, seenForDestination + 1);

    if (items.length >= limit) {
      break;
    }
  }

  return items;
}

function buildPublicDealsSections(deals: CampaignPreviewDeal[], now: Date = new Date()) {
  const validDeals = deals.filter((deal) => deal.dealPrice > 0);
  const todayKey = getLuxDateKey(now);
  const weekStart = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const weekStartKey = getLuxDateKey(weekStart);
  const sortedDeals = [...validDeals].sort(comparePublicDealsByPrice);

  const weeklyCandidates = sortedDeals.filter((deal) => {
    const freshnessKey = getDealFreshnessKey(deal);
    if (!freshnessKey || !todayKey || !weekStartKey) {
      return false;
    }

    const dealKey = getLuxDateKey(freshnessKey);
    return dealKey !== null && dealKey >= weekStartKey && dealKey <= todayKey;
  });

  const shortTripCandidates = weeklyCandidates.filter((deal) => deal.tripNights <= 4);
  const longTripCandidates = weeklyCandidates.filter((deal) => deal.tripNights >= 5);

  const holidayCandidates = sortedDeals.filter((deal) =>
    Boolean(getMatchingLuxSchoolHoliday(deal.departureDate, deal.returnDate)),
  );

  const sections = [
    {
      key: "best_short_trips_this_week" as const,
      label: "Best finds this week for short trips",
      description: "The strongest fares verified in the last 7 days for quick trips up to 4 nights.",
      items: takeSectionDeals(shortTripCandidates, 6),
    },
    {
      key: "best_long_trips_this_week" as const,
      label: "Best finds this week for long trips",
      description: "The lowest fares verified during the last 7 days for trips of 5 nights or more.",
      items: takeSectionDeals(longTripCandidates, 6),
    },
    {
      key: "lux_school_holidays" as const,
      label: "Best for Luxembourg school holidays",
      description:
        "The cheapest options whose dates overlap official Luxembourg school holiday periods.",
      items: takeSectionDeals(holidayCandidates, 6),
    },
  ];

  return sections;
}

async function countTable(
  table:
    | "newsletter_subscribers"
    | "scanned_routes"
    | "deal_candidates"
    | "price_snapshots",
  filter?: { column: string; value: string | boolean },
): Promise<CountResult> {
  const supabase = getSupabaseAdminClient();
  let query = supabase.from(table).select("*", { count: "exact", head: true });

  if (filter) {
    query = query.eq(filter.column, filter.value);
  }

  const { count, error } = await query;
  return {
    count: count ?? 0,
    error: error ? formatError(error) : null,
  };
}

async function countEditorialDeals(status: "new" | "reviewed"): Promise<CountResult> {
  const supabase = getSupabaseAdminClient();
  const { count, error } = await supabase
    .from("deal_candidates")
    .select("*", { count: "exact", head: true })
    .eq("status", status)
    .lte("drop_ratio", EDITORIAL_DEAL_MAX_DROP_RATIO);

  return {
    count: count ?? 0,
    error: error ? formatError(error) : null,
  };
}

function buildRouteMap(routes: RouteRow[]) {
  return new Map(
    routes.map((route) => [
      route.id,
      {
        label: `${route.origin_airport} -> ${route.destination_airport} (${route.destination_city})`,
        originAirport: route.origin_airport,
        bucket: deriveStayBucketFromNights(route.trip_nights),
        destinationCity: route.destination_city,
        destinationAirport: route.destination_airport,
        tripNights: route.trip_nights,
        minTripNights: route.min_trip_nights,
        maxTripNights: route.max_trip_nights,
        maxStops: route.max_stops,
      },
    ]),
  );
}

function buildSubscriberSummaries(
  subscribers: SubscriberRow[],
  preferences: SubscriberPreferenceRow[],
  routePreferences: SubscriberRoutePreferenceRow[],
  customAlertRules: SubscriberCustomAlertRow[],
) {
  const preferenceMap = new Map(preferences.map((item) => [item.subscriber_id, item]));
  const routeMap = new Map<string, SubscriberRoutePreferenceRow[]>();
  const customRuleMap = new Map<string, SubscriberCustomAlertRow[]>();

  for (const routePreference of routePreferences) {
    if (!routePreference.is_enabled) {
      continue;
    }

    const bucket = routeMap.get(routePreference.subscriber_id) ?? [];
    bucket.push(routePreference);
    routeMap.set(routePreference.subscriber_id, bucket);
  }

  for (const customRule of customAlertRules) {
    const bucket = customRuleMap.get(customRule.subscriber_id) ?? [];
    bucket.push(customRule);
    customRuleMap.set(customRule.subscriber_id, bucket);
  }

  return subscribers.map((subscriber) => {
    const preference = preferenceMap.get(subscriber.id);
    const selectedRoutes = (routeMap.get(subscriber.id) ?? []).sort((left, right) =>
      left.destination_city.localeCompare(right.destination_city),
    );
    const activeCustomRules = (customRuleMap.get(subscriber.id) ?? [])
      .slice()
      .sort((left, right) => left.sort_order - right.sort_order);

    const preferredBuckets =
      preference?.preferred_buckets && preference.preferred_buckets.length > 0
        ? preference.preferred_buckets
            .map((bucket: string) => normalizeBucketValue(bucket))
            .filter(
              (
                bucket: ReturnType<typeof normalizeBucketValue>,
              ): bucket is Exclude<ReturnType<typeof normalizeBucketValue>, null> =>
                bucket !== null,
            )
        : defaultPreferenceValues.preferredBuckets;

    return {
      id: subscriber.id,
      email: subscriber.email,
      source: subscriber.source,
      status: subscriber.status,
      createdAt: subscriber.created_at,
      homeAirport: subscriber.home_airport,
      managePreferencesPath: `/preferences?token=${subscriber.preference_token}`,
      onboardingCompleted: subscriber.onboarding_completed,
      emailConfirmed: subscriber.email_confirmed,
      preferredLocale: normalizeEmailLocale(subscriber.preferred_locale),
      preferenceToken: subscriber.preference_token,
      unsubscribeToken: subscriber.unsubscribe_token,
      deliveryModes: normalizeDeliveryModes(
        preference?.delivery_modes,
        preference?.delivery_mode,
      ),
      maxStopsPreferences: normalizeMaxStopsPreferences(
        preference?.max_stops_preferences,
        preference?.max_stops_preference,
      ),
      departureWeekdays: normalizeDepartureWeekdays(preference?.departure_weekdays),
      minTripNights: preference?.min_trip_nights ?? defaultPreferenceValues.minTripNights,
      maxTripNights: preference?.max_trip_nights ?? defaultPreferenceValues.maxTripNights,
      budgetCeilingEur: preference?.budget_ceiling_eur ?? defaultPreferenceValues.budgetCeilingEur,
      earliestDepartureHour:
        normalizeComfortHour(preference?.earliest_departure_hour) ??
        defaultPreferenceValues.earliestDepartureHour,
      latestArrivalHour:
        normalizeComfortHour(preference?.latest_arrival_hour) ??
        defaultPreferenceValues.latestArrivalHour,
      minDestinationStayHours:
        normalizeMinDestinationStayHours(preference?.min_destination_stay_hours) ??
        defaultPreferenceValues.minDestinationStayHours,
      preferredBuckets,
      selectedRouteLabels: selectedRoutes.map(
        (item) => `${item.destination_city} (${item.destination_airport})`,
      ),
      customAlertRules: activeCustomRules.map((rule) => ({
        id: rule.id,
        name: rule.name,
        destinationCity: rule.destination_city,
        bucket: normalizeBucketValue(rule.bucket),
        maxStopsPreferences: normalizeMaxStopsPreferences(rule.max_stops_preferences, null),
        budgetCeilingEur: rule.budget_ceiling_eur,
        departureWeekdays: normalizeDepartureWeekdays(rule.departure_weekdays),
        minTripNights: rule.min_trip_nights,
        maxTripNights: rule.max_trip_nights,
        isActive: rule.is_active,
      })),
      selectedRouteKeys: new Set(
        selectedRoutes.map((item) => makeRouteKey(item.destination_airport, item.bucket)),
      ),
    };
  });
}

function enrichDeals(
  deals: DealRow[],
  routeMap: ReturnType<typeof buildRouteMap>,
  snapshotMap: Map<number, SnapshotRow>,
  baselineSeriesStartMap: Map<string, string>,
) {
  return deals
    .map((deal) => {
    const route = routeMap.get(deal.route_id);
    const snapshot = snapshotMap.get(deal.snapshot_id);
    if (hasShortDestinationStay(snapshot?.metadata)) {
      return null;
    }
    const airlineNames = extractAirlineNames(snapshot?.metadata);
    const patternKey = extractPatternKey(snapshot?.metadata);
    const patternLabel = extractPatternLabel(snapshot?.metadata);
    const baselineSeriesKey = patternKey ? buildSeriesKey(deal.route_id, patternKey) : null;
    const baselineSeriesStartAt = baselineSeriesKey
      ? baselineSeriesStartMap.get(baselineSeriesKey) ?? null
      : null;
    const baselineHistoryDays =
      baselineSeriesStartAt && snapshot?.scanned_at
        ? Math.max(
            1,
            Math.round(
              (new Date(snapshot.scanned_at).getTime() - new Date(baselineSeriesStartAt).getTime()) /
                86_400_000,
            ),
          )
        : null;
    const bookingUrl = buildSkyscannerUrl({
      originAirport: route?.originAirport,
      destinationAirport: route?.destinationAirport,
      departureDate: snapshot?.departure_date,
      returnDate: snapshot?.return_date,
      maxStops: snapshot?.max_stops ?? route?.maxStops ?? "ANY",
    });

    return {
      id: deal.id,
      routeId: deal.route_id,
      title: deal.title,
      summary: deal.summary,
      status: deal.status,
      sendType: deal.send_type,
      score: deal.score,
      dealPrice: deal.deal_price,
      baselinePrice: deal.baseline_price,
      dropRatio: deal.drop_ratio,
      createdAt: deal.created_at,
      routeLabel: route?.label ?? "Unknown route",
      routeBucket: deriveStayBucketFromNights(snapshot?.trip_nights ?? route?.tripNights ?? 0),
      patternKey,
      patternLabel,
      destinationCity: route?.destinationCity ?? "Unknown city",
      destinationAirport: route?.destinationAirport ?? "UNK",
      tripNights: snapshot?.trip_nights ?? route?.tripNights ?? 0,
      maxStops: snapshot?.max_stops ?? route?.maxStops ?? "ANY",
      airlineNames,
      airlineSummary: formatAirlineSummary(airlineNames),
      primaryAirlineCode: extractPrimaryAirlineCode(snapshot?.metadata),
      outboundStopCount: extractStopCount(snapshot?.metadata, "outbound_stop_count"),
      returnStopCount: extractStopCount(snapshot?.metadata, "return_stop_count"),
      bookingUrl,
      departureDate: snapshot?.departure_date ?? null,
      returnDate: snapshot?.return_date ?? null,
      outboundDepartureAt: extractMetadataDateTime(snapshot?.metadata, "outbound_departure_at"),
      outboundArrivalAt: extractMetadataDateTime(snapshot?.metadata, "outbound_arrival_at"),
      returnDepartureAt: extractMetadataDateTime(snapshot?.metadata, "return_departure_at"),
      returnArrivalAt: extractMetadataDateTime(snapshot?.metadata, "return_arrival_at"),
      destinationStayHours: extractDestinationStayHours(snapshot?.metadata),
      verifiedAt: snapshot?.scanned_at ?? null,
      baselineHistoryDays,
    };
    })
    .filter(Boolean) as DealSummary[];
}

function enrichSnapshots(
  snapshots: SnapshotRow[],
  routeMap: ReturnType<typeof buildRouteMap>,
): SnapshotSummary[] {
  return snapshots
    .map((snapshot) => {
      if (hasShortDestinationStay(snapshot.metadata)) {
        return null;
      }

      const route = routeMap.get(snapshot.route_id);
      const airlineNames = extractAirlineNames(snapshot.metadata);
      const patternKey = extractPatternKey(snapshot.metadata);
      const patternLabel = extractPatternLabel(snapshot.metadata);
      const bookingUrl = buildSkyscannerUrl({
        originAirport: route?.originAirport,
        destinationAirport: route?.destinationAirport,
        departureDate: snapshot.departure_date,
        returnDate: snapshot.return_date,
        maxStops: snapshot.max_stops || route?.maxStops || "ANY",
      });

      return {
        id: snapshot.id,
        routeLabel: route?.label ?? "Unknown route",
        routeBucket: deriveStayBucketFromNights(snapshot.trip_nights),
        patternKey,
        patternLabel,
        destinationCity: route?.destinationCity ?? "Unknown city",
        destinationAirport: route?.destinationAirport ?? "UNK",
        tripNights: snapshot.trip_nights,
        maxStops: snapshot.max_stops || route?.maxStops || "ANY",
        airlineNames,
        airlineSummary: formatAirlineSummary(airlineNames),
        bookingUrl,
        price: snapshot.price,
        currency: snapshot.currency,
        departureDate: snapshot.departure_date,
        returnDate: snapshot.return_date,
        outboundDepartureAt: extractMetadataDateTime(snapshot.metadata, "outbound_departure_at"),
        outboundArrivalAt: extractMetadataDateTime(snapshot.metadata, "outbound_arrival_at"),
        returnDepartureAt: extractMetadataDateTime(snapshot.metadata, "return_departure_at"),
        returnArrivalAt: extractMetadataDateTime(snapshot.metadata, "return_arrival_at"),
        destinationStayHours: extractDestinationStayHours(snapshot.metadata),
        scannedAt: snapshot.scanned_at,
      };
    })
    .filter(Boolean) as SnapshotSummary[];
}

function toOpsPricePoint(
  snapshot: SnapshotSummary,
  routeId: string,
  route: {
    tripNights: number;
    minTripNights: number | null;
    maxTripNights: number | null;
  },
): OpsPricePoint {
  const seriesKey = buildSeriesKey(routeId, snapshot.patternKey);
  return {
    id: snapshot.id,
    seriesKey,
    routeId,
    routeLabel: snapshot.routeLabel,
    routeBucket: snapshot.routeBucket,
    patternKey: snapshot.patternKey,
    patternLabel: snapshot.patternLabel,
    destinationCity: snapshot.destinationCity,
    destinationAirport: snapshot.destinationAirport,
    tripNights: snapshot.tripNights,
    routeTripNights: route.tripNights,
    routeMinTripNights: route.minTripNights,
    routeMaxTripNights: route.maxTripNights,
    maxStops: snapshot.maxStops,
    airlineNames: snapshot.airlineNames,
    airlineSummary: snapshot.airlineSummary,
    bookingUrl: snapshot.bookingUrl,
    price: snapshot.price,
    currency: snapshot.currency,
    departureDate: snapshot.departureDate,
    returnDate: snapshot.returnDate,
    outboundDepartureAt: snapshot.outboundDepartureAt,
    outboundArrivalAt: snapshot.outboundArrivalAt,
    returnDepartureAt: snapshot.returnDepartureAt,
    returnArrivalAt: snapshot.returnArrivalAt,
    destinationStayHours: snapshot.destinationStayHours,
    scannedAt: snapshot.scannedAt,
  };
}

function buildPriceSeries(
  snapshots: SnapshotRow[],
  routeMap: ReturnType<typeof buildRouteMap>,
): OpsPriceSeries[] {
  const enriched = snapshots
    .map((snapshot) => {
      const route = routeMap.get(snapshot.route_id);
      if (!route) {
        return null;
      }

      if (hasShortDestinationStay(snapshot.metadata)) {
        return null;
      }

      const airlineNames = extractAirlineNames(snapshot.metadata);
      const patternKey = extractPatternKey(snapshot.metadata);
      const patternLabel = extractPatternLabel(snapshot.metadata);

      // Legacy snapshots from the pre-pattern scanner should never appear in
      // Price Intelligence. This board is now reserved for exact rule-based
      // series only.
      if (patternKey === null) {
        return null;
      }

      return {
        seriesKey: buildSeriesKey(snapshot.route_id, patternKey),
        point: toOpsPricePoint(
          {
            id: snapshot.id,
            routeLabel: route.label,
            routeBucket: deriveStayBucketFromNights(snapshot.trip_nights),
            patternKey,
            patternLabel,
            destinationCity: route.destinationCity,
            destinationAirport: route.destinationAirport,
            tripNights: snapshot.trip_nights,
            maxStops: snapshot.max_stops || route.maxStops,
            airlineNames,
            airlineSummary: formatAirlineSummary(airlineNames),
            bookingUrl: buildSkyscannerUrl({
              originAirport: route.originAirport,
              destinationAirport: route.destinationAirport,
              departureDate: snapshot.departure_date,
              returnDate: snapshot.return_date,
              maxStops: snapshot.max_stops || route.maxStops,
            }),
            price: snapshot.price,
            currency: snapshot.currency,
            departureDate: snapshot.departure_date,
            returnDate: snapshot.return_date,
            outboundDepartureAt: extractMetadataDateTime(snapshot.metadata, "outbound_departure_at"),
            outboundArrivalAt: extractMetadataDateTime(snapshot.metadata, "outbound_arrival_at"),
            returnDepartureAt: extractMetadataDateTime(snapshot.metadata, "return_departure_at"),
            returnArrivalAt: extractMetadataDateTime(snapshot.metadata, "return_arrival_at"),
            destinationStayHours: extractDestinationStayHours(snapshot.metadata),
            scannedAt: snapshot.scanned_at,
          },
          snapshot.route_id,
          route,
        ),
      };
    })
    .filter(Boolean) as Array<{ seriesKey: string; point: OpsPricePoint }>;

  const grouped = new Map<string, OpsPricePoint[]>();
  for (const item of enriched) {
    const bucket = grouped.get(item.seriesKey) ?? [];
    bucket.push(item.point);
    grouped.set(item.seriesKey, bucket);
  }

  return Array.from(grouped.entries())
    .map(([seriesKey, points]) => {
      const orderedPoints = [...points].sort(
        (left, right) =>
          new Date(left.scannedAt).getTime() - new Date(right.scannedAt).getTime(),
      );
      const latestPoint = orderedPoints.at(-1) ?? null;
      const previousPoint = orderedPoints.at(-2) ?? null;
      const prices = orderedPoints.map((point) => point.price);

      return {
        seriesKey,
        routeId: latestPoint?.routeId ?? "unknown",
        routeLabel: latestPoint?.routeLabel ?? "Unknown route",
        routeBucket: latestPoint?.routeBucket ?? "unknown",
        patternKey: latestPoint?.patternKey ?? null,
        patternLabel: latestPoint?.patternLabel ?? null,
        destinationCity: latestPoint?.destinationCity ?? "Unknown city",
        destinationAirport: latestPoint?.destinationAirport ?? "UNK",
        routeTripNights: latestPoint?.routeTripNights ?? 0,
        routeMinTripNights: latestPoint?.routeMinTripNights ?? null,
        routeMaxTripNights: latestPoint?.routeMaxTripNights ?? null,
        latestTripNights: latestPoint?.tripNights ?? null,
        maxStops: latestPoint?.maxStops ?? "ANY",
        latestAirlineSummary: latestPoint?.airlineSummary ?? null,
        latestBookingUrl: latestPoint?.bookingUrl ?? null,
        latestPrice: latestPoint?.price ?? null,
        previousPrice: previousPoint?.price ?? null,
        minPrice: prices.length > 0 ? Math.min(...prices) : null,
        maxPrice: prices.length > 0 ? Math.max(...prices) : null,
        latestDepartureDate: latestPoint?.departureDate ?? null,
        latestReturnDate: latestPoint?.returnDate ?? null,
        latestOutboundDepartureAt: latestPoint?.outboundDepartureAt ?? null,
        latestOutboundArrivalAt: latestPoint?.outboundArrivalAt ?? null,
        latestReturnDepartureAt: latestPoint?.returnDepartureAt ?? null,
        latestReturnArrivalAt: latestPoint?.returnArrivalAt ?? null,
        latestDestinationStayHours: latestPoint?.destinationStayHours ?? null,
        latestScannedAt: latestPoint?.scannedAt ?? null,
        points: orderedPoints,
      };
    })
    .sort((left, right) => {
      const leftTime = left.latestScannedAt ? new Date(left.latestScannedAt).getTime() : 0;
      const rightTime = right.latestScannedAt ? new Date(right.latestScannedAt).getTime() : 0;
      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }

      return left.routeLabel.localeCompare(right.routeLabel);
    });
}

function deliveryModeMatches(
  sendType: CampaignSendType,
  deliveryModes: DeliveryModeValue[],
) {
  if (sendType === "flash") {
    return deliveryModes.includes("flash_only");
  }

  return deliveryModes.includes("daily_digest");
}

function stopsMatch(preferences: MaxStopsPreferenceValue[], routeMaxStops: string) {
  if (preferences.includes("ANY")) {
    return true;
  }

  if (routeMaxStops === "NON_STOP") {
    return (
      preferences.includes("NON_STOP") || preferences.includes("ONE_STOP_OR_FEWER")
    );
  }

  if (routeMaxStops === "ONE_STOP_OR_FEWER") {
    return preferences.includes("ONE_STOP_OR_FEWER");
  }

  return false;
}

function departureWeekdayMatches(weekdays: WeekdayValue[], departureDate: string | null) {
  const weekday = weekdayForDate(departureDate);
  if (!weekday) {
    return false;
  }

  return weekdays.includes(weekday);
}

function hourForDateTime(value: string | null) {
  if (!value) {
    return null;
  }

  const isoHourMatch = value.match(/T(\d{2}):\d{2}/);
  if (isoHourMatch) {
    const parsedHour = Number(isoHourMatch[1]);
    if (Number.isFinite(parsedHour)) {
      return parsedHour;
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.getHours();
}

function comfortMatchesDeal(
  preferences: {
    earliestDepartureHour: number | null;
    latestArrivalHour: number | null;
    minDestinationStayHours: number | null;
  },
  deal: DealSummary,
) {
  if (preferences.minDestinationStayHours !== null) {
    if (
      deal.destinationStayHours === null ||
      deal.destinationStayHours < preferences.minDestinationStayHours
    ) {
      return false;
    }
  }

  if (preferences.earliestDepartureHour !== null) {
    const outboundDepartureHour = hourForDateTime(deal.outboundDepartureAt);
    const returnDepartureHour = hourForDateTime(deal.returnDepartureAt);

    if (
      outboundDepartureHour === null ||
      outboundDepartureHour < preferences.earliestDepartureHour
    ) {
      return false;
    }

    if (
      returnDepartureHour === null ||
      returnDepartureHour < preferences.earliestDepartureHour
    ) {
      return false;
    }
  }

  if (preferences.latestArrivalHour !== null) {
    const outboundArrivalHour = hourForDateTime(deal.outboundArrivalAt);
    const returnArrivalHour = hourForDateTime(deal.returnArrivalAt);

    if (
      outboundArrivalHour === null ||
      outboundArrivalHour > preferences.latestArrivalHour
    ) {
      return false;
    }

    if (
      returnArrivalHour === null ||
      returnArrivalHour > preferences.latestArrivalHour
    ) {
      return false;
    }
  }

  return true;
}

function basePreferenceMatchesDeal(subscriber: AudienceMember, deal: DealSummary) {
  if (!subscriber.preferredBuckets.includes(deal.routeBucket)) {
    return false;
  }

  if (
    subscriber.selectedRouteKeys.size > 0 &&
    !subscriber.selectedRouteKeys.has(makeRouteKey(deal.destinationAirport, deal.routeBucket))
  ) {
    return false;
  }

  if (!stopsMatch(subscriber.maxStopsPreferences, deal.maxStops)) {
    return false;
  }

  if (!departureWeekdayMatches(subscriber.departureWeekdays, deal.departureDate)) {
    return false;
  }

  if (subscriber.minTripNights !== null && deal.tripNights < subscriber.minTripNights) {
    return false;
  }

  if (subscriber.maxTripNights !== null && deal.tripNights > subscriber.maxTripNights) {
    return false;
  }

  if (subscriber.budgetCeilingEur !== null && deal.dealPrice > subscriber.budgetCeilingEur) {
    return false;
  }

  return true;
}

function customRuleMatchesDeal(
  rule: AudienceMember["customAlertRules"][number],
  deal: DealSummary,
) {
  if (!rule.isActive) {
    return false;
  }

  if (rule.destinationCity && rule.destinationCity !== deal.destinationCity) {
    return false;
  }

  if (rule.bucket && rule.bucket !== deal.routeBucket) {
    return false;
  }

  if (!stopsMatch(rule.maxStopsPreferences, deal.maxStops)) {
    return false;
  }

  if (!departureWeekdayMatches(rule.departureWeekdays, deal.departureDate)) {
    return false;
  }

  if (rule.minTripNights !== null && deal.tripNights < rule.minTripNights) {
    return false;
  }

  if (rule.maxTripNights !== null && deal.tripNights > rule.maxTripNights) {
    return false;
  }

  if (rule.budgetCeilingEur !== null && deal.dealPrice > rule.budgetCeilingEur) {
    return false;
  }

  return true;
}

function dealMatchesSubscriber(subscriber: AudienceMember, deal: DealSummary, sendType: CampaignSendType) {
  if (!deliveryModeMatches(sendType, subscriber.deliveryModes)) {
    return false;
  }

  if (!comfortMatchesDeal(subscriber, deal)) {
    return false;
  }

  if (basePreferenceMatchesDeal(subscriber, deal)) {
    return true;
  }

  return subscriber.customAlertRules.some((rule) => customRuleMatchesDeal(rule, deal));
}

function matchRecipients(sendType: CampaignSendType, subscribers: AudienceMember[], deals: DealSummary[]) {
  const matched: MatchedRecipient[] = [];

  for (const subscriber of subscribers) {
    const matchingDeals = deals.filter((deal) => dealMatchesSubscriber(subscriber, deal, sendType));
    if (matchingDeals.length === 0) {
      continue;
    }

    matched.push({
      subscriber,
      deals: matchingDeals.sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.dealPrice - right.dealPrice;
      }),
    });
  }

  return matched;
}

function buildPreviewRender(
  sendType: CampaignSendType,
  deals: DealSummary[],
  subscriber: AudienceMember | null,
) {
  const siteUrl = getSiteUrl();
  const previewDeals = deals.slice(0, 3);
  const locale = subscriber?.preferredLocale ?? "en";
  const subject = buildCampaignSubject(sendType, previewDeals, locale);
  const previewText = buildCampaignPreviewText(sendType, previewDeals, locale);
  const rendered = renderCampaignEmail({
    sendType,
    subject,
    previewText,
    managePreferencesUrl: subscriber
      ? `${siteUrl}/preferences?token=${subscriber.preferenceToken}`
      : `${siteUrl}/preferences`,
    unsubscribeUrl: subscriber
      ? `${siteUrl}/unsubscribe?token=${subscriber.unsubscribeToken}`
      : `${siteUrl}/unsubscribe`,
    deals: previewDeals.map(toRenderableDeal),
    locale,
  });

  return {
    subject,
    previewText,
    previewHtml: rendered.html,
    previewDeals: previewDeals.map(toRenderableDeal),
  };
}

function buildCampaignPreview(
  sendType: CampaignSendType,
  deals: DealSummary[],
  subscribers: AudienceMember[],
  suggestedTestEmail: string | null,
): CampaignPreview {
  const matchedRecipients = matchRecipients(sendType, subscribers, deals);
  const topRoutes = unique(
    deals.map((deal) => formatDisplayRouteLabel(deal.routeLabel, deal.patternLabel)),
  ).slice(0, 3);
  const previewSeed = matchedRecipients[0]?.deals ?? deals;
  const previewRender = buildPreviewRender(sendType, previewSeed, matchedRecipients[0]?.subscriber ?? null);
  const previewDeals = previewSeed.map(toRenderableDeal);
  const previewSections = buildEditorialSections(
    previewDeals,
    (deal) => ({
      routeBucket: deal.routeBucket,
      tripNights: deal.tripNights,
      dropRatio: deal.dropRatio,
      departureDate: deal.departureDate,
    }),
  );

  let blockedReason: string | null = null;
  if (!hasResendEnv()) {
    blockedReason = "Add RESEND_API_KEY and RESEND_FROM_EMAIL before sending live emails.";
  } else if (deals.length === 0) {
    blockedReason =
      sendType === "flash"
        ? "Review at least one flash deal to unlock this send."
        : "Review at least one digest deal to unlock this send.";
  } else if (matchedRecipients.length === 0) {
    blockedReason = "No active subscribers match the current routes and filters.";
  }

  return {
    sendType,
    label: sendType === "flash" ? "Flash alerts" : "Daily digest",
    description:
      sendType === "flash"
        ? "Immediate sends for the strongest drops. Weekly-only subscribers stay excluded."
        : "One operational digest to everyone whose route profile matches reviewed daily deals.",
    reviewedDeals: deals.length,
    matchingSubscribers: matchedRecipients.length,
    topRoutes,
    isReady: blockedReason === null,
    blockedReason,
    subject: previewRender.subject,
    previewText: previewRender.previewText,
    previewHtml: previewRender.previewHtml,
    previewDeals,
    previewSections,
    suggestedTestEmail,
  };
}

function buildIdempotencyKey(sendType: CampaignSendType, subscriberId: string, dealIds: string[]) {
  const digest = createHash("sha1")
    .update(`${sendType}:${subscriberId}:${[...dealIds].sort().join(",")}`)
    .digest("hex");

  return `lux-${sendType}-${digest}`;
}

async function loadAutomationSettings() {
  const supabase = getSupabaseAdminClient();
  const query = await supabase
    .from("ops_automation_settings")
    .select("id,daily_digest_enabled,daily_digest_hour,daily_digest_minute,test_email,last_digest_sent_on")
    .eq("id", "default")
    .maybeSingle();

  if (query.error) {
    throw new Error(formatError(query.error));
  }

  const row = query.data as AutomationSettingsRow | null;
  if (!row) {
    return defaultDigestAutomationSummary();
  }

  const siteUrl = getSiteUrl();
  const endpointReady = hasCronSecret() && !siteUrl.includes("localhost");
  let blockedReason: string | null = null;

  if (!hasCronSecret()) {
    blockedReason = "Add CRON_SECRET to the deployed app and GitHub Actions before automatic digests can run.";
  } else if (siteUrl.includes("localhost")) {
    blockedReason = "NEXT_PUBLIC_SITE_URL still points to localhost, so the GitHub workflow has nowhere public to call.";
  }

  return {
    enabled: row.daily_digest_enabled,
    localTime: formatTimeParts(row.daily_digest_hour, row.daily_digest_minute),
    testEmail: row.test_email ?? process.env.RESEND_REPLY_TO_EMAIL ?? null,
    lastDigestSentOn: row.last_digest_sent_on,
    endpointReady,
    blockedReason,
  } satisfies DigestAutomationSummary;
}

async function loadCampaignModel(sendType: CampaignSendType) {
  await autoExpireStaleDeals();
  const supabase = getSupabaseAdminClient();
  const [
    subscribersQuery,
    preferencesQuery,
    routePreferencesQuery,
    customAlertRulesQuery,
    routesQuery,
    dealsQuery,
  ] =
    await Promise.all([
      supabase
        .from("newsletter_subscribers")
        .select(
          "id,email,source,status,created_at,home_airport,onboarding_completed,preference_token,unsubscribe_token,email_confirmed,preferred_locale",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("subscriber_preferences")
        .select("*"),
      supabase
        .from("subscriber_route_preferences")
        .select("subscriber_id,destination_airport,destination_city,bucket,is_enabled"),
      supabase
        .from("subscriber_custom_alerts")
        .select("*")
        .order("sort_order", { ascending: true }),
      supabase
        .from("scanned_routes")
        .select(
          "id,origin_airport,destination_airport,destination_city,bucket,trip_nights,min_trip_nights,max_trip_nights,max_stops,is_active",
        ),
      supabase
        .from("deal_candidates")
        .select(
          "id,route_id,snapshot_id,title,summary,deal_price,baseline_price,drop_ratio,score,send_type,status,created_at",
        )
        .eq("status", "reviewed")
        .lte("drop_ratio", EDITORIAL_DEAL_MAX_DROP_RATIO)
        .eq("send_type", sendType)
        .order("score", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

  const errors = [
    subscribersQuery.error ? formatError(subscribersQuery.error) : null,
    preferencesQuery.error ? formatError(preferencesQuery.error) : null,
    routePreferencesQuery.error ? formatError(routePreferencesQuery.error) : null,
    customAlertRulesQuery.error ? formatError(customAlertRulesQuery.error) : null,
    routesQuery.error ? formatError(routesQuery.error) : null,
    dealsQuery.error ? formatError(dealsQuery.error) : null,
  ].filter(Boolean) as string[];

  if (errors.length > 0) {
    throw new Error(errors[0]);
  }

  const dealRows = (dealsQuery.data ?? []) as DealRow[];
  const snapshotIds = unique(dealRows.map((deal) => deal.snapshot_id));
  const snapshotsQuery =
    snapshotIds.length === 0
      ? { data: [] as SnapshotRow[], error: null }
      : await supabase
          .from("price_snapshots")
          .select("id,route_id,price,currency,departure_date,return_date,trip_nights,max_stops,metadata,scanned_at")
          .in("id", snapshotIds);

  if (snapshotsQuery.error) {
    throw new Error(formatError(snapshotsQuery.error));
  }

  const subscribers = buildSubscriberSummaries(
    (subscribersQuery.data ?? []) as SubscriberRow[],
    (preferencesQuery.data ?? []) as SubscriberPreferenceRow[],
    (routePreferencesQuery.data ?? []) as SubscriberRoutePreferenceRow[],
    (customAlertRulesQuery.data ?? []) as SubscriberCustomAlertRow[],
  );

  const activeAudience = subscribers.filter(
    (subscriber) =>
      subscriber.status === "active" &&
      subscriber.onboardingCompleted &&
      subscriber.emailConfirmed,
  );
  const routeMap = buildRouteMap((routesQuery.data ?? []) as RouteRow[]);
  const snapshotMap = new Map(
    ((snapshotsQuery.data ?? []) as SnapshotRow[]).map((snapshot) => [snapshot.id, snapshot]),
  );
  const baselineSeriesStartMap = new Map<string, string>();
  for (const snapshot of (snapshotsQuery.data ?? []) as SnapshotRow[]) {
    const patternKey = extractPatternKey(snapshot.metadata);
    if (!patternKey) {
      continue;
    }

    const seriesKey = buildSeriesKey(snapshot.route_id, patternKey);
    const currentEarliest = baselineSeriesStartMap.get(seriesKey);
    if (!currentEarliest || new Date(snapshot.scanned_at).getTime() < new Date(currentEarliest).getTime()) {
      baselineSeriesStartMap.set(seriesKey, snapshot.scanned_at);
    }
  }
  const deals = enrichDeals(dealRows, routeMap, snapshotMap, baselineSeriesStartMap);

  return {
    subscribers: activeAudience,
    deals,
  };
}

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
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

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
    supabase
      .from("subscriber_preferences")
      .select("*"),
    supabase
      .from("subscriber_route_preferences")
      .select("subscriber_id,destination_airport,destination_city,bucket,is_enabled"),
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
      .order("created_at", { ascending: false }),
    supabase
      .from("deal_candidates")
      .select(
        "id,route_id,snapshot_id,title,summary,deal_price,baseline_price,drop_ratio,score,send_type,status,created_at",
      )
      .eq("status", "reviewed")
      .lte("drop_ratio", EDITORIAL_DEAL_MAX_DROP_RATIO)
      .order("score", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("price_snapshots")
      .select("id,route_id,price,currency,departure_date,return_date,trip_nights,max_stops,metadata,scanned_at")
      .order("scanned_at", { ascending: false })
      .limit(10),
    supabase
      .from("price_snapshots")
      .select("id,route_id,price,currency,departure_date,return_date,trip_nights,max_stops,metadata,scanned_at")
      .order("scanned_at", { ascending: false })
      .limit(1200),
    supabase
      .from("email_campaigns")
      .select(
        "id,send_type,subject,status,recipient_count,sent_count,failed_count,route_labels,created_at,sent_at",
      )
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("ops_automation_settings")
      .select("id,daily_digest_enabled,daily_digest_hour,daily_digest_minute,test_email,last_digest_sent_on")
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
    routePreferencesQuery.error ? formatError(routePreferencesQuery.error) : null,
    customAlertRulesQuery.error ? formatError(customAlertRulesQuery.error) : null,
    routesQuery.error ? formatError(routesQuery.error) : null,
    newDealsQuery.error ? formatError(newDealsQuery.error) : null,
    reviewedDealsQuery.error ? formatError(reviewedDealsQuery.error) : null,
    recentSnapshotsQuery.error ? formatError(recentSnapshotsQuery.error) : null,
    scannerHealthSnapshotsQuery.error ? formatError(scannerHealthSnapshotsQuery.error) : null,
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
  const reviewedDealRows = ((reviewedDealsQuery.data ?? []) as DealRow[]).filter(
    (deal) => deal.deal_price > 0,
  );
  const snapshotIds = unique(
    [...newDealRows, ...reviewedDealRows].map((deal) => deal.snapshot_id),
  );
  const dealRouteIds = unique([...newDealRows, ...reviewedDealRows].map((deal) => deal.route_id));

  const dealSnapshotsQuery =
    snapshotIds.length === 0
      ? { data: [] as SnapshotRow[], error: null }
      : await supabase
          .from("price_snapshots")
          .select("id,route_id,price,currency,departure_date,return_date,trip_nights,max_stops,metadata,scanned_at")
          .in("id", snapshotIds);

  const dealHistorySnapshotsQuery =
    dealRouteIds.length === 0
      ? { data: [] as Array<Pick<SnapshotRow, "route_id" | "metadata" | "scanned_at">>, error: null }
      : await supabase
          .from("price_snapshots")
          .select("route_id,metadata,scanned_at")
          .in("route_id", dealRouteIds)
          .order("scanned_at", { ascending: true });

  const newDealSeriesSnapshotsQuery =
    dealRouteIds.length === 0
      ? { data: [] as SnapshotRow[], error: null }
      : await fetchPagedSnapshots<SnapshotRow>((from, to) =>
          supabase
            .from("price_snapshots")
            .select(
              "id,route_id,price,currency,departure_date,return_date,trip_nights,max_stops,metadata,scanned_at",
            )
            .in("route_id", dealRouteIds)
            .order("scanned_at", { ascending: false })
            .range(from, to),
        );

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
  const activeRouteIds = routes.filter((route) => route.is_active).map((route) => route.id);
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
            .select("route_id,month_start,routing,departure_dates,departure_weekdays,last_checked_at")
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
    scannerHealthServiceMonthsQuery.error ? formatError(scannerHealthServiceMonthsQuery.error) : null,
    scannerHealthRulesQuery.error ? formatError(scannerHealthRulesQuery.error) : null,
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
    ((dealSnapshotsQuery.data ?? []) as SnapshotRow[]).map((snapshot) => [snapshot.id, snapshot]),
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
    if (!baselineSeriesStartMap.has(seriesKey)) {
      baselineSeriesStartMap.set(seriesKey, snapshot.scanned_at);
    }
  }
  const subscriberSummaries = buildSubscriberSummaries(
    (subscribersQuery.data ?? []) as SubscriberRow[],
    (preferencesQuery.data ?? []) as SubscriberPreferenceRow[],
    (routePreferencesQuery.data ?? []) as SubscriberRoutePreferenceRow[],
    (customAlertRulesQuery.data ?? []) as SubscriberCustomAlertRow[],
  );

  const newDeals = enrichDeals(newDealRows, routeMap, dealSnapshotMap, baselineSeriesStartMap);
  const reviewedDeals = enrichDeals(
    reviewedDealRows,
    routeMap,
    dealSnapshotMap,
    baselineSeriesStartMap,
  );
  const newDealSeriesKeys = new Set(
    newDeals
      .map((deal) => (deal.patternKey ? buildSeriesKey(deal.routeId, deal.patternKey) : null))
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
  const automationSettings = (automationQuery.data as AutomationSettingsRow | null) ?? null;
  const siteUrl = getSiteUrl();
  const digestAutomation: DigestAutomationSummary = automationSettings
    ? {
        enabled: automationSettings.daily_digest_enabled,
        localTime: formatTimeParts(
          automationSettings.daily_digest_hour,
          automationSettings.daily_digest_minute,
        ),
        testEmail: automationSettings.test_email ?? process.env.RESEND_REPLY_TO_EMAIL ?? null,
        lastDigestSentOn: automationSettings.last_digest_sent_on,
        endpointReady: hasCronSecret() && !siteUrl.includes("localhost"),
        blockedReason: !hasCronSecret()
          ? "Add CRON_SECRET to the deployed app and GitHub Actions before automatic digests can run."
          : siteUrl.includes("localhost")
            ? "NEXT_PUBLIC_SITE_URL still points to localhost, so the GitHub workflow has nowhere public to call."
            : null,
      }
    : defaultDigestAutomationSummary();

  const sendQueue = campaignSendTypes.map((sendType) =>
    buildCampaignPreview(
      sendType,
      reviewedDeals.filter((deal) => deal.sendType === sendType),
      activeAudience,
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
    routeMap,
    (scannerHealthServiceMonthsQuery.data ?? []) as ScannerHealthServiceMonthRow[],
    (scannerHealthRulesQuery.data ?? []) as ScannerHealthRuleRow[],
    latestScannerIssuesByRoute,
  );
  const automatedAlerts = buildOpsAutomatedAlertsSummary(
    scannerHealth,
    latestScannerIssuesByRoute.syncFailures,
  );

  const recentCampaigns = ((recentCampaignsQuery.data ?? []) as EmailCampaignRow[]).map(
    (campaign) => ({
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
    }),
  );

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
      bucket: formatStayBucketListLabel([deriveStayBucketFromNights(route.trip_nights)]),
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

let lastSuccessfulPublicDealsPageData: PublicDealsPageData | null = null;
const lastSuccessfulPublicCityDealsPageData = new Map<string, PublicDealsPageData>();

function emptyPublicDealsPageData(input?: {
  configured?: boolean;
  schemaReady?: boolean;
  onboardingMessage?: string | null;
}): PublicDealsPageData {
  return {
    configured: input?.configured ?? true,
    schemaReady: input?.schemaReady ?? false,
    onboardingMessage: input?.onboardingMessage ?? null,
    deals: [],
    sections: [],
    updatedAt: null,
  };
}

function buildPublicDealsPageData(
  routes: RouteRow[],
  snapshots: SnapshotRow[],
  options?: {
    maxFaresPerDestination?: number | null;
  },
): PublicDealsPageData {
  const deals = buildPublicFaresFromSnapshots(snapshots, buildRouteMap(routes), {
    maxFaresPerDestination: options?.maxFaresPerDestination,
  });
  const updatedAt = deals.reduce<string | null>((latest, deal) => {
    if (!deal.verifiedAt) return latest;
    if (!latest) return deal.verifiedAt;
    return new Date(deal.verifiedAt).getTime() > new Date(latest).getTime()
      ? deal.verifiedAt
      : latest;
  }, null);

  return {
    configured: true,
    schemaReady: true,
    onboardingMessage: null,
    deals,
    sections: buildPublicDealsSections(deals),
    updatedAt,
  };
}

async function getPublicDealsPageDataUncached(): Promise<PublicDealsPageData> {
  return getPublicDealsBoardDataUncached({
    maxFaresPerDestination: PUBLIC_FARES_PER_DESTINATION,
  });
}

async function getPublicSearchDealsPageDataUncached(): Promise<PublicDealsPageData> {
  return getPublicDealsBoardDataUncached({
    maxFaresPerDestination: PUBLIC_ALL_FARES_PER_DESTINATION,
  });
}

async function getPublicDealsBoardDataUncached(options: {
  maxFaresPerDestination: number | null;
}): Promise<PublicDealsPageData> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      configured: false,
      schemaReady: false,
      onboardingMessage:
        "Supabase is not configured yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.",
      deals: [],
      sections: [],
      updatedAt: null,
    };
  }

  const supabase = getSupabaseAdminClient();
  const cutoffIso = new Date(
    Date.now() - PUBLIC_FARE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const todayKey = getLuxDateKey(new Date()) ?? new Date().toISOString().slice(0, 10);
  const [routesQuery, publicSnapshotsQuery] = await Promise.all([
    readSupabaseWithRetry<RouteRow[]>(() =>
      supabase
        .from("scanned_routes")
        .select(
          "id,origin_airport,destination_airport,destination_city,bucket,trip_nights,min_trip_nights,max_trip_nights,max_stops,is_active",
        )
        .eq("is_active", true),
    ),
    fetchPagedSnapshots<SnapshotRow>((from, to) =>
      supabase
        .from("price_snapshots")
        .select(
          "id,route_id,price,currency,departure_date,return_date,trip_nights,max_stops,metadata,scanned_at",
        )
        .gte("scanned_at", cutoffIso)
        .gte("departure_date", todayKey)
        .order("scanned_at", { ascending: false })
        .range(from, to),
    ),
  ]);

  const errors = [
    routesQuery.error ? formatError(routesQuery.error) : null,
    publicSnapshotsQuery.error ? formatError(publicSnapshotsQuery.error) : null,
  ].filter(Boolean) as string[];

  if (errors.length > 0) {
    const message = errors[0];
    if (!isMissingTableError(message)) {
      throw new Error(`Public fare data could not be loaded: ${message}`);
    }
    return {
      configured: true,
      schemaReady: false,
      onboardingMessage:
        "Supabase is reachable, but the latest tables are not created yet. Re-run supabase/schema.sql and then supabase/seed.sql in the SQL Editor.",
      deals: [],
      sections: [],
      updatedAt: null,
    };
  }

  return buildPublicDealsPageData(
    (routesQuery.data ?? []) as RouteRow[],
    (publicSnapshotsQuery.data ?? []) as SnapshotRow[],
    { maxFaresPerDestination: options.maxFaresPerDestination },
  );
}

async function getPublicCityDealsPageDataUncached(citySlug: string): Promise<PublicDealsPageData> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return emptyPublicDealsPageData({
      configured: false,
      onboardingMessage:
        "Supabase is not configured yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.",
    });
  }

  const supabase = getSupabaseAdminClient();
  const routesQuery = await readSupabaseWithRetry<RouteRow[]>(() =>
    supabase
      .from("scanned_routes")
      .select(
        "id,origin_airport,destination_airport,destination_city,bucket,trip_nights,min_trip_nights,max_trip_nights,max_stops,is_active",
      )
      .eq("is_active", true),
  );

  if (routesQuery.error) {
    const message = formatError(routesQuery.error);
    if (!isMissingTableError(message)) {
      throw new Error(`City fare routes could not be loaded: ${message}`);
    }
    return emptyPublicDealsPageData({
      schemaReady: false,
      onboardingMessage:
        "Supabase is reachable, but the latest tables are not created yet. Re-run supabase/schema.sql and then supabase/seed.sql in the SQL Editor.",
    });
  }

  const routes = ((routesQuery.data ?? []) as RouteRow[]).filter((route) =>
    matchesDestinationSlug(route.destination_city, citySlug),
  );
  if (routes.length === 0) {
    return buildPublicDealsPageData([], [], {
      maxFaresPerDestination: PUBLIC_ALL_FARES_PER_DESTINATION,
    });
  }

  const cutoffIso = new Date(
    Date.now() - PUBLIC_FARE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const todayKey = getLuxDateKey(new Date()) ?? new Date().toISOString().slice(0, 10);
  const routeIds = routes.map((route) => route.id);
  const snapshotsQuery = await fetchPagedSnapshots<SnapshotRow>((from, to) =>
    supabase
      .from("price_snapshots")
      .select(
        "id,route_id,price,currency,departure_date,return_date,trip_nights,max_stops,metadata,scanned_at",
      )
      .in("route_id", routeIds)
      .gte("scanned_at", cutoffIso)
      .gte("departure_date", todayKey)
      .order("scanned_at", { ascending: false })
      .range(from, to),
  );

  if (snapshotsQuery.error) {
    throw new Error(`City fare snapshots could not be loaded: ${formatError(snapshotsQuery.error)}`);
  }

  return buildPublicDealsPageData(routes, (snapshotsQuery.data ?? []) as SnapshotRow[], {
    maxFaresPerDestination: PUBLIC_ALL_FARES_PER_DESTINATION,
  });
}

const getCachedPublicDealsPageData = unstable_cache(
  getPublicDealsPageDataUncached,
  ["public-deals-page-data-v2"],
  {
    revalidate: 60,
    tags: ["public-deals"],
  },
);

const getCachedPublicSearchDealsPageData = unstable_cache(
  getPublicSearchDealsPageDataUncached,
  ["public-search-deals-page-data-v1"],
  {
    revalidate: 60,
    tags: ["public-deals"],
  },
);

export async function getPublicDealsPageData(): Promise<PublicDealsPageData> {
  try {
    const data = await getCachedPublicDealsPageData();
    if (data.configured && data.schemaReady) {
      lastSuccessfulPublicDealsPageData = data;
    }
    return data;
  } catch (error) {
    console.error("[public-fares] Supabase read failed after retries.", error);
    if (lastSuccessfulPublicDealsPageData) {
      return lastSuccessfulPublicDealsPageData;
    }

    return {
      configured: true,
      schemaReady: false,
      onboardingMessage: null,
      deals: [],
      sections: [],
      updatedAt: null,
    };
  }
}

export async function getPublicSearchDealsPageData(): Promise<PublicDealsPageData> {
  try {
    const data = await getCachedPublicSearchDealsPageData();
    if (data.configured && data.schemaReady) {
      lastSuccessfulPublicDealsPageData = data;
    }
    return data;
  } catch (error) {
    console.error("[public-search-fares] Supabase read failed after retries.", error);
    if (lastSuccessfulPublicDealsPageData) {
      return lastSuccessfulPublicDealsPageData;
    }

    return {
      configured: true,
      schemaReady: false,
      onboardingMessage: null,
      deals: [],
      sections: [],
      updatedAt: null,
    };
  }
}

export async function getPublicCityDealsPageData(citySlug: string): Promise<PublicDealsPageData> {
  const normalizedSlug = citySlug.trim().toLowerCase();
  const getCachedCityData = unstable_cache(
    () => getPublicCityDealsPageDataUncached(normalizedSlug),
    ["public-city-deals-page-data-v2", normalizedSlug],
    { revalidate: 60, tags: ["public-deals", `public-city-deals-${normalizedSlug}`] },
  );

  try {
    const data = await getCachedCityData();
    if (data.configured && data.schemaReady) {
      lastSuccessfulPublicCityDealsPageData.set(normalizedSlug, data);
    }
    return data;
  } catch (error) {
    console.error(`[public-city-fares:${normalizedSlug}] Supabase read failed after retries.`, error);
    return (
      lastSuccessfulPublicCityDealsPageData.get(normalizedSlug) ??
      emptyPublicDealsPageData()
    );
  }
}

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
        new Date(right.scannedAt).getTime() - new Date(left.scannedAt).getTime(),
    );

  const latestPerRoute = series.filter((routeSeries) => routeSeries.latestPrice !== null);
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
        ? formatDisplayRouteLabel(liveLowest.routeLabel, liveLowest.patternLabel)
        : null,
    },
    series,
    tableRows,
  };
}

export async function updateDealStatus(input: {
  id: string;
  status: "reviewed" | "expired";
}) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("deal_candidates")
    .update({
      status: input.status,
      reviewed_at: input.status === "reviewed" ? new Date().toISOString() : null,
    })
    .eq("id", input.id);

  if (error) {
    throw new Error(formatError(error));
  }
}

export async function updateSubscriber(input: {
  id: string;
  email: string;
  status: "pending" | "active" | "unsubscribed";
  homeAirport: string;
  emailConfirmed: boolean;
  onboardingCompleted: boolean;
}) {
  const supabase = getSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const email = input.email.trim().toLowerCase();
  const homeAirport = input.homeAirport.trim().toUpperCase();

  if (!input.id) {
    throw new Error("Subscriber id is required.");
  }

  if (!email || !email.includes("@")) {
    throw new Error("Enter a valid subscriber email.");
  }

  if (!homeAirport) {
    throw new Error("Home airport is required.");
  }

  const updatePayload = {
    email,
    status: input.status,
    home_airport: homeAirport,
    email_confirmed: input.emailConfirmed,
    onboarding_completed: input.onboardingCompleted,
    confirmed_at: input.emailConfirmed ? nowIso : null,
    unsubscribed_at: input.status === "unsubscribed" ? nowIso : null,
    updated_at: nowIso,
  };

  const { error } = await supabase
    .from("newsletter_subscribers")
    .update(updatePayload)
    .eq("id", input.id);

  if (error) {
    throw new Error(formatError(error));
  }
}

export async function deleteSubscriber(input: { id: string }) {
  const supabase = getSupabaseAdminClient();

  if (!input.id) {
    throw new Error("Subscriber id is required.");
  }

  const { error } = await supabase.from("newsletter_subscribers").delete().eq("id", input.id);

  if (error) {
    throw new Error(formatError(error));
  }
}

export async function sendApprovedDealCampaign(input: { sendType: CampaignSendType }) {
  if (!hasResendEnv()) {
    throw new Error("Add RESEND_API_KEY and RESEND_FROM_EMAIL before sending live emails.");
  }

  const supabase = getSupabaseAdminClient();
  const { subscribers, deals } = await loadCampaignModel(input.sendType);

  if (deals.length === 0) {
    throw new Error(
      input.sendType === "flash"
        ? "There are no reviewed flash deals ready to send."
        : "There are no reviewed digest deals ready to send.",
    );
  }

  const matchedRecipients = matchRecipients(input.sendType, subscribers, deals);
  if (matchedRecipients.length === 0) {
    throw new Error("No active subscribers match the reviewed deals and saved route filters.");
  }

  const nowIso = new Date().toISOString();
  const routeLabels = unique(
    deals.map((deal) => formatDisplayRouteLabel(deal.routeLabel, deal.patternLabel)),
  ).slice(0, 8);
  const genericSubject =
    input.sendType === "flash" ? "+352 Flights flash alert" : "+352 Flights daily digest";
  const previewText = buildCampaignPreviewText(input.sendType, deals);

  const campaignInsert = await supabase
    .from("email_campaigns")
    .insert({
      send_type: input.sendType,
      subject: genericSubject,
      preview_text: previewText,
      from_email: process.env.RESEND_FROM_EMAIL ?? "",
      reply_to_email: process.env.RESEND_REPLY_TO_EMAIL ?? null,
      recipient_count: matchedRecipients.length,
      sent_count: 0,
      failed_count: 0,
      status: "sending",
      provider: "resend",
      deal_candidate_ids: deals.map((deal) => deal.id),
      route_labels: routeLabels,
      created_at: nowIso,
    })
    .select("id")
    .single();

  if (campaignInsert.error) {
    throw new Error(formatError(campaignInsert.error));
  }

  const campaignId = campaignInsert.data.id;
  const siteUrl = getSiteUrl();
  const results: Array<{
    subscriberId: string;
    email: string;
    subject: string;
    dealIds: string[];
    status: "sent" | "failed";
    providerMessageId: string | null;
    errorMessage: string | null;
    sentAt: string | null;
  }> = [];

  try {
    for (let index = 0; index < matchedRecipients.length; index += 5) {
      const chunk = matchedRecipients.slice(index, index + 5);
      const chunkResults = await Promise.all(
        chunk.map(async ({ subscriber, deals: matchedDeals }) => {
          const subject = buildCampaignSubject(input.sendType, matchedDeals, subscriber.preferredLocale);
          const preview = buildCampaignPreviewText(input.sendType, matchedDeals, subscriber.preferredLocale);
          const rendered = renderCampaignEmail({
            sendType: input.sendType,
            subject,
            previewText: preview,
            managePreferencesUrl: `${siteUrl}/preferences?token=${subscriber.preferenceToken}`,
            unsubscribeUrl: `${siteUrl}/unsubscribe?token=${subscriber.unsubscribeToken}`,
            deals: matchedDeals.map(toRenderableDeal),
            locale: subscriber.preferredLocale,
          });

          try {
            const providerMessageId = await sendResendEmail({
              to: subscriber.email,
              subject,
              html: rendered.html,
              text: rendered.text,
              emailType: "campaign",
              sendType: input.sendType,
              idempotencyKey: buildIdempotencyKey(
                input.sendType,
                subscriber.id,
                matchedDeals.map((deal) => deal.id),
              ),
            });

            return {
              subscriberId: subscriber.id,
              email: subscriber.email,
              subject,
              dealIds: matchedDeals.map((deal) => deal.id),
              status: "sent" as const,
              providerMessageId,
              errorMessage: null,
              sentAt: new Date().toISOString(),
            };
          } catch (error) {
            return {
              subscriberId: subscriber.id,
              email: subscriber.email,
              subject,
              dealIds: matchedDeals.map((deal) => deal.id),
              status: "failed" as const,
              providerMessageId: null,
              errorMessage: error instanceof Error ? error.message : "Email provider request failed.",
              sentAt: null,
            };
          }
        }),
      );

      const deliveryInsert = await supabase.from("email_deliveries").insert(
        chunkResults.map((result) => ({
          campaign_id: campaignId,
          subscriber_id: result.subscriberId,
          email: result.email,
          subject: result.subject,
          deal_candidate_ids: result.dealIds,
          status: result.status,
          provider_message_id: result.providerMessageId,
          error_message: result.errorMessage,
          sent_at: result.sentAt,
        })),
      );

      if (deliveryInsert.error) {
        throw new Error(formatError(deliveryInsert.error));
      }

      results.push(...chunkResults);
    }
  } catch (error) {
    await supabase
      .from("email_campaigns")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Campaign send failed.",
      })
      .eq("id", campaignId);

    throw error;
  }

  const sentCount = results.filter((result) => result.status === "sent").length;
  const failedCount = results.length - sentCount;
  const status =
    sentCount === 0 ? "failed" : failedCount === 0 ? "sent" : "partial";

  const campaignUpdate = await supabase
    .from("email_campaigns")
    .update({
      sent_count: sentCount,
      failed_count: failedCount,
      status,
      sent_at: sentCount > 0 ? new Date().toISOString() : null,
      error_message: failedCount > 0 ? `${failedCount} deliveries failed.` : null,
    })
    .eq("id", campaignId);

  if (campaignUpdate.error) {
    throw new Error(formatError(campaignUpdate.error));
  }

  if (sentCount > 0) {
    const dealUpdate = await supabase
      .from("deal_candidates")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .in(
        "id",
        unique(results.flatMap((result) => (result.status === "sent" ? result.dealIds : []))),
      );

    if (dealUpdate.error) {
      throw new Error(formatError(dealUpdate.error));
    }
  }

  return {
    campaignId,
    recipientCount: matchedRecipients.length,
    sentCount,
    failedCount,
    sendType: input.sendType,
  };
}

export async function sendCampaignTestEmail(input: {
  sendType: CampaignSendType;
  testEmail?: string | null;
}) {
  if (!hasResendEnv()) {
    throw new Error("Add RESEND_API_KEY and RESEND_FROM_EMAIL before sending live emails.");
  }

  const fallbackEmail = process.env.RESEND_REPLY_TO_EMAIL ?? null;
  const destination = input.testEmail?.trim() || fallbackEmail;
  if (!destination) {
    throw new Error("Add a test email in /ops or set RESEND_REPLY_TO_EMAIL first.");
  }

  const { subscribers, deals } = await loadCampaignModel(input.sendType);
  if (deals.length === 0) {
    throw new Error(
      input.sendType === "flash"
        ? "There are no reviewed flash deals to preview right now."
        : "There are no reviewed digest deals to preview right now.",
    );
  }

  const matchedRecipients = matchRecipients(input.sendType, subscribers, deals);
  const previewRecipient = matchedRecipients[0]?.subscriber ?? subscribers[0] ?? null;
  const previewDeals = matchedRecipients[0]?.deals ?? deals.slice(0, 3);
  const preview = buildPreviewRender(input.sendType, previewDeals, previewRecipient);

  await sendResendEmail({
    to: destination,
    subject: `[Test] ${preview.subject}`,
    html: preview.previewHtml,
    text: `${preview.previewText}\n\nThis is a test email from +352 Flights.`,
    emailType: "campaign_test",
    sendType: input.sendType,
    idempotencyKey: `lux-test-${input.sendType}-${destination}-${Date.now()}`,
  });

  return {
    sendType: input.sendType,
    email: destination,
  };
}

export async function sendOpsAutomatedAlertsEmail(input: { force?: boolean } = {}) {
  if (!hasResendEnv()) {
    return {
      status: "skipped" as const,
      reason: "Add RESEND_API_KEY and RESEND_FROM_EMAIL before sending ops alert emails.",
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

export async function updateDigestAutomation(input: {
  enabled: boolean;
  localTime: string;
  testEmail: string | null;
}) {
  const [hourString, minuteString] = input.localTime.split(":");
  const hour = Number(hourString);
  const minute = Number(minuteString);

  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error("Digest hour must be between 00 and 23.");
  }

  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error("Digest minute must be between 00 and 59.");
  }

  const supabase = getSupabaseAdminClient();
  const upsertQuery = await supabase.from("ops_automation_settings").upsert(
    {
      id: "default",
      daily_digest_enabled: input.enabled,
      daily_digest_hour: hour,
      daily_digest_minute: minute,
      test_email: input.testEmail?.trim() ? input.testEmail.trim() : null,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "id",
      ignoreDuplicates: false,
    },
  );

  if (upsertQuery.error) {
    throw new Error(formatError(upsertQuery.error));
  }

  return {
    enabled: input.enabled,
    localTime: formatTimeParts(hour, minute),
  };
}

export async function runScheduledDigest(input: { force?: boolean } = {}) {
  const opsAlerts = await sendOpsAutomatedAlertsEmail({ force: input.force }).catch((error) => ({
    status: "failed" as const,
    email: OPS_ALERT_RECIPIENT_EMAIL,
    reason: error instanceof Error ? error.message : "Ops alert email failed.",
  }));
  const automation = await loadAutomationSettings();
  const now = luxembourgParts(new Date());

  if (!input.force && !automation.enabled) {
    return {
      status: "skipped" as const,
      reason: "Daily digest automation is disabled in /ops.",
      opsAlerts,
    };
  }

  if (!input.force && timeToMinutes(now.time) < timeToMinutes(automation.localTime)) {
    return {
      status: "skipped" as const,
      reason: `Current Luxembourg time ${now.time} is still before scheduled digest time ${automation.localTime}.`,
      opsAlerts,
    };
  }

  if (!input.force && automation.lastDigestSentOn === now.date) {
    return {
      status: "skipped" as const,
      reason: `Digest already sent on ${automation.lastDigestSentOn}.`,
      opsAlerts,
    };
  }

  try {
    const result = await sendApprovedDealCampaign({ sendType: "digest" });
    const supabase = getSupabaseAdminClient();
    const updateQuery = await supabase
      .from("ops_automation_settings")
      .update({
        last_digest_sent_on: now.date,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "default");

    if (updateQuery.error) {
      throw new Error(formatError(updateQuery.error));
    }

    return {
      status: "sent" as const,
      ...result,
      localDate: now.date,
      localTime: now.time,
      opsAlerts,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scheduled digest failed.";
    if (
      message.includes("There are no reviewed digest deals") ||
      message.includes("No active subscribers match the reviewed deals")
    ) {
      return {
        status: "skipped" as const,
        reason: message,
        opsAlerts,
      };
    }

    throw error;
  }
}

export function validateCronSecret(secret: string | null) {
  if (!hasCronSecret()) {
    return false;
  }

  return secret === getCronSecret().CRON_SECRET;
}
