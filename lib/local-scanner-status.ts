import "server-only";

import { constants } from "node:fs";
import { access, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  LocalScannerBreakdownItem,
  LocalScannerLogLine,
  LocalScannerNoResultDiagnostic,
  LocalScannerRunTotals,
  LocalScannerStatus,
} from "@/lib/local-scanner-status-shared";

type ScannerRouteSeed = {
  origin_airport: string;
  destination_airport: string;
  lookahead_start_days?: number;
  lookahead_end_days?: number;
};

type LogEvent = {
  timestampMs: number;
  timestampIso: string;
  message: string;
};

type CompletedRunSnapshot = {
  completedAt: string | null;
  durationMs: number | null;
  logLines: LocalScannerLogLine[];
  totals: LocalScannerRunTotals | null;
  noResultBreakdown: LocalScannerBreakdownItem[];
};

const LOG_META_MARKER = " ||meta|| ";
const GLOBAL_LOOKAHEAD_START_DAYS = 14;
const GLOBAL_LOOKAHEAD_END_DAYS = 180;

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

async function readPidIfExists(targetPath: string) {
  if (!(await pathExists(targetPath))) {
    return null;
  }

  try {
    const raw = (await readFile(targetPath, "utf-8")).trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function processExists(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ESRCH"
    ) {
      return false;
    }

    return false;
  }
}

async function cleanupStaleState(scannerRoot: string) {
  await Promise.allSettled([
    rm("/tmp/luxcheapflights-local-scan.lock", {
      recursive: true,
      force: true,
    }),
    rm(path.join(scannerRoot, "scanner", "state", "local-scanner.pid"), {
      force: true,
    }),
    rm(path.join(scannerRoot, "scanner", "state", "local-scanner.child.pid"), {
      force: true,
    }),
  ]);
}

function parseBracketTimestamp(raw: string) {
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
    timestampMs,
    timestampIso: parsed.toISOString(),
    message,
  } satisfies LogEvent;
}

function parseLogEvents(contents: string) {
  return contents
    .split(/\r?\n/)
    .map((line) => parseBracketTimestamp(line.trim()))
    .filter(Boolean) as LogEvent[];
}

