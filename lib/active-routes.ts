import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { formatAirlineSummary, normalizeAirlineNames } from "@/lib/airline-summary";
import { resolveScannerRoot } from "@/lib/local-scanner-status";
import {
  normalizeStayBucket,
  type StayBucketValue,
} from "@/lib/stay-buckets";
import { getSupabaseAdminClient } from "@/lib/supabase";

type RouteRow = {
  id: string;
  origin_airport: string;
  destination_airport: string;
  destination_city: string;
  bucket: string;
  max_stops: string;
  is_active: boolean;
};

type RouteSnapshotRow = {
  route_id: string;
  scanned_at: string;
  metadata: Record<string, unknown> | null;
};

type RouteServiceMonthRow = {
  route_id: string;
  month_start: string;
  routing: string;
  departure_dates: string[] | null;
  departure_weekdays: string[] | null;
  observed_patterns:
    | Array<{
        key: string;
        label: string;
        departure_weekday: string;
        return_weekday: string;
        trip_nights: number;
        count: number;
        sample_count?: number | null;
        calendar_count?: number | null;
        best_price: number | null;
      }>
    | null;
  sample_size: number;
  last_checked_at: string;
};

type RouteSearchRuleRow = {
  route_id: string;
  month_start: string;
  pattern_key: string;
  pattern_label: string;
  departure_weekday: string;
  return_weekday: string;
  trip_nights: number;
  max_stops: string;
  sort_order: number;
  is_active: boolean;
  source: string;
};

type RouteServiceChangeEventRow = {
  id: string;
  route_id: string;
  month_start: string;
  routing: string;
  summary: string;
  detected_at: string;
  is_acknowledged: boolean;
  previous_departure_weekdays: string[] | null;
  next_departure_weekdays: string[] | null;
  previous_pattern_keys: string[] | null;
  next_pattern_keys: string[] | null;
};

type CatalogRouteSeed = {
  origin_airport: string;
  destination_airport: string;
  max_stops: string;
};

type LatestPatternDiscoveryRouteState = {
  status: string;
  generatedAt: string | null;
  error: string | null;
};

const WEEKDAY_ORDER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

function parsePatternKey(patternKey: string) {
  const match = patternKey
    .trim()
    .toUpperCase()
    .match(
      /^(MON|TUE|WED|THU|FRI|SAT|SUN)(?:-(NEXT))?-(MON|TUE|WED|THU|FRI|SAT|SUN)$/,
    );

  if (!match) {
    return null;
  }

  const [, departureWeekday, nextMarker, returnWeekday] = match;
  return {
    departureWeekday,
    returnWeekday,
    spansNextWeek: nextMarker === "NEXT",
  };
}

function buildManualRuleRecordFromKey(
  patternKey: string,
  maxStops: string,
  source = "manual",
): ActiveRouteRule | null {
  const parsed = parsePatternKey(patternKey.replaceAll("_", "-"));
  if (!parsed) {
    return null;
  }

  const departureIndex = WEEKDAY_ORDER.indexOf(
    parsed.departureWeekday as (typeof WEEKDAY_ORDER)[number],
  );
  const returnIndex = WEEKDAY_ORDER.indexOf(
    parsed.returnWeekday as (typeof WEEKDAY_ORDER)[number],
  );

  if (departureIndex < 0 || returnIndex < 0) {
    return null;
  }

  const tripNights = parsed.spansNextWeek
    ? 7 - departureIndex + returnIndex
    : returnIndex - departureIndex;

  if (tripNights <= 0) {
    return null;
  }

  const departureLabel = parsed.departureWeekday[0] + parsed.departureWeekday.slice(1).toLowerCase();
  const returnLabel = parsed.returnWeekday[0] + parsed.returnWeekday.slice(1).toLowerCase();
  const key = parsed.spansNextWeek
    ? `${parsed.departureWeekday.toLowerCase()}-next-${parsed.returnWeekday.toLowerCase()}`
    : `${parsed.departureWeekday.toLowerCase()}-${parsed.returnWeekday.toLowerCase()}`;
  const label = parsed.spansNextWeek
    ? `${departureLabel} -> next ${returnLabel}`
    : `${departureLabel} -> ${returnLabel}`;

  return {
    key,
    label,
    departureWeekday: parsed.departureWeekday,
    returnWeekday: parsed.returnWeekday,
    tripNights,
    maxStops,
    source,
  };
}

type AutomaticRuleDraft = {
  departureWeekday: (typeof WEEKDAY_ORDER)[number];
  returnWeekday: (typeof WEEKDAY_ORDER)[number];
  spansNextWeek: boolean;
};

