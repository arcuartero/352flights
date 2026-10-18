import "server-only";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getSiteUrl } from "@/lib/env";
import { deriveStayBucketFromNights } from "@/lib/stay-buckets";
import {
  SCANNER_HEALTH_LOG_META_MARKER,
  buildRouteMap,
  buildSkyscannerUrl,
  defaultScannerHealthSummary,
  hasShortDestinationStay,
  unique,
} from "@/lib/ops/shared";
import {
  type OpsAutomatedAlert,
  type OpsAutomatedAlertsSummary,
  type RouteRow,
  type ScannerHealthAlert,
  type ScannerHealthLoggedIssue,
  type ScannerHealthRuleRow,
  type ScannerHealthRun,
  type ScannerHealthRunRow,
  type ScannerHealthServiceMonthRow,
  type ScannerHealthSummary,
  type ScannerSyncFailure,
  type SnapshotRow,
} from "@/lib/ops/types";

export const SCANNER_HEALTH_LOOKAHEAD_START_DAYS = 3;

export const SCANNER_HEALTH_LOOKAHEAD_END_DAYS = 250;

export const OPS_SCANNER_STALE_WARNING_HOURS = 30;

export const OPS_SCANNER_STALE_CRITICAL_HOURS = 48;

export const OPS_SYNC_FAILURE_LOOKBACK_HOURS = 24;

export const OPS_ALERT_RECIPIENT_EMAIL = "arcuartero@gmail.com";

export const HEALTH_WEEKDAY_CODES = [
  "SUN",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
] as const;