function looksLikeTimestampedLogLine(line: string) {
  return /^\[\d{4}-\d{2}-\d{2} /.test(line);
}

function formatFailureReason(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("httpx.HTTPStatusError: ")) {
    return trimmed.replace("httpx.HTTPStatusError: ", "");
  }

  if (trimmed.startsWith("RuntimeError: ")) {
    return trimmed.replace("RuntimeError: ", "");
  }

  if (/^[A-Za-z]+Error: /.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

function extractFailureReasons(contents: string) {
  const lines = contents.split(/\r?\n/);
  const reasons = new Map<string, string>();

  for (let index = 0; index < lines.length; index += 1) {
    const failureEvent = parseBracketTimestamp(lines[index].trim());
    if (!failureEvent || failureEvent.message !== "Local Lux flight scan failed.") {
      continue;
    }

    let reason: string | null = null;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const candidate = lines[cursor].trim();
      if (!candidate) {
        continue;
      }

      if (looksLikeTimestampedLogLine(candidate)) {
        break;
      }

      if (
        candidate === "Traceback (most recent call last):" ||
        candidate.startsWith("File ") ||
        candidate.startsWith("^") ||
        candidate.startsWith("For more information check:")
      ) {
        continue;
      }

      reason = formatFailureReason(candidate);
      if (reason) {
        break;
      }
    }

    if (reason) {
      reasons.set(failureEvent.timestampIso, reason);
    }
  }

  return reasons;
}

function toNullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseLogMeta(message: string) {
  const markerIndex = message.indexOf(LOG_META_MARKER);
  if (markerIndex === -1) {
    return { message, diagnostic: null };
  }

  const baseMessage = message.slice(0, markerIndex);
  const rawPayload = message.slice(markerIndex + LOG_META_MARKER.length);

  try {
    const payload = JSON.parse(rawPayload) as Record<string, unknown>;
    const diagnostic: LocalScannerNoResultDiagnostic = {
      reasonCode: toNullableString(payload.reason_code) ?? "unknown",
      reasonLabel: toNullableString(payload.reason_label) ?? "Unknown reason",
      reason: toNullableString(payload.reason) ?? "No reason recorded.",
      routeLabel: toNullableString(payload.route_label) ?? "Unknown route",
      destinationCity: toNullableString(payload.destination_city),
      bucket: toNullableString(payload.bucket),
      routing: toNullableString(payload.routing),
      patternLabel: toNullableString(payload.pattern_label) ?? "Unknown pattern",
      tripNights: toNullableNumber(payload.trip_nights),
      searchWindowStart: toNullableString(payload.search_window_start),
      searchWindowEnd: toNullableString(payload.search_window_end),
      departureDate: toNullableString(payload.departure_date),
      returnDate: toNullableString(payload.return_date),
      airlineSummary: toNullableString(payload.airline_summary),
      price: toNullableNumber(payload.price),
      currency: toNullableString(payload.currency),
      skyscannerUrl: toNullableString(payload.skyscanner_url),
      outboundDepartureAt: toNullableString(payload.outbound_departure_at),
      outboundArrivalAt: toNullableString(payload.outbound_arrival_at),
      returnDepartureAt: toNullableString(payload.return_departure_at),
      returnArrivalAt: toNullableString(payload.return_arrival_at),
      destinationStayHours: toNullableNumber(payload.destination_stay_hours),
    };

    return {
      message: baseMessage,
      diagnostic,
    };
  } catch {
    return {
      message: baseMessage,
      diagnostic: null,
    };
  }
}

function latestEventMatching(events: LogEvent[], predicate: (event: LogEvent) => boolean) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (predicate(events[index])) {
      return events[index];
    }
  }

  return null;
}

function isScannerStartMessage(message: string) {
  return message === "Starting local Lux flight scan.";
}

function isScannerTerminalMessage(message: string) {
  return (
    message === "Local Lux flight scan finished successfully." ||
    message === "Local Lux flight scan paused by network/DNS outage." ||
    message === "Local Lux flight scan failed." ||
    message === "Local Lux flight scan stopped from ops UI."
  );
}

