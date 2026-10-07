import "server-only";
import { normalizeAirlineNames } from "@/lib/airline-summary";
import { getSiteUrl, hasCronSecret } from "@/lib/env";
import {
  type DigestAutomationSummary,
  type FarePricePosition,
} from "@/lib/ops-shared";
import {
  type DeliveryModeValue,
  defaultPreferenceValues,
  type MaxStopsPreferenceValue,
  type WeekdayValue,
} from "@/lib/preferences-shared";
import { deriveStayBucketFromNights } from "@/lib/stay-buckets";
import { getSupabaseAdminClient } from "@/lib/supabase";
import {
  type CountResult,
  type OpsAutomatedAlertsSummary,
  type RouteRow,
  type ScannerHealthSummary,
  type SupabaseReadResult,
} from "@/lib/ops/types";

export const DEAL_AUTO_EXPIRE_DAYS = 4;

// Keep the last successful scan visible through short scanner outages.
export const PUBLIC_FARE_LOOKBACK_DAYS = 7;

export const PUBLIC_FARE_REVALIDATION_ENABLED =
  process.env.PUBLIC_FARE_REVALIDATION_ENABLED === "true";

export const PUBLIC_SNAPSHOT_SOURCE = PUBLIC_FARE_REVALIDATION_ENABLED
  ? "public_current_fare_snapshots"
  : "price_snapshots";

export const PUBLIC_FARES_PER_DESTINATION = 3;

export const PUBLIC_SEARCH_FARES_PER_DESTINATION = 24;

export const PUBLIC_ALL_FARES_PER_DESTINATION = null;

export const PUBLIC_FARE_MIN_HISTORY_POINTS = 3;

export const PUBLIC_FARE_HISTORY_LIMIT = 45;

export const SUPABASE_READ_RETRY_DELAYS_MS = [200, 700] as const;

export const EDITORIAL_DEAL_MAX_DROP_RATIO = 0.85;

export const PUBLIC_EXCEPTIONAL_PRICE_RATIO = 0.85;

export const PUBLIC_BELOW_USUAL_PRICE_RATIO = 0.95;

export const PUBLIC_TYPICAL_PRICE_RATIO = 1.05;