const AUTO_RULE_DRAFTS: AutomaticRuleDraft[] = [
  { departureWeekday: "THU", returnWeekday: "SUN", spansNextWeek: false },
  { departureWeekday: "THU", returnWeekday: "MON", spansNextWeek: true },
  { departureWeekday: "THU", returnWeekday: "FRI", spansNextWeek: true },
  { departureWeekday: "THU", returnWeekday: "SAT", spansNextWeek: true },
  { departureWeekday: "THU", returnWeekday: "SUN", spansNextWeek: true },
  { departureWeekday: "FRI", returnWeekday: "SUN", spansNextWeek: false },
  { departureWeekday: "FRI", returnWeekday: "MON", spansNextWeek: true },
  { departureWeekday: "FRI", returnWeekday: "FRI", spansNextWeek: true },
  { departureWeekday: "FRI", returnWeekday: "SAT", spansNextWeek: true },
  { departureWeekday: "FRI", returnWeekday: "SUN", spansNextWeek: true },
  { departureWeekday: "SAT", returnWeekday: "MON", spansNextWeek: true },
  { departureWeekday: "SAT", returnWeekday: "FRI", spansNextWeek: true },
  { departureWeekday: "SAT", returnWeekday: "SAT", spansNextWeek: true },
  { departureWeekday: "SAT", returnWeekday: "SUN", spansNextWeek: true },
  { departureWeekday: "SUN", returnWeekday: "FRI", spansNextWeek: true },
  { departureWeekday: "SUN", returnWeekday: "SAT", spansNextWeek: true },
  { departureWeekday: "SUN", returnWeekday: "SUN", spansNextWeek: true },
];

function nextMonthStartValue(monthStart: string) {
  const year = Number(monthStart.slice(0, 4));
  const month = Number(monthStart.slice(5, 7));
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

function buildAutomaticPatternKeysForMonth(
  monthWeekdays: string[],
  nextMonthWeekdays: string[],
  maxStops: string,
  existingPatternKeys: string[],
) {
  const nextSelection = new Set(existingPatternKeys);
  let addedCount = 0;
  const currentWeekdays = new Set(monthWeekdays);
  const nextWeekdays = new Set(nextMonthWeekdays);

  for (const draft of AUTO_RULE_DRAFTS) {
    const rule = buildManualRuleRecordFromKey(
      draft.spansNextWeek
        ? `${draft.departureWeekday}-NEXT-${draft.returnWeekday}`
        : `${draft.departureWeekday}-${draft.returnWeekday}`,
      maxStops,
      "manual",
    );
    if (!rule || nextSelection.has(rule.key)) {
      continue;
    }

    const hasDepartureWeekday = currentWeekdays.has(draft.departureWeekday);
    const hasReturnWeekday = draft.spansNextWeek
      ? currentWeekdays.has(draft.returnWeekday) || nextWeekdays.has(draft.returnWeekday)
      : currentWeekdays.has(draft.returnWeekday);

    if (!hasDepartureWeekday || !hasReturnWeekday) {
      continue;
    }

    nextSelection.add(rule.key);
    addedCount += 1;
  }

  return {
    patternKeys: Array.from(nextSelection).sort(),
    addedCount,
  };
}

export type ActiveRoutePatternCandidate = {
  key: string;
  label: string;
  departureWeekday: string;
  returnWeekday: string;
  tripNights: number;
  count: number;
  sampleCount: number;
  calendarCount: number;
  bestPrice: number | null;
};

export type ActiveRouteRule = {
  key: string;
  label: string;
  departureWeekday: string;
  returnWeekday: string;
  tripNights: number;
  maxStops: string;
  source: string;
};

export type ActiveRouteMonthSummary = {
  monthStart: string;
  monthLabel: string;
  routing: string;
  departureDates: string[];
  departureWeekdays: string[];
  detectedPatterns: ActiveRoutePatternCandidate[];
  activeRules: ActiveRouteRule[];
  activePatternKeys: string[];
  staleActiveRules: ActiveRouteRule[];
  sampleSize: number;
  lastCheckedAt: string | null;
};

export type ActiveRouteChangeAlert = {
  id: string;
  monthStart: string;
  monthLabel: string;
  routing: string;
  summary: string;
  detectedAt: string;
  previousDepartureWeekdays: string[];
  nextDepartureWeekdays: string[];
  previousPatternKeys: string[];
  nextPatternKeys: string[];
};

export type ActiveRouteLatestDiscovery = {
  status: string;
  generatedAt: string | null;
  error: string | null;
  showingOlderData: boolean;
};

export type ActiveRouteSummary = {
  id: string;
  routeIds: string[];
  originAirport: string;
  destinationAirport: string;
  destinationCity: string;
  label: string;
  bucket: string;
  stayBuckets: StayBucketValue[];
  maxStops: string;
  airlineSummary: string | null;
  isActive: boolean;
  months: ActiveRouteMonthSummary[];
  changeAlerts: ActiveRouteChangeAlert[];
  pendingChangeCount: number;
  latestDiscovery: ActiveRouteLatestDiscovery | null;
};

export type OpsActiveRoutesData = {
  configured: boolean;
  schemaReady: boolean;
  onboardingMessage: string | null;
  routes: ActiveRouteSummary[];
  totalChangeAlerts: number;
};

function formatError(error: unknown) {
  if (!error || typeof error !== "object") {
    return "Unknown error";
  }

  if ("message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "Unknown error";
}

function isMissingTableError(message: string) {
  return message.includes("schema cache") || message.includes("does not exist");
}

function formatMonthLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "Europe/Luxembourg",
  }).format(new Date(`${value}T00:00:00Z`));
}