function extractCurrentRouteLabel(message: string) {
  const withProgress = message.match(
    /^Route start:\s*(\d+\/\d+)\s+·\s+([A-Z]{3}\s*->\s*[A-Z]{3})/,
  );
  if (withProgress) {
    return `${withProgress[1]} · ${withProgress[2]}`;
  }

  const legacy = message.match(/^Route start:\s*([A-Z]{3}\s*->\s*[A-Z]{3})\s+\(/);
  if (legacy) {
    return legacy[1];
  }

  return null;
}

function extractCurrentPatternLabel(message: string) {
  const withProgress = message.match(
    /^Pattern start:\s*(\d+\/\d+)\s+·\s+[A-Z]{3}\s*->\s*[A-Z]{3}\s+(.+)$/,
  );
  if (withProgress) {
    return `${withProgress[1]} · ${withProgress[2]}`;
  }

  const legacy = message.match(/^Pattern start:\s*[A-Z]{3}\s*->\s*[A-Z]{3}\s+(.+)$/);
  if (legacy) {
    return legacy[1];
  }

  return null;
}

function classifyNoResultReason(reason: string | null) {
  if (!reason) {
    return {
      code: "unknown",
      label: "Unknown reason",
    };
  }

  if (reason.startsWith("No flights were returned")) {
    return {
      code: "no_flights_found",
      label: "No flights",
    };
  }

  if (reason.includes("only with more stops than allowed")) {
    return {
      code: "more_stops_required",
      label: "More stops needed",
    };
  }

  if (reason.includes("inside the current scan window")) {
    return {
      code: "outside_current_window",
      label: "Outside current scan window",
    };
  }

  if (reason.includes("none matched the exact")) {
    return {
      code: "pattern_not_available",
      label: "Pattern unavailable",
    };
  }

  if (reason.includes("under 24h")) {
    return {
      code: "destination_stay_under_24h",
      label: "<24h in destination",
    };
  }

  if (reason.includes("none passed validation cleanly")) {
    return {
      code: "validation_rejected",
      label: "Validation rejected",
    };
  }

  return {
    code: "other",
    label: "Other",
  };
}

function parseNoResultDetail(detail: string) {
  const withReason = detail.match(/^(.+?) \((.+)\)$/);
  if (!withReason) {
    const classified = classifyNoResultReason(null);
    return {
      routeDetail: detail,
      reason: null,
      ...classified,
    };
  }

  const [, routeDetail, reason] = withReason;
  return {
    routeDetail,
    reason,
    ...classifyNoResultReason(reason),
  };
}

function toLogLine(event: LogEvent): LocalScannerLogLine | null {
  const { message, diagnostic } = parseLogMeta(event.message);

  if (message === "Starting local Lux flight scan.") {
    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "Scanner",
      detail: "Run started",
      tone: "progress",
    };
  }

  if (message === "Local Lux flight scan finished successfully.") {
    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "Scanner",
      detail: "Run finished successfully",
      tone: "success",
    };
  }

  if (message === "Local Lux flight scan stopped from ops UI.") {
    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "Scanner",
      detail: "Run stopped from ops UI",
      tone: "muted",
    };
  }

  if (message === "Local Lux flight scan paused by network/DNS outage.") {
    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "Scanner",
      detail: "Run paused by network/DNS outage",
      tone: "error",
    };
  }

  if (message.startsWith("Route start: ")) {
    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "Route",
      detail: message.replace("Route start: ", ""),
      tone: "progress",
    };
  }

  if (message.startsWith("Pattern start: ")) {
    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "Pattern",
      detail: message.replace("Pattern start: ", ""),
      tone: "progress",
    };
  }

  if (message.startsWith("Pattern done: ")) {
    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "Found",
      detail: message.replace("Pattern done: ", ""),
      tone: "success",
    };
  }

  if (message.startsWith("Pattern no results: ")) {
    const parsed = parseNoResultDetail(message.replace("Pattern no results: ", ""));
    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "No results",
      detail: parsed.routeDetail,
      secondaryDetail: diagnostic?.reason ?? parsed.reason,
      categoryCode: diagnostic?.reasonCode ?? parsed.code,
      categoryLabel: diagnostic?.reasonLabel ?? parsed.label,
      diagnostic,
      tone: "muted",
    };
  }

  if (message.startsWith("Pattern retry: ")) {
    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "Retry",
      detail: message.replace("Pattern retry: ", ""),
      tone: "progress",
    };
  }

  if (message.startsWith("Pattern timed out: ")) {
    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "Timed out",
      detail: message.replace("Pattern timed out: ", ""),
      tone: "error",
    };
  }

  if (message.startsWith("Pattern network outage: ")) {
    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "Network / DNS",
      detail: message.replace("Pattern network outage: ", ""),
      tone: "error",
    };
  }

  if (message.startsWith("Pattern hard error: ")) {
    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "Hard error",
      detail: message.replace("Pattern hard error: ", ""),
      tone: "error",
    };
  }

  if (message.startsWith("Pattern error: ")) {
    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "Hard error",
      detail: message.replace("Pattern error: ", ""),
      tone: "error",
    };
  }

  if (message.startsWith("Scanner circuit breaker opened: ")) {
    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "Scanner",
      detail: "Network / DNS outage detected",
      secondaryDetail: message.replace("Scanner circuit breaker opened: ", ""),
      tone: "error",
    };
  }

  if (message === "Local Lux flight scan failed.") {
    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "Scanner",
      detail: "Run failed",
      tone: "error",
    };
  }

  return null;
}