export function parseIsoDateUtc(value: string) {
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

export function formatIsoDateUtc(value: Date) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function weekdayCodeForIsoDate(value: string) {
  const parsed = parseIsoDateUtc(value);
  if (!parsed) {
    return null;
  }

  return HEALTH_WEEKDAY_CODES[parsed.getUTCDay()] ?? null;
}

export function addDaysToIsoDate(value: string, days: number) {
  const parsed = parseIsoDateUtc(value);
  if (!parsed) {
    return null;
  }

  parsed.setUTCDate(parsed.getUTCDate() + days);
  return formatIsoDateUtc(parsed);
}

export async function pathExists(targetPath: string) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readTextIfExists(targetPath: string) {
  if (!(await pathExists(targetPath))) {
    return "";
  }

  return readFile(targetPath, "utf-8");
}

export function parseScannerHealthLogTimestamp(raw: string) {
  const match = raw.match(
    /^\[(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(Z?)\]\s*(.*)$/,
  );
  if (!match) {
    return null;
  }

  const [, calendarDate, clockTime, utcSuffix, message] = match;
  const parsed = new Date(
    utcSuffix === "Z"
      ? `${calendarDate}T${clockTime}Z`
      : `${calendarDate}T${clockTime}`,
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

export function parseScannerHealthLogEvents(contents: string) {
  return contents
    .split(/\r?\n/)
    .map((line) => parseScannerHealthLogTimestamp(line.trim()))
    .filter(Boolean) as Array<{
    timestampIso: string;
    timestampMs: number;
    message: string;
  }>;
}

export function parseScannerHealthLogMeta(message: string) {
  const markerIndex = message.indexOf(SCANNER_HEALTH_LOG_META_MARKER);
  if (markerIndex === -1) {
    return { message, diagnostic: null };
  }

  const baseMessage = message.slice(0, markerIndex);
  const rawPayload = message.slice(
    markerIndex + SCANNER_HEALTH_LOG_META_MARKER.length,
  );

  try {
    const payload = JSON.parse(rawPayload) as Record<string, unknown>;
    return {
      message: baseMessage,
      diagnostic: {
        routeLabel:
          typeof payload.route_label === "string" &&
          payload.route_label.length > 0
            ? payload.route_label
            : null,
        routing:
          typeof payload.routing === "string" && payload.routing.length > 0
            ? payload.routing
            : null,
        reasonCode:
          typeof payload.reason_code === "string" &&
          payload.reason_code.length > 0
            ? payload.reason_code
            : "unknown",
        reasonLabel:
          typeof payload.reason_label === "string" &&
          payload.reason_label.length > 0
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

export function extractShortRouteLabelFromScannerMessage(message: string) {
  const match = message.match(
    /(?:\d+\/\d+\s+·\s+)?([A-Z]{3}\s*->\s*[A-Z]{3})\b/,
  );
  return match ? match[1].replace(/\s+/g, " ").trim() : null;
}

export function formatScannerHealthRouting(value: string) {
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

export function buildScannerHealthIssueKey(
  routeLabel: string,
  routing: string,
) {
  return `${routeLabel.replace(/\s+/g, " ").trim()}::${routing}`;
}

export function hoursSince(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return Math.max(0, (Date.now() - timestamp) / (60 * 60 * 1000));
}

export function formatAlertAge(hours: number) {
  if (hours < 1) {
    return "less than 1h ago";
  }

  if (hours < 48) {
    return `${Math.round(hours)}h ago`;
  }

  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function isWithinHours(value: string, hours: number) {
  const ageHours = hoursSince(value);
  return ageHours !== null && ageHours <= hours;
}

export async function readRecentSyncReportFailures(
  logsDir: string,
): Promise<ScannerSyncFailure[]> {
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
        typeof payload.generated_at === "string" &&
        payload.generated_at.length > 0
          ? payload.generated_at
          : null;
      const errors = Array.isArray(payload.errors) ? payload.errors : [];
      if (
        !generatedAt ||
        errors.length === 0 ||
        !isWithinHours(generatedAt, OPS_SYNC_FAILURE_LOOKBACK_HOURS)
      ) {
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

export async function readLatestScannerIssuesByRoute() {
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
  const events = [
    ...parseScannerHealthLogEvents(stdoutContents),
    ...parseScannerHealthLogEvents(stderrContents),
  ].sort((left, right) => left.timestampMs - right.timestampMs);

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
        extractShortRouteLabelFromScannerMessage(
          parsed.message.replace("Pattern no results: ", ""),
        );
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
  syncFailures.sort(
    (left, right) => new Date(right.at).getTime() - new Date(left.at).getTime(),
  );

  return { exact, loose, syncFailures };
}

export function summarizeDetectedDepartureMonths(
  rows: ScannerHealthServiceMonthRow[],
) {
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

export function buildScannerHealthSummary(
  routes: RouteRow[],
  snapshots: SnapshotRow[],
  scanRunRows: ScannerHealthRunRow[],
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
        new Date(right.scanned_at).getTime() -
        new Date(left.scanned_at).getTime(),
    );

  const runs: ScannerHealthRun[] = scanRunRows.slice(0, 6).map((row) => {
    const routeOutcomes = new Map<
      string,
      { started: boolean; completed: boolean; foundPrices: number }
    >();
    const storedRoutes = Array.isArray(row.routes) ? row.routes : [];
    for (const storedRoute of storedRoutes) {
      if (!storedRoute || typeof storedRoute !== "object") {
        continue;
      }
      const route = storedRoute as Record<string, unknown>;
      const routeKey =
        typeof route.route_key === "string" ? route.route_key : null;
      if (!routeKey) {
        continue;
      }
      const foundPrices = Number(route.found_prices ?? 0);
      routeOutcomes.set(routeKey, {
        started: route.started === true,
        completed: route.completed === true,
        foundPrices: Number.isFinite(foundPrices)
          ? Math.max(0, foundPrices)
          : 0,
      });
    }

    return {
      id: row.id,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      latestAt: row.completed_at ?? row.started_at,
      routesPlanned: Number(row.routes_planned) || 0,
      routesStarted: Number(row.routes_started) || 0,
      routesCompleted: Number(row.routes_completed) || 0,
      foundPrices: Number(row.found_prices) || 0,
      errors:
        (Number(row.timed_out) || 0) +
        (Number(row.network_outages) || 0) +
        (Number(row.hard_errors) || 0),
      routeOutcomes,
    };
  });
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
  windowStart.setDate(
    windowStart.getDate() + SCANNER_HEALTH_LOOKAHEAD_START_DAYS,
  );
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + SCANNER_HEALTH_LOOKAHEAD_END_DAYS);
  const monthStartFrom = new Date(
    windowStart.getFullYear(),
    windowStart.getMonth(),
    1,
  )
    .toISOString()
    .slice(0, 10);
  const monthStartTo = new Date(
    windowEnd.getFullYear(),
    windowEnd.getMonth(),
    1,
  )
    .toISOString()
    .slice(0, 10);

  const serviceMonthsByRoute = new Map<
    string,
    ScannerHealthServiceMonthRow[]
  >();
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

  const compareScannerHealthRoutes = (
    left: ScannerHealthAlert,
    right: ScannerHealthAlert,
  ) => {
    if (left.severity !== right.severity) {
      return left.severity === "critical" ? -1 : 1;
    }

    if (right.missedScanRuns !== left.missedScanRuns) {
      return right.missedScanRuns - left.missedScanRuns;
    }

    if (left.latestSeenAt && right.latestSeenAt) {
      return (
        new Date(left.latestSeenAt).getTime() -
        new Date(right.latestSeenAt).getTime()
      );
    }

    if (left.latestSeenAt) {
      return 1;
    }

    if (right.latestSeenAt) {
      return -1;
    }

    return left.routeLabel.localeCompare(right.routeLabel);
  };

  const scannerRouteKeyById = new Map(
    activeRoutes.map((route) => [
      route.id,
      `${route.origin_airport}:${route.destination_airport}:${route.max_stops}`,
    ]),
  );

  const routeDiagnostics = activeRoutes.map((route) => {
    const latestSnapshot = latestSnapshotByRoute.get(route.id) ?? null;
    const routeKey = scannerRouteKeyById.get(route.id) ?? "";
    const attemptedRuns = runs.filter(
      (run) => run.routeOutcomes.get(routeKey)?.started === true,
    );
    const firstSuccessfulRunIndex = attemptedRuns.findIndex(
      (run) => (run.routeOutcomes.get(routeKey)?.foundPrices ?? 0) > 0,
    );
    const missedScanRuns =
      firstSuccessfulRunIndex === -1
        ? attemptedRuns.length
        : firstSuccessfulRunIndex;

    const routeServiceMonths = (serviceMonthsByRoute.get(route.id) ?? [])
      .filter((row) => row.routing === route.max_stops)
      .filter(
        (row) =>
          row.month_start >= monthStartFrom && row.month_start <= monthStartTo,
      )
      .sort((left, right) => left.month_start.localeCompare(right.month_start));
    const activeRulesForRoute = (rulesByRoute.get(route.id) ?? [])
      .filter((row) => row.max_stops === route.max_stops)
      .filter(
        (row) =>
          row.month_start >= monthStartFrom && row.month_start <= monthStartTo,
      )
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
      const month = routeServiceMonths.find(
        (row) => row.month_start === rule.month_start,
      );
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
        .sort(
          (left, right) => new Date(right).getTime() - new Date(left).getTime(),
        )[0] ?? null;

    const activeRuleLabels = unique(
      activeRulesForRoute.map((row) => row.pattern_label),
    );
    const detectedDepartureSummary =
      summarizeDetectedDepartureMonths(routeServiceMonths);
    const hasDetectedDates = routeServiceMonths.some(
      (row) => (row.departure_dates ?? []).length > 0,
    );
    const routeShortLabel = `${route.origin_airport} -> ${route.destination_airport}`;
    const routeRoutingLabel = formatScannerHealthRouting(route.max_stops);
    const latestLoggedIssue =
      latestIssuesByRoute.exact.get(
        buildScannerHealthIssueKey(routeShortLabel, routeRoutingLabel),
      ) ??
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

  const latestRun = runs[0] ?? null;
  const latestRunRouteKeys = new Set(latestRun?.routeOutcomes.keys() ?? []);
  const latestRunMissingRoutes = latestRun
    ? routeDiagnostics.filter((route) => {
        const routeKey = scannerRouteKeyById.get(route.routeId);
        if (!routeKey) return false;
        const outcome = latestRun.routeOutcomes.get(routeKey);
        return outcome ? outcome.foundPrices === 0 : false;
      })
    : [];
  latestRunMissingRoutes.sort(compareScannerHealthRoutes);

  const neverSnapshotRoutes = routeDiagnostics.filter(
    (route) => !route.latestSeenAt,
  );
  neverSnapshotRoutes.sort(compareScannerHealthRoutes);

  return {
    latestRun: latestRun
      ? {
          id: latestRun.id,
          status: latestRun.status,
          startedAt: latestRun.startedAt,
          completedAt: latestRun.completedAt,
          routesPlanned: latestRun.routesPlanned,
          routesStarted: latestRun.routesStarted,
          routesCompleted: latestRun.routesCompleted,
          foundPrices: latestRun.foundPrices,
          errors: latestRun.errors,
        }
      : null,
    latestRunAt: latestRun?.latestAt ?? null,
    previousRunAt: runs[1]?.latestAt ?? null,
    recentRunCount: runs.length,
    activeRoutes: activeRoutes.length,
    routesPlannedInLatestRun: latestRunRouteKeys.size,
    routesSeenInLatestRun: latestRun
      ? [...latestRun.routeOutcomes.values()].filter(
          (outcome) => outcome.foundPrices > 0,
        ).length
      : 0,
    routesMissingLatestRun: latestRunMissingRoutes.length,
    latestRunMissingRoutes,
    routesWithoutAnySnapshot,
    neverSnapshotRoutes,
    routesMissingData: alerts.length,
    criticalRoutes: alerts.filter((alert) => alert.severity === "critical")
      .length,
    healthyRoutes: Math.max(0, activeRoutes.length - alerts.length),
    alerts,
  };
}

export function buildOpsAutomatedAlertsSummary(
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
      summary: "No recorded scanner execution is visible yet.",
      detail:
        "The ops dashboard cannot see a completed execution record in Supabase. Check the scheduler, service status, and scanner logs before relying on route health.",
      detectedAt: null,
    });
  } else if (
    latestRunAgeHours !== null &&
    latestRunAgeHours >= OPS_SCANNER_STALE_WARNING_HOURS
  ) {
    const severity =
      latestRunAgeHours >= OPS_SCANNER_STALE_CRITICAL_HOURS
        ? "critical"
        : "warning";
    items.push({
      id: "scanner:stale-run",
      kind: "scanner_not_running",
      severity,
      title:
        severity === "critical" ? "Scanner is overdue" : "Scanner may be late",
      summary: `Latest recorded run was ${formatAlertAge(latestRunAgeHours)}.`,
      detail: `The scanner should create execution records regularly. The latest completed run was at ${scannerHealth.latestRunAt}.`,
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
    const rightTime = right.detectedAt
      ? new Date(right.detectedAt).getTime()
      : 0;
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

export function escapeOpsAlertHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatOpsAlertEmailTimestamp(value: string | null) {
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

export function formatOpsAlertKind(value: OpsAutomatedAlert["kind"]) {
  if (value === "scanner_not_running") {
    return "Scanner";
  }
  if (value === "route_without_price") {
    return "Routes";
  }
  return "Sync";
}

export function buildOpsAlertEmail(alerts: OpsAutomatedAlertsSummary) {
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

export function buildOpsAlertStateKey(
  alerts: OpsAutomatedAlertsSummary,
  dateKey: string,
) {
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