function extractAirlineSummary(metadata: Record<string, unknown> | null) {
  return formatAirlineSummary(normalizeAirlineNames(metadata?.["airline_names"]));
}

function monthStartList(count: number) {
  const starts: string[] = [];
  const today = new Date();
  const luxToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Luxembourg",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(today);
  const year = Number(luxToday.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(luxToday.find((part) => part.type === "month")?.value ?? "1");

  for (let index = 0; index < count; index += 1) {
    const absoluteMonth = month - 1 + index;
    const nextYear = year + Math.floor(absoluteMonth / 12);
    const nextMonth = (absoluteMonth % 12) + 1;
    starts.push(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01`);
  }

  return starts;
}

function sortMonthStarts(values: Iterable<string>) {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function routeCatalogKey(originAirport: string, destinationAirport: string, maxStops: string) {
  return `${originAirport}:${destinationAirport}:${maxStops}`;
}

function activeRouteIdentity(route: Pick<RouteRow, "origin_airport" | "destination_airport" | "max_stops">) {
  return `${route.origin_airport}:${route.destination_airport}:${route.max_stops}`;
}

function parseIsoTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

async function readCurrentCatalogRouteKeys() {
  try {
    const contents = await readFile(path.join(process.cwd(), "data", "lux-routes.json"), "utf-8");
    const payload = JSON.parse(contents);
    if (!Array.isArray(payload)) {
      return null;
    }

    return new Set(
      payload
        .filter(isRecord)
        .filter(
          (item): item is CatalogRouteSeed =>
            typeof item.origin_airport === "string" &&
            typeof item.destination_airport === "string" &&
            typeof item.max_stops === "string",
        )
        .map((item) =>
          routeCatalogKey(item.origin_airport, item.destination_airport, item.max_stops),
        ),
    );
  } catch {
    return null;
  }
}

function extractLatestCompletedPatternDiscoveryReport(contents: string) {
  const lines = contents.split(/\r?\n/);
  const startIndexes: number[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].includes("Starting local route pattern discovery.")) {
      startIndexes.push(index);
    }
  }

  for (let startIndexOffset = startIndexes.length - 1; startIndexOffset >= 0; startIndexOffset -= 1) {
    const startIndex = startIndexes[startIndexOffset];
    let completionIndex = -1;

    for (let index = startIndex + 1; index < lines.length; index += 1) {
      if (
        lines[index].includes("Local route pattern discovery finished successfully.") ||
        lines[index].includes("Local route pattern discovery stopped from ops UI.")
      ) {
        completionIndex = index;
        break;
      }
    }

    if (completionIndex === -1) {
      continue;
    }

    let jsonStartIndex = -1;
    for (let index = startIndex + 1; index < completionIndex; index += 1) {
      if (lines[index].trim().startsWith("{")) {
        jsonStartIndex = index;
        break;
      }
    }

    if (jsonStartIndex === -1) {
      continue;
    }

    const rawJson = lines.slice(jsonStartIndex, completionIndex).join("\n").trim();
    try {
      const parsed = JSON.parse(rawJson);
      if (
        isRecord(parsed) &&
        Array.isArray(parsed.report) &&
        (typeof parsed.generated_at === "string" || parsed.generated_at === null || parsed.generated_at === undefined)
      ) {
        return {
          generatedAt: typeof parsed.generated_at === "string" ? parsed.generated_at : null,
          report: parsed.report,
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function readLatestPatternDiscoveryRouteStates() {
  const scannerRoot = await resolveScannerRoot();
  if (!scannerRoot) {
    return new Map<string, LatestPatternDiscoveryRouteState>();
  }

  try {
    const contents = await readFile(
      path.join(scannerRoot, "logs", "local-pattern-discovery.stdout.log"),
      "utf-8",
    );
    const latestReport = extractLatestCompletedPatternDiscoveryReport(contents);
    if (!latestReport) {
      return new Map<string, LatestPatternDiscoveryRouteState>();
    }

    const statuses = new Map<string, LatestPatternDiscoveryRouteState>();
    for (const item of latestReport.report) {
      if (!isRecord(item) || !isRecord(item.route)) {
        continue;
      }

      const route = item.route;
      if (
        typeof route.origin_airport !== "string" ||
        typeof route.destination_airport !== "string" ||
        typeof item.status !== "string"
      ) {
        continue;
      }

      const maxStops =
        typeof route.max_stops === "string"
          ? route.max_stops
          : typeof route.routing === "string"
            ? route.routing
            : null;
      if (!maxStops) {
        continue;
      }

      statuses.set(
        routeCatalogKey(route.origin_airport, route.destination_airport, maxStops),
        {
          status: item.status,
          generatedAt: latestReport.generatedAt,
          error: typeof item.error === "string" ? item.error : null,
        },
      );
    }

    return statuses;
  } catch {
    return new Map<string, LatestPatternDiscoveryRouteState>();
  }
}

export async function getOpsActiveRoutesData(): Promise<OpsActiveRoutesData> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      configured: false,
      schemaReady: false,
      onboardingMessage:
        "Supabase is not configured yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.",
      routes: [],
      totalChangeAlerts: 0,
    };
  }

  const supabase = getSupabaseAdminClient();
  const defaultMonths = monthStartList(9);

  const [currentCatalogKeys, latestDiscoveryStates, routesQuery, serviceMonthsQuery, changeEventsQuery] = await Promise.all([
    readCurrentCatalogRouteKeys(),
    readLatestPatternDiscoveryRouteStates(),
    supabase
      .from("scanned_routes")
      .select("id,origin_airport,destination_airport,destination_city,bucket,max_stops,is_active")
      .order("bucket")
      .order("destination_city"),
    supabase
      .from("route_service_months")
      .select(
        "route_id,month_start,routing,departure_dates,departure_weekdays,observed_patterns,sample_size,last_checked_at",
      )
      .order("month_start")
      .order("routing"),
    supabase
      .from("route_service_change_events")
      .select(
        "id,route_id,month_start,routing,summary,detected_at,is_acknowledged,previous_departure_weekdays,next_departure_weekdays,previous_pattern_keys,next_pattern_keys",
      )
      .eq("is_acknowledged", false)
      .order("detected_at", { ascending: false }),
  ]);

  const errors = [
    routesQuery.error ? formatError(routesQuery.error) : null,
    serviceMonthsQuery.error ? formatError(serviceMonthsQuery.error) : null,
    changeEventsQuery.error ? formatError(changeEventsQuery.error) : null,
  ].filter(Boolean) as string[];

  if (errors.length > 0) {
    const message = errors[0];
    return {
      configured: true,
      schemaReady: false,
      onboardingMessage: isMissingTableError(message)
        ? "Supabase is reachable, but the new Active Routes tables are not created yet. Re-run supabase/schema.sql in the SQL Editor."
        : `Supabase responded with an error: ${message}`,
      routes: [],
      totalChangeAlerts: 0,
    };
  }

  const rawRoutes = (routesQuery.data ?? []) as RouteRow[];
  const routes = rawRoutes.filter((route) =>
    currentCatalogKeys
      ? currentCatalogKeys.has(
          routeCatalogKey(route.origin_airport, route.destination_airport, route.max_stops),
        )
      : true,
  );
  const groupedRoutes = Array.from(
    routes.reduce((map, route) => {
      const key = activeRouteIdentity(route);
      const bucket = map.get(key) ?? [];
      bucket.push(route);
      map.set(key, bucket);
      return map;
    }, new Map<string, RouteRow[]>()),
  ).map(([, groupRoutes]) => {
    const primaryRoute =
      groupRoutes.find((route) => normalizeStayBucket(route.bucket) === "weekend") ?? groupRoutes[0];
    const stayBuckets = Array.from(
      new Set(
        groupRoutes
          .map((route) => normalizeStayBucket(route.bucket))
          .filter(Boolean),
      ),
    ) as StayBucketValue[];

    return {
      primaryRoute,
      groupRoutes,
      stayBuckets,
    };
  });
  const routeIds = routes.map((route) => route.id);
  const searchRules: RouteSearchRuleRow[] = [];
  if (routeIds.length > 0) {
    const pageSize = 1000;
    let from = 0;

    while (true) {
      const searchRulesPageQuery = await supabase
        .from("route_search_rules")
        .select(
          "route_id,month_start,pattern_key,pattern_label,departure_weekday,return_weekday,trip_nights,max_stops,sort_order,is_active,source",
        )
        .in("route_id", routeIds)
        .eq("is_active", true)
        .order("month_start")
        .order("sort_order")
        .range(from, from + pageSize - 1);

      if (searchRulesPageQuery.error) {
        const message = formatError(searchRulesPageQuery.error);
        return {
          configured: true,
          schemaReady: false,
          onboardingMessage: isMissingTableError(message)
            ? "Supabase is reachable, but the new Active Routes tables are not created yet. Re-run supabase/schema.sql in the SQL Editor."
            : `Supabase responded with an error: ${message}`,
          routes: [],
          totalChangeAlerts: 0,
        };
      }

      const pageRows = (searchRulesPageQuery.data ?? []) as RouteSearchRuleRow[];
      searchRules.push(...pageRows);

      if (pageRows.length < pageSize) {
        break;
      }

      from += pageSize;
    }
  }
  const snapshotQuery =
    routeIds.length === 0
      ? { data: [] as RouteSnapshotRow[], error: null }
      : await supabase
          .from("price_snapshots")
          .select("route_id,scanned_at,metadata")
          .in("route_id", routeIds)
          .order("scanned_at", { ascending: false });

  if (snapshotQuery.error) {
    const message = formatError(snapshotQuery.error);
    return {
      configured: true,
      schemaReady: false,
      onboardingMessage: isMissingTableError(message)
        ? "Supabase is reachable, but the new Active Routes tables are not created yet. Re-run supabase/schema.sql in the SQL Editor."
        : `Supabase responded with an error: ${message}`,
      routes: [],
      totalChangeAlerts: 0,
    };
  }

  const serviceMonths = (serviceMonthsQuery.data ?? []) as RouteServiceMonthRow[];
  const changeEvents = (changeEventsQuery.data ?? []) as RouteServiceChangeEventRow[];
  const snapshots = (snapshotQuery.data ?? []) as RouteSnapshotRow[];

  const serviceMonthMap = new Map<string, RouteServiceMonthRow>();
  for (const row of serviceMonths) {
    serviceMonthMap.set(`${row.route_id}:${row.month_start}:${row.routing}`, row);
  }

  const latestAirlineSummaryByRoute = new Map<string, string | null>();
  for (const snapshot of snapshots) {
    if (latestAirlineSummaryByRoute.has(snapshot.route_id)) {
      continue;
    }

    latestAirlineSummaryByRoute.set(snapshot.route_id, extractAirlineSummary(snapshot.metadata));
  }

  const searchRuleMap = new Map<string, ActiveRouteRule[]>();
  for (const row of searchRules) {
    const key = `${row.route_id}:${row.month_start}`;
    const bucket = searchRuleMap.get(key) ?? [];
    bucket.push({
      key: row.pattern_key,
      label: row.pattern_label,
      departureWeekday: row.departure_weekday,
      returnWeekday: row.return_weekday,
      tripNights: row.trip_nights,
      maxStops: row.max_stops,
      source: row.source,
    });
    searchRuleMap.set(key, bucket);
  }

  const changeEventMap = new Map<string, ActiveRouteChangeAlert[]>();
  for (const event of changeEvents) {
    const bucket = changeEventMap.get(event.route_id) ?? [];
    bucket.push({
      id: event.id,
      monthStart: event.month_start,
      monthLabel: formatMonthLabel(event.month_start),
      routing: event.routing,
      summary: event.summary,
      detectedAt: event.detected_at,
      previousDepartureWeekdays: event.previous_departure_weekdays ?? [],
      nextDepartureWeekdays: event.next_departure_weekdays ?? [],
      previousPatternKeys: event.previous_pattern_keys ?? [],
      nextPatternKeys: event.next_pattern_keys ?? [],
    });
    changeEventMap.set(event.route_id, bucket);
  }

  return {
    configured: true,
    schemaReady: true,
    onboardingMessage: null,
    totalChangeAlerts: groupedRoutes.reduce(
      (total, group) =>
        total +
        group.groupRoutes.reduce(
          (innerTotal, route) =>
            innerTotal +
            ((changeEventMap.get(route.id) ?? []).filter((alert) => alert.routing === route.max_stops)
              .length),
          0,
        ),
      0,
    ),
    routes: groupedRoutes.map(({ primaryRoute, groupRoutes, stayBuckets }) => {
      const routeLabel = `${primaryRoute.origin_airport} -> ${primaryRoute.destination_airport} (${primaryRoute.destination_city})`;
      const routeMonthStarts = sortMonthStarts([
        ...groupRoutes.flatMap((route) =>
          serviceMonths
            .filter((row) => row.route_id === route.id)
            .map((row) => row.month_start),
        ),
        ...groupRoutes.flatMap((route) =>
          searchRules
            .filter((row) => row.route_id === route.id)
            .map((row) => row.month_start),
        ),
        ...groupRoutes.flatMap((route) =>
          changeEvents
            .filter((event) => event.route_id === route.id)
            .map((event) => event.month_start),
        ),
      ]);
      const monthStartsForRoute = routeMonthStarts.length > 0 ? routeMonthStarts : defaultMonths;
      const monthsForRoute = monthStartsForRoute.map((monthStart) => {
        const detectedCandidates = groupRoutes
          .map((route) => serviceMonthMap.get(`${route.id}:${monthStart}:${route.max_stops}`) ?? null)
          .filter(Boolean) as RouteServiceMonthRow[];
        const detected =
          detectedCandidates.sort((left, right) => {
            const leftTime = parseIsoTimestamp(left.last_checked_at) ?? 0;
            const rightTime = parseIsoTimestamp(right.last_checked_at) ?? 0;
            return rightTime - leftTime;
          })[0] ?? null;
        const detectedPatterns = (detected?.observed_patterns ?? []).map((pattern) => ({
          key: pattern.key,
          label: pattern.label,
          departureWeekday: pattern.departure_weekday,
          returnWeekday: pattern.return_weekday,
          tripNights: pattern.trip_nights,
          count: Number(pattern.count ?? pattern.sample_count ?? 0),
          sampleCount: Number(pattern.sample_count ?? pattern.count ?? 0),
          calendarCount: Number(pattern.calendar_count ?? 0),
          bestPrice: pattern.best_price,
        }));
        const activeRules = Array.from(
          new Map(
            groupRoutes
              .flatMap((route) => searchRuleMap.get(`${route.id}:${monthStart}`) ?? [])
              .map((rule) => [rule.key, rule]),
          ).values(),
        );
        const detectedKeys = new Set(detectedPatterns.map((pattern) => pattern.key));
        const staleActiveRules = activeRules.filter((rule) => !detectedKeys.has(rule.key));

        return {
          monthStart,
          monthLabel: formatMonthLabel(monthStart),
          routing: detected?.routing ?? primaryRoute.max_stops,
          departureDates: detected?.departure_dates ?? [],
          departureWeekdays: detected?.departure_weekdays ?? [],
          detectedPatterns,
          activeRules,
          activePatternKeys: activeRules.map((rule) => rule.key),
          staleActiveRules,
          sampleSize: detected?.sample_size ?? 0,
          lastCheckedAt: detected?.last_checked_at ?? null,
        };
      });

      const routeChangeAlerts = groupRoutes
        .flatMap((route) => changeEventMap.get(route.id) ?? [])
        .filter((alert) => alert.routing === primaryRoute.max_stops);
      const latestDiscoveryCandidates = groupRoutes
        .map((route) =>
          latestDiscoveryStates.get(
            routeCatalogKey(route.origin_airport, route.destination_airport, route.max_stops),
          ) ?? null,
        )
        .filter(Boolean) as LatestPatternDiscoveryRouteState[];
      const latestDiscovery =
        latestDiscoveryCandidates.sort((left, right) => {
          const leftTime = parseIsoTimestamp(left.generatedAt) ?? 0;
          const rightTime = parseIsoTimestamp(right.generatedAt) ?? 0;
          return rightTime - leftTime;
        })[0] ?? null;
      const latestMonthCheckedAt = monthsForRoute.reduce<string | null>((latest, month) => {
        if (!month.lastCheckedAt) {
          return latest;
        }

        if (!latest) {
          return month.lastCheckedAt;
        }

        return parseIsoTimestamp(month.lastCheckedAt)! > parseIsoTimestamp(latest)!
          ? month.lastCheckedAt
          : latest;
      }, null);
      const latestDiscoveryGeneratedAtMs = parseIsoTimestamp(latestDiscovery?.generatedAt ?? null);
      const latestMonthCheckedAtMs = parseIsoTimestamp(latestMonthCheckedAt);

      return {
        id: primaryRoute.id,
        routeIds: groupRoutes.map((route) => route.id),
        originAirport: primaryRoute.origin_airport,
        destinationAirport: primaryRoute.destination_airport,
        destinationCity: primaryRoute.destination_city,
        label: routeLabel,
        bucket: stayBuckets[0] ?? "weekend",
        stayBuckets,
        maxStops: primaryRoute.max_stops,
        airlineSummary:
          groupRoutes
            .map((route) => latestAirlineSummaryByRoute.get(route.id) ?? null)
            .find(Boolean) ?? null,
        isActive: groupRoutes.some((route) => route.is_active),
        months: monthsForRoute,
        changeAlerts: routeChangeAlerts,
        pendingChangeCount: routeChangeAlerts.length,
        latestDiscovery: latestDiscovery
          ? {
              status: latestDiscovery.status,
              generatedAt: latestDiscovery.generatedAt,
              error: latestDiscovery.error,
              showingOlderData:
                latestDiscovery.status === "service_calendar_error" &&
                (latestMonthCheckedAtMs === null ||
                  (latestDiscoveryGeneratedAtMs !== null &&
                    latestMonthCheckedAtMs < latestDiscoveryGeneratedAtMs - 1000)),
            }
          : null,
      };
    }),
  };
}

export async function saveRouteMonthSearchRules(input: {
  routeId: string;
  monthStart: string;
  patternKeys: string[];
}) {
  const supabase = getSupabaseAdminClient();
  const routeId = input.routeId.trim();
  const monthStart = input.monthStart.trim();
  const patternKeys = Array.from(new Set(input.patternKeys.filter(Boolean)));

  if (!routeId || !monthStart) {
    throw new Error("Missing route or month.");
  }

  const routeQuery = await supabase
    .from("scanned_routes")
    .select("id,origin_airport,destination_airport,max_stops")
    .eq("id", routeId)
    .maybeSingle();

  if (routeQuery.error) {
    throw new Error(formatError(routeQuery.error));
  }
  if (!routeQuery.data) {
    throw new Error("Route not found.");
  }

  const route = routeQuery.data;
  const groupedRoutesQuery = await supabase
    .from("scanned_routes")
    .select("id,max_stops")
    .eq("origin_airport", route.origin_airport)
    .eq("destination_airport", route.destination_airport)
    .eq("max_stops", route.max_stops);

  if (groupedRoutesQuery.error) {
    throw new Error(formatError(groupedRoutesQuery.error));
  }

  const targetRoutes = (groupedRoutesQuery.data ?? []).length > 0
    ? groupedRoutesQuery.data
    : [{ id: route.id, max_stops: route.max_stops }];
  const selectedRules = patternKeys
    .map((patternKey) => buildManualRuleRecordFromKey(patternKey, route.max_stops))
    .filter((rule): rule is ActiveRouteRule => rule !== null);

  for (const targetRoute of targetRoutes) {
    const deleteResponse = await supabase
      .from("route_search_rules")
      .delete()
      .eq("route_id", targetRoute.id)
      .eq("month_start", monthStart);

    if (deleteResponse.error) {
      throw new Error(formatError(deleteResponse.error));
    }
  }

  if (selectedRules.length === 0) {
    return;
  }

  const insertResponse = await supabase.from("route_search_rules").insert(
    targetRoutes.flatMap((targetRoute) =>
      selectedRules.map((rule, index) => ({
        route_id: targetRoute.id,
        month_start: monthStart,
        pattern_key: rule.key,
        pattern_label: rule.label,
        departure_weekday: rule.departureWeekday,
        return_weekday: rule.returnWeekday,
        trip_nights: rule.tripNights,
        max_stops: targetRoute.max_stops,
        sort_order: index,
        source: "manual",
        is_active: true,
      })),
    ),
  );

  if (insertResponse.error) {
    throw new Error(formatError(insertResponse.error));
  }
}

export async function saveRoutePlannerSearchRules(input: {
  routeId: string;
  months: Array<{
    monthStart: string;
    patternKeys: string[];
  }>;
}) {
  const supabase = getSupabaseAdminClient();
  const routeId = input.routeId.trim();
  const months = input.months
    .map((month) => ({
      monthStart: month.monthStart.trim(),
      patternKeys: Array.from(new Set(month.patternKeys.filter(Boolean))),
    }))
    .filter((month) => month.monthStart);

  if (!routeId || months.length === 0) {
    throw new Error("Missing route or planner months.");
  }

  const monthStarts = months.map((month) => month.monthStart);

  const routeQuery = await supabase
    .from("scanned_routes")
    .select("id,origin_airport,destination_airport,max_stops")
    .eq("id", routeId)
    .maybeSingle();

  if (routeQuery.error) {
    throw new Error(formatError(routeQuery.error));
  }
  if (!routeQuery.data) {
    throw new Error("Route not found.");
  }

  const route = routeQuery.data;
  const groupedRoutesQuery = await supabase
    .from("scanned_routes")
    .select("id,max_stops")
    .eq("origin_airport", route.origin_airport)
    .eq("destination_airport", route.destination_airport)
    .eq("max_stops", route.max_stops);

  if (groupedRoutesQuery.error) {
    throw new Error(formatError(groupedRoutesQuery.error));
  }

  const targetRoutes = (groupedRoutesQuery.data ?? []).length > 0
    ? groupedRoutesQuery.data
    : [{ id: route.id, max_stops: route.max_stops }];

  for (const targetRoute of targetRoutes) {
    const deleteResponse = await supabase
      .from("route_search_rules")
      .delete()
      .eq("route_id", targetRoute.id)
      .in("month_start", monthStarts);

    if (deleteResponse.error) {
      throw new Error(formatError(deleteResponse.error));
    }
  }

  const rowsToInsert = months.flatMap((month) => {
    const selectedRules = month.patternKeys
      .map((patternKey) => buildManualRuleRecordFromKey(patternKey, route.max_stops))
      .filter((rule): rule is ActiveRouteRule => rule !== null);

    return targetRoutes.flatMap((targetRoute) =>
      selectedRules.map((rule, index) => ({
        route_id: targetRoute.id,
        month_start: month.monthStart,
        pattern_key: rule.key,
        pattern_label: rule.label,
        departure_weekday: rule.departureWeekday,
        return_weekday: rule.returnWeekday,
        trip_nights: rule.tripNights,
        max_stops: targetRoute.max_stops,
        sort_order: index,
        source: "manual",
        is_active: true,
      })),
    );
  });

  if (rowsToInsert.length === 0) {
    return;
  }

  const insertResponse = await supabase.from("route_search_rules").insert(rowsToInsert);

  if (insertResponse.error) {
    throw new Error(formatError(insertResponse.error));
  }
}

export async function createAutomaticRoutePlannerSearchRules(input: { routeId: string }) {
  const supabase = getSupabaseAdminClient();
  const routeId = input.routeId.trim();

  if (!routeId) {
    throw new Error("Missing route for automatic rules.");
  }

  const routeQuery = await supabase
    .from("scanned_routes")
    .select("id,origin_airport,destination_airport,max_stops")
    .eq("id", routeId)
    .maybeSingle();

  if (routeQuery.error) {
    throw new Error(formatError(routeQuery.error));
  }
  if (!routeQuery.data) {
    throw new Error("Route not found.");
  }

  const route = routeQuery.data;
  const groupedRoutesQuery = await supabase
    .from("scanned_routes")
    .select("id,max_stops")
    .eq("origin_airport", route.origin_airport)
    .eq("destination_airport", route.destination_airport)
    .eq("max_stops", route.max_stops);

  if (groupedRoutesQuery.error) {
    throw new Error(formatError(groupedRoutesQuery.error));
  }

  const targetRoutes = (groupedRoutesQuery.data ?? []).length > 0
    ? groupedRoutesQuery.data
    : [{ id: route.id, max_stops: route.max_stops }];
  const targetRouteIds = targetRoutes.map((targetRoute) => targetRoute.id);

  const [serviceMonthsQuery, searchRulesQuery] = await Promise.all([
    supabase
      .from("route_service_months")
      .select("route_id,month_start,departure_weekdays,routing")
      .in("route_id", targetRouteIds)
      .order("month_start"),
    supabase
      .from("route_search_rules")
      .select("route_id,month_start,pattern_key")
      .in("route_id", targetRouteIds)
      .eq("is_active", true)
      .order("month_start")
      .order("pattern_key"),
  ]);

  if (serviceMonthsQuery.error) {
    throw new Error(formatError(serviceMonthsQuery.error));
  }
  if (searchRulesQuery.error) {
    throw new Error(formatError(searchRulesQuery.error));
  }

  const serviceMonths = serviceMonthsQuery.data ?? [];
  const searchRules = searchRulesQuery.data ?? [];
  const monthStarts = sortMonthStarts([
    ...serviceMonths.map((month) => month.month_start),
    ...searchRules.map((rule) => rule.month_start),
  ]);

  if (monthStarts.length === 0) {
    return {
      routeId,
      months: [] as Array<{ monthStart: string; patternKeys: string[] }>,
      monthsUpdated: 0,
      rulesAdded: 0,
    };
  }

  let monthsUpdated = 0;
  let rulesAdded = 0;
  const months = monthStarts.map((monthStart) => {
    const nextMonthStart = nextMonthStartValue(monthStart);
    const monthWeekdays = Array.from(
      new Set(
        serviceMonths
          .filter((month) => month.month_start === monthStart)
          .flatMap((month) => month.departure_weekdays ?? []),
      ),
    ).sort();
    const nextMonthWeekdays = Array.from(
      new Set(
        serviceMonths
          .filter((month) => month.month_start === nextMonthStart)
          .flatMap((month) => month.departure_weekdays ?? []),
      ),
    ).sort();
    const existingPatternKeys = Array.from(
      new Set(
        searchRules
          .filter((rule) => rule.month_start === monthStart)
          .map((rule) => rule.pattern_key),
      ),
    ).sort();

    const generated = buildAutomaticPatternKeysForMonth(
      monthWeekdays,
      nextMonthWeekdays,
      route.max_stops,
      existingPatternKeys,
    );

    if (generated.addedCount > 0) {
      monthsUpdated += 1;
      rulesAdded += generated.addedCount;
    }

    return {
      monthStart,
      patternKeys: generated.patternKeys,
    };
  });

  await saveRoutePlannerSearchRules({
    routeId,
    months,
  });

  return {
    routeId,
    months,
    monthsUpdated,
    rulesAdded,
  };
}

export async function createAutomaticRoutePlannerSearchRulesForRoutes(input: {
  routeIds: string[];
}) {
  const routeIds = Array.from(new Set(input.routeIds.map((routeId) => routeId.trim()).filter(Boolean)));
  const results = [];

  for (const routeId of routeIds) {
    results.push(await createAutomaticRoutePlannerSearchRules({ routeId }));
  }

  return results;
}