function collectRecentLogLines(events: LogEvent[], limit?: number) {
  const lines = events
    .map((event) => toLogLine(event))
    .filter(Boolean) as LocalScannerLogLine[];

  if (typeof limit === "number") {
    return lines.slice(-limit);
  }

  return lines;
}

function applyFailureReasons(
  logLines: LocalScannerLogLine[],
  failureReasons: Map<string, string>,
) {
  if (failureReasons.size === 0) {
    return logLines;
  }

  return logLines.map((logLine) => {
    if (logLine.label !== "Scanner" || logLine.detail !== "Run failed") {
      return logLine;
    }

    const failureReason = failureReasons.get(logLine.timestamp);
    if (!failureReason) {
      return logLine;
    }

    return {
      ...logLine,
      secondaryDetail: failureReason,
    };
  });
}

function summarizeLogLines(logLines: LocalScannerLogLine[]): LocalScannerRunTotals {
  const totals: LocalScannerRunTotals = {
    found: 0,
    noResults: 0,
    timedOut: 0,
    networkOutages: 0,
    hardErrors: 0,
    retries: 0,
  };

  for (const logLine of logLines) {
    switch (logLine.label) {
      case "Found":
        totals.found += 1;
        break;
      case "No results":
        totals.noResults += 1;
        break;
      case "Timed out":
        totals.timedOut += 1;
        break;
      case "Network / DNS":
        totals.networkOutages += 1;
        break;
      case "Hard error":
        totals.hardErrors += 1;
        break;
      case "Retry":
        totals.retries += 1;
        break;
      default:
        break;
    }
  }

  return totals;
}

function summarizeNoResultBreakdown(logLines: LocalScannerLogLine[]): LocalScannerBreakdownItem[] {
  const counts = new Map<string, LocalScannerBreakdownItem>();

  for (const logLine of logLines) {
    if (logLine.label !== "No results") {
      continue;
    }

    const code = logLine.categoryCode ?? "unknown";
    const label = logLine.categoryLabel ?? "Unknown reason";
    const existing = counts.get(code);

    if (existing) {
      existing.count += 1;
      continue;
    }

    counts.set(code, {
      code,
      label,
      count: 1,
    });
  }

  return [...counts.values()].sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.label.localeCompare(right.label);
  });
}

function buildCompletedRunSnapshot(
  mergedEvents: LogEvent[],
  failureReasons: Map<string, string>,
): CompletedRunSnapshot {
  const latestTerminalIndex = [...mergedEvents]
    .reverse()
    .findIndex((event) => isScannerTerminalMessage(event.message));

  if (latestTerminalIndex === -1) {
    return {
      completedAt: null,
      durationMs: null,
      logLines: [],
      totals: null,
      noResultBreakdown: [],
    };
  }

  const terminalEvent = mergedEvents[mergedEvents.length - 1 - latestTerminalIndex];
  const startIndex = [...mergedEvents]
    .slice(0, mergedEvents.length - latestTerminalIndex)
    .map((event) => event.message)
    .lastIndexOf("Starting local Lux flight scan.");

  if (startIndex === -1) {
    const logLines = applyFailureReasons(
      collectRecentLogLines([terminalEvent]),
      failureReasons,
    );

    return {
      completedAt: terminalEvent.timestampIso,
      durationMs: null,
      logLines,
      totals: summarizeLogLines(logLines),
      noResultBreakdown: summarizeNoResultBreakdown(logLines),
    };
  }

  const runEvents = mergedEvents.slice(startIndex, mergedEvents.indexOf(terminalEvent) + 1);
  const logLines = applyFailureReasons(collectRecentLogLines(runEvents), failureReasons);

  return {
    completedAt: terminalEvent.timestampIso,
    durationMs: Math.max(terminalEvent.timestampMs - mergedEvents[startIndex].timestampMs, 0),
    logLines,
    totals: summarizeLogLines(logLines),
    noResultBreakdown: summarizeNoResultBreakdown(logLines),
  };
}