export async function autoExpireStaleDeals() {
  const supabase = getSupabaseAdminClient();
  const cutoffIso = new Date(
    Date.now() - DEAL_AUTO_EXPIRE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
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

export async function fetchPagedSnapshots<T extends Record<string, unknown>>(
  buildPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const batch = await Promise.all(
      Array.from({ length: 4 }, (_, pageIndex) => {
        const pageFrom = from + pageIndex * pageSize;
        return readSupabaseWithRetry(() =>
          buildPage(pageFrom, pageFrom + pageSize - 1),
        );
      }),
    );
    const failedPage = batch.find((query) => query.error);
    if (failedPage?.error) {
      return {
        data: [] as T[],
        error: formatError(failedPage.error),
      };
    }

    const pageRows = batch.map((query) => (query.data ?? []) as T[]);
    for (const page of pageRows) {
      rows.push(...page);
      if (page.length < pageSize) {
        return {
          data: rows,
          error: null as string | null,
        };
      }
    }

    if (pageRows.some((page) => page.length < pageSize)) {
      break;
    }

    from += pageSize * batch.length;
  }

  return {
    data: rows,
    error: null as string | null,
  };
}

export function isTransientSupabaseReadError(error: unknown) {
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

export function waitForRetry(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export async function readSupabaseWithRetry<T>(
  buildQuery: () => PromiseLike<SupabaseReadResult<T>>,
): Promise<SupabaseReadResult<T>> {
  let lastError: unknown = null;

  for (
    let attempt = 0;
    attempt <= SUPABASE_READ_RETRY_DELAYS_MS.length;
    attempt += 1
  ) {
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

export const SCANNER_HEALTH_LOG_META_MARKER = " ||meta|| ";

export function formatError(error: unknown) {
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

export function isMissingTableError(message: string) {
  return message.includes("schema cache") || message.includes("does not exist");
}

export function makeRouteKey(
  destinationAirport: string,
  _bucket?: string | null,
) {
  return destinationAirport;
}

export function normalizeDeliveryModes(
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

export function normalizeMaxStopsPreferences(
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

export function normalizeDepartureWeekdays(
  values: WeekdayValue[] | null | undefined,
) {
  if (values && values.length > 0) {
    return unique(values);
  }

  return [...defaultPreferenceValues.departureWeekdays];
}

export function normalizeComfortHour(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (value < 0 || value > 23) {
    return null;
  }

  return Math.trunc(value);
}

export function normalizeMinDestinationStayHours(
  value: number | null | undefined,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (value <= 0 || value > 336) {
    return null;
  }

  return Math.trunc(value);
}

export function unique<T>(values: T[]) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

export function weekdayForDate(value: string | null) {
  if (!value) {
    return null;
  }

  const day = new Date(`${value}T00:00:00Z`).getUTCDay();
  const mapping: WeekdayValue[] = [
    "SUN",
    "MON",
    "TUE",
    "WED",
    "THU",
    "FRI",
    "SAT",
  ];
  return mapping[day] ?? null;
}

export function luxembourgParts(value: Date = new Date()) {
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

export function formatTimeParts(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function defaultDigestAutomationSummary(): DigestAutomationSummary {
  const siteUrl = getSiteUrl();
  return {
    enabled: false,
    weeklyEnabled: true,
    lastWeeklySentOn: null,
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

export function defaultScannerHealthSummary(): ScannerHealthSummary {
  return {
    latestRun: null,
    latestRunAt: null,
    previousRunAt: null,
    recentRunCount: 0,
    activeRoutes: 0,
    routesPlannedInLatestRun: 0,
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

export function defaultOpsAutomatedAlertsSummary(): OpsAutomatedAlertsSummary {
  return {
    generatedAt: new Date().toISOString(),
    total: 0,
    critical: 0,
    warning: 0,
    items: [],
  };
}

export function extractAirlineNames(
  metadata: Record<string, unknown> | null | undefined,
) {
  return normalizeAirlineNames(metadata?.["airline_names"]);
}

export function extractPrimaryAirlineCode(
  metadata: Record<string, unknown> | null | undefined,
) {
  const directCode = metadata?.["primary_airline_code"];
  const airlineCodes = metadata?.["airline_codes"];
  const candidate =
    typeof directCode === "string"
      ? directCode
      : Array.isArray(airlineCodes)
        ? airlineCodes.find(
            (value): value is string => typeof value === "string",
          )
        : null;
  const normalized = candidate?.trim().toUpperCase() ?? "";

  return /^[A-Z0-9]{2,3}$/.test(normalized) ? normalized : null;
}

export function extractPatternKey(
  metadata: Record<string, unknown> | null | undefined,
) {
  const value = metadata?.["pattern_key"];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function extractPatternLabel(
  metadata: Record<string, unknown> | null | undefined,
) {
  const value = metadata?.["pattern_label"];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function extractMetadataDateTime(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function extractDestinationStayHours(
  metadata: Record<string, unknown> | null | undefined,
) {
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

export function hasShortDestinationStay(
  metadata: Record<string, unknown> | null | undefined,
) {
  const stayHours = extractDestinationStayHours(metadata);
  return stayHours !== null && stayHours < 24;
}

export function extractMetadataNumber(
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

export function extractStopCount(
  metadata: Record<string, unknown> | null | undefined,
  key: "outbound_stop_count" | "return_stop_count",
) {
  const value = extractMetadataNumber(metadata, key);
  return value !== null && value >= 0 ? Math.trunc(value) : null;
}

export function medianPrice(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function classifyFarePrice(
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

export function buildSeriesKey(routeId: string, patternKey: string | null) {
  return `${routeId}:${patternKey ?? "legacy"}`;
}

export function formatDisplayRouteLabel(
  routeLabel: string,
  patternLabel: string | null,
) {
  return patternLabel ? `${routeLabel} · ${patternLabel}` : routeLabel;
}

export function formatSkyscannerDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${year.slice(2)}${month}${day}`;
}

export function toSkyscannerPlace(code: string) {
  const cityOverrides: Record<string, string> = {
    LHR: "lond",
    LGW: "lond",
  };

  return cityOverrides[code.toUpperCase()] ?? code.toLowerCase();
}

export function buildSkyscannerUrl(input: {
  originAirport: string | null | undefined;
  destinationAirport: string | null | undefined;
  departureDate: string | null | undefined;
  returnDate: string | null | undefined;
  maxStops: string;
}) {
  if (
    !input.originAirport ||
    !input.destinationAirport ||
    !input.departureDate ||
    !input.returnDate
  ) {
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

  return (
    [
      "https://www.skyscanner.net/transport/vols",
      toSkyscannerPlace(input.originAirport),
      toSkyscannerPlace(input.destinationAirport),
      formatSkyscannerDate(input.departureDate),
      formatSkyscannerDate(input.returnDate),
    ].join("/") + `/?${params.toString()}`
  );
}

export async function countTable(
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

export async function countEditorialDeals(
  status: "new" | "reviewed",
): Promise<CountResult> {
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

export function buildRouteMap(routes: RouteRow[]) {
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

export function opsConfigurationMessage() {
  return "Supabase is not configured yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.";
}

export function opsQueryMessage(message: string) {
  return isMissingTableError(message)
    ? "Supabase is reachable, but the latest tables are not created yet. Re-run supabase/schema.sql and then supabase/seed.sql in the SQL Editor."
    : `Supabase responded with an error: ${message}`;
}