export async function resolveScannerRoot() {
  const candidates = [
    process.env.LOCAL_SCANNER_ROOT,
    path.join(os.homedir(), "Projects", "Luxcheapflights"),
    path.join(os.homedir(), "Documents", "Luxcheapflights"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (
      (await pathExists(path.join(candidate, "logs", "local-scanner.stdout.log"))) ||
      (await pathExists(path.join(candidate, "data", "lux-routes.json")))
    ) {
      return candidate;
    }
  }

  return null;
}

async function readTotalRoutes(scannerRoot: string) {
  const routes = await readRouteSeeds(scannerRoot);
  return routes ? routes.length : null;
}

async function readRouteSeeds(scannerRoot: string) {
  try {
    const contents = await readFile(path.join(scannerRoot, "data", "lux-routes.json"), "utf-8");
    const payload = JSON.parse(contents);
    if (!Array.isArray(payload)) {
      return null;
    }

    return payload.filter(
      (item): item is ScannerRouteSeed =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof item.origin_airport === "string" &&
        typeof item.destination_airport === "string",
    );
  } catch {
    return null;
  }
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function luxTodayDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Luxembourg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "1");
  return new Date(Date.UTC(year, month - 1, day));
}

function formatMonthWindowLabel(startDate: Date, endDate: Date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    month: "short",
    timeZone: "UTC",
  });
  const startMonth = formatter.format(startDate);
  const endMonth = formatter.format(endDate);

  return startMonth === endMonth ? `${startMonth} window` : `${startMonth}-${endMonth} window`;
}

function buildCurrentPatternWindowLabel(
  routes: ScannerRouteSeed[] | null,
  currentRouteLabel: string | null,
) {
  if (!routes || !currentRouteLabel) {
    return null;
  }

  const match = currentRouteLabel.match(/([A-Z]{3})\s*->\s*([A-Z]{3})/);
  if (!match) {
    return null;
  }

  const [, originAirport, destinationAirport] = match;
  const route = routes.find(
    (item) =>
      item.origin_airport === originAirport && item.destination_airport === destinationAirport,
  );
  if (!route) {
    return null;
  }

  const baseDate = luxTodayDate();
  const windowStart = addDays(baseDate, GLOBAL_LOOKAHEAD_START_DAYS);
  const windowEnd = addDays(baseDate, GLOBAL_LOOKAHEAD_END_DAYS);
  return formatMonthWindowLabel(windowStart, windowEnd);
}

export async function getLocalScannerStatus(): Promise<LocalScannerStatus> {
  const scannerRoot = await resolveScannerRoot();
  if (!scannerRoot) {
    return {
      available: false,
      running: false,
      totalRoutes: null,
      startedRoutes: null,
      remainingRoutes: null,
      startedAt: null,
      latestCompletedAt: null,
      latestFinishedAt: null,
      currentRouteLabel: null,
      currentPatternLabel: null,
      currentPatternWindowLabel: null,
      latestActivity: null,
      recentLogLines: [],
      liveTotals: null,
      noResultBreakdown: [],
      lastRunDurationMs: null,
      lastRunTotals: null,
      lastRunNoResultBreakdown: [],
      lastRunLogLines: [],
    };
  }

  const stdoutEvents = parseLogEvents(
    await readTextIfExists(path.join(scannerRoot, "logs", "local-scanner.stdout.log")),
  );
  const stderrContents = await readTextIfExists(
    path.join(scannerRoot, "logs", "local-scanner.stderr.log"),
  );
  const stderrEvents = parseLogEvents(stderrContents);
  const failureReasons = extractFailureReasons(stderrContents);
  const routeSeeds = await readRouteSeeds(scannerRoot);
  const totalRoutes = routeSeeds ? routeSeeds.length : null;
  const mergedEvents = [...stdoutEvents, ...stderrEvents].sort(
    (left, right) => left.timestampMs - right.timestampMs,
  );
  const lastCompletedRun = buildCompletedRunSnapshot(mergedEvents, failureReasons);

  const startEvent = latestEventMatching(
    mergedEvents,
    (event) => isScannerStartMessage(event.message),
  );
  const finishEvent = latestEventMatching(
    mergedEvents,
    (event) => event.message === "Local Lux flight scan finished successfully.",
  );
  const lockExists = await pathExists("/tmp/luxcheapflights-local-scan.lock");
  const scriptPid = await readPidIfExists(
    path.join(scannerRoot, "scanner", "state", "local-scanner.pid"),
  );
  const childPid = await readPidIfExists(
    path.join(scannerRoot, "scanner", "state", "local-scanner.child.pid"),
  );
  const running = [childPid, scriptPid].some((pid) => pid !== null && processExists(pid));

  if (!running && lockExists) {
    await cleanupStaleState(scannerRoot);
  }

  if (!running) {
    return {
      available: stdoutEvents.length > 0 || stderrEvents.length > 0,
      running: false,
      totalRoutes,
      startedRoutes: null,
      remainingRoutes: null,
      startedAt: startEvent?.timestampIso ?? null,
      latestCompletedAt: lastCompletedRun.completedAt,
      latestFinishedAt: finishEvent?.timestampIso ?? null,
      currentRouteLabel: null,
      currentPatternLabel: null,
      currentPatternWindowLabel: null,
      latestActivity:
        latestEventMatching(mergedEvents, (event) => isScannerTerminalMessage(event.message))
          ?.message ??
        finishEvent?.message ??
        startEvent?.message ??
        null,
      recentLogLines: applyFailureReasons(collectRecentLogLines(mergedEvents, 120), failureReasons),
      liveTotals: null,
      noResultBreakdown: [],
      lastRunDurationMs: lastCompletedRun.durationMs,
      lastRunTotals: lastCompletedRun.totals,
      lastRunNoResultBreakdown: lastCompletedRun.noResultBreakdown,
      lastRunLogLines: lastCompletedRun.logLines,
    };
  }

  const startMs = startEvent?.timestampMs ?? Number.NEGATIVE_INFINITY;
  const activeStderrEvents = stderrEvents.filter((event) => event.timestampMs >= startMs);
  const routeStarts = activeStderrEvents.filter((event) => event.message.startsWith("Route start: "));
  const patternStarts = activeStderrEvents.filter((event) =>
    event.message.startsWith("Pattern start: "),
  );
  const currentRouteLabel = routeStarts.length
    ? extractCurrentRouteLabel(routeStarts.at(-1)!.message)
    : null;
  const currentPatternLabel = patternStarts.length
    ? extractCurrentPatternLabel(patternStarts.at(-1)!.message)
    : null;
  const latestActivity = activeStderrEvents.at(-1)?.message ?? startEvent?.message ?? null;
  const startedRoutes = routeStarts.length;
  const remainingRoutes =
    totalRoutes !== null ? Math.max(totalRoutes - startedRoutes, 0) : null;
  const activeEvents = [
    ...(startEvent ? [startEvent] : []),
    ...activeStderrEvents,
  ].sort((left, right) => left.timestampMs - right.timestampMs);
  const activeLogLines = collectRecentLogLines(activeEvents);

  return {
    available: true,
    running: true,
    totalRoutes,
    startedRoutes,
    remainingRoutes,
    startedAt: startEvent?.timestampIso ?? null,
    latestCompletedAt: lastCompletedRun.completedAt,
    latestFinishedAt: finishEvent?.timestampIso ?? null,
    currentRouteLabel,
    currentPatternLabel,
    currentPatternWindowLabel: buildCurrentPatternWindowLabel(routeSeeds, currentRouteLabel),
    latestActivity,
    recentLogLines: activeLogLines,
    liveTotals: summarizeLogLines(activeLogLines),
    noResultBreakdown: summarizeNoResultBreakdown(activeLogLines),
    lastRunDurationMs: lastCompletedRun.durationMs,
    lastRunTotals: lastCompletedRun.totals,
    lastRunNoResultBreakdown: lastCompletedRun.noResultBreakdown,
    lastRunLogLines: lastCompletedRun.logLines,
  };
}
