import "server-only";

import { constants } from "node:fs";
import { access, readFile, rm } from "node:fs/promises";
import path from "node:path";

import type {
  LocalPatternDiscoveryLogLine,
  LocalPatternDiscoveryRunTotals,
  LocalPatternDiscoveryStatus,
} from "@/lib/local-pattern-discovery-status-shared";
import { hasSupabaseAdminEnv } from "@/lib/env";
import { resolveScannerRoot } from "@/lib/local-scanner-status";
import { getSupabaseAdminClient } from "@/lib/supabase";

type LogEvent = {
  timestampMs: number;
  timestampIso: string;
  message: string;
};

type RemoteRouteRow = {
  id: string;
  origin_airport: string;
  destination_airport: string;
  destination_city: string;
};

type RemoteServiceMonthRow = {
  route_id: string;
  month_start: string;
  routing: string;
  departure_dates: string[] | null;
  departure_weekdays: string[] | null;
  sample_size: number | null;
  last_checked_at: string;
};

type RemoteServiceChangeRow = {
  id: string;
  route_id: string;
  summary: string;
  detected_at: string;
};

type RemoteRouteSummary = {
  key: string;
  routeId: string;
  routing: string;
  latestCheckedAt: string;
  latestCheckedMs: number;
  monthStarts: Set<string>;
  departureWeekdays: Set<string>;
  departureCount: number;
};

function unavailableStatus(): LocalPatternDiscoveryStatus {
  return {
    source: "unavailable",
    available: false,
    running: false,
    totalRoutes: null,
    startedRoutes: null,
    remainingRoutes: null,
    startedAt: null,
    latestFinishedAt: null,
    latestFailedAt: null,
    currentRouteLabel: null,
    latestActivity: null,
    recentLogLines: [],
    liveTotals: null,
  };
}

function timestampMs(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function remoteRouteLabel(route: RemoteRouteRow | undefined) {
  if (!route) {
    return "Unknown route";
  }

  return `${route.origin_airport} -> ${route.destination_airport} (${route.destination_city})`;
}

async function getSupabasePatternDiscoveryStatus() {
  if (!hasSupabaseAdminEnv()) {
    return null;
  }

  const supabase = getSupabaseAdminClient();
  const [routesResult, serviceMonthsResult, changeEventsResult] = await Promise.all([
    supabase
      .from("scanned_routes")
      .select("id, origin_airport, destination_airport, destination_city")
      .eq("is_active", true)
      .order("destination_airport", { ascending: true })
      .limit(1000),
    supabase
      .from("route_service_months")
      .select(
        "route_id, month_start, routing, departure_dates, departure_weekdays, sample_size, last_checked_at",
      )
      .order("last_checked_at", { ascending: false })
      .limit(1000),
    supabase
      .from("route_service_change_events")
      .select("id, route_id, summary, detected_at")
      .order("detected_at", { ascending: false })
      .limit(80),
  ]);

  if (routesResult.error) {
    throw routesResult.error;
  }
  if (serviceMonthsResult.error) {
    throw serviceMonthsResult.error;
  }
  if (changeEventsResult.error) {
    throw changeEventsResult.error;
  }

  const routes = (routesResult.data ?? []) as RemoteRouteRow[];
  const serviceMonths = (serviceMonthsResult.data ?? []) as RemoteServiceMonthRow[];
  const changeEvents = (changeEventsResult.data ?? []) as RemoteServiceChangeRow[];
  const routesById = new Map(routes.map((route) => [route.id, route]));
  const summariesByKey = new Map<string, RemoteRouteSummary>();

  for (const month of serviceMonths) {
    const checkedMs = timestampMs(month.last_checked_at);
    if (checkedMs === null) {
      continue;
    }

    const key = `${month.route_id}:${month.routing}`;
    const existing = summariesByKey.get(key);
    const summary = existing ?? {
      key,
      routeId: month.route_id,
      routing: month.routing,
      latestCheckedAt: month.last_checked_at,
      latestCheckedMs: checkedMs,
      monthStarts: new Set<string>(),
      departureWeekdays: new Set<string>(),
      departureCount: 0,
    };

    if (checkedMs > summary.latestCheckedMs) {
      summary.latestCheckedAt = month.last_checked_at;
      summary.latestCheckedMs = checkedMs;
    }
    summary.monthStarts.add(month.month_start);
    for (const weekday of month.departure_weekdays ?? []) {
      summary.departureWeekdays.add(weekday);
    }
    summary.departureCount += month.departure_dates?.length ?? Math.max(0, month.sample_size ?? 0);
    summariesByKey.set(key, summary);
  }

  const summaries = [...summariesByKey.values()].sort(
    (left, right) => left.latestCheckedMs - right.latestCheckedMs,
  );
  const serviceLogLines = summaries.map((summary): LocalPatternDiscoveryLogLine => {
    const weekdays = [...summary.departureWeekdays].sort().join(", ");
    const route = routesById.get(summary.routeId);
    const routingLabel = summary.routing.replaceAll("_", " ").toLowerCase();

    return {
      id: `supabase:service:${summary.key}:${summary.latestCheckedAt}`,
      timestamp: summary.latestCheckedAt,
      label: summary.departureCount > 0 ? "Dates found" : "No dates found",
      detail: `${remoteRouteLabel(route)} · ${summary.monthStarts.size} months · ${routingLabel}`,
      secondaryDetail:
        summary.departureCount > 0
          ? `${summary.departureCount} departures · ${weekdays || "weekdays not recorded"}`
          : "No departures were detected in the saved discovery window.",
      tone: summary.departureCount > 0 ? "success" : "muted",
    };
  });
  const changeLogLines = changeEvents
    .map((event): LocalPatternDiscoveryLogLine | null => {
      if (timestampMs(event.detected_at) === null) {
        return null;
      }

      return {
        id: `supabase:change:${event.id}`,
        timestamp: event.detected_at,
        label: "Cadence change",
        detail: remoteRouteLabel(routesById.get(event.route_id)),
        secondaryDetail: event.summary,
        tone: "success",
      };
    })
    .filter(Boolean) as LocalPatternDiscoveryLogLine[];
  const recentLogLines = [...serviceLogLines, ...changeLogLines]
    .sort(
      (left, right) =>
        (timestampMs(left.timestamp) ?? 0) - (timestampMs(right.timestamp) ?? 0),
    )
    .slice(-120);
  const latestSummary = summaries.at(-1) ?? null;
  const latestChange = changeEvents
    .map((event) => ({ event, timestampMs: timestampMs(event.detected_at) }))
    .filter((item): item is { event: RemoteServiceChangeRow; timestampMs: number } =>
      item.timestampMs !== null,
    )
    .sort((left, right) => left.timestampMs - right.timestampMs)
    .at(-1);
  const latestActivityMs = Math.max(
    latestSummary?.latestCheckedMs ?? Number.NEGATIVE_INFINITY,
    latestChange?.timestampMs ?? Number.NEGATIVE_INFINITY,
  );
  const hasLatestActivity = Number.isFinite(latestActivityMs);
  const checkedRouteIds = new Set(summaries.map((summary) => summary.routeId));
  const totalRoutes = routes.length;
  const latestLine = recentLogLines.at(-1) ?? null;

  return {
    source: "supabase",
    available: totalRoutes > 0 || recentLogLines.length > 0,
    running: false,
    totalRoutes,
    startedRoutes: checkedRouteIds.size,
    remainingRoutes: Math.max(totalRoutes - checkedRouteIds.size, 0),
    startedAt: null,
    latestFinishedAt: hasLatestActivity ? new Date(latestActivityMs).toISOString() : null,
    latestFailedAt: null,
    currentRouteLabel: latestSummary
      ? remoteRouteLabel(routesById.get(latestSummary.routeId))
      : null,
    latestActivity: latestLine?.detail ?? null,
    recentLogLines,
    liveTotals: null,
  } satisfies LocalPatternDiscoveryStatus;
}

function statusFreshnessMs(status: LocalPatternDiscoveryStatus) {
  return Math.max(
    timestampMs(status.latestFinishedAt) ?? Number.NEGATIVE_INFINITY,
    timestampMs(status.latestFailedAt) ?? Number.NEGATIVE_INFINITY,
    timestampMs(status.startedAt) ?? Number.NEGATIVE_INFINITY,
    timestampMs(status.recentLogLines.at(-1)?.timestamp) ?? Number.NEGATIVE_INFINITY,
  );
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
    rm("/tmp/luxcheapflights-pattern-discovery.lock", {
      recursive: true,
      force: true,
    }),
    rm(path.join(scannerRoot, "scanner", "state", "local-pattern-discovery.pid"), {
      force: true,
    }),
    rm(path.join(scannerRoot, "scanner", "state", "local-pattern-discovery.child.pid"), {
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

function parseEvents(contents: string) {
  return contents
    .split(/\r?\n/)
    .map((line) => parseBracketTimestamp(line.trim()))
    .filter(Boolean) as LogEvent[];
}

function latestMatching(events: LogEvent[], predicate: (event: LogEvent) => boolean) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (predicate(events[index])) {
      return events[index];
    }
  }

  return null;
}

async function readTotalRoutes(scannerRoot: string) {
  try {
    const contents = await readFile(path.join(scannerRoot, "data", "lux-routes.json"), "utf-8");
    const payload = JSON.parse(contents);
    return Array.isArray(payload) ? payload.length : null;
  } catch {
    return null;
  }
}

function extractCurrentRouteLabel(message: string) {
  const match = message.match(/^Pattern discovery start:\s*([A-Z]{3}\s*->\s*[A-Z]{3})\s+\((.+)\)$/);
  if (!match) {
    return null;
  }

  const [, routeLabel, bucketLabel] = match;
  return `${routeLabel} (${bucketLabel.replaceAll("_", " ")})`;
}

function extractSingleRouteScope(message: string) {
  const match = message.match(/^Discovery scope:\s*single route\s+(.+)\.$/);
  if (!match) {
    return null;
  }

  return match[1];
}

function toLogLine(event: LogEvent): LocalPatternDiscoveryLogLine | null {
  const message = event.message;

  if (message === "Starting local route pattern discovery.") {
    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "Discovery",
      detail: "Monthly discovery started",
      tone: "progress",
    };
  }

  if (message === "Local route pattern discovery finished successfully.") {
    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "Discovery",
      detail: "Monthly discovery finished successfully",
      tone: "success",
    };
  }

  if (message === "Local route pattern discovery failed.") {
    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "Hard error",
      detail: "Monthly discovery failed",
      tone: "error",
    };
  }

  if (message.startsWith("Pattern discovery start: ")) {
    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "Route",
      detail: message.replace("Pattern discovery start: ", ""),
      tone: "progress",
    };
  }

  if (message.startsWith("Discovery scope: single route ")) {
    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "Scope",
      detail: message.replace("Discovery scope: single route ", "").replace(/\.$/, ""),
      tone: "muted",
    };
  }

  if (message.startsWith("Pattern discovery skipped: ")) {
    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "Manual rules",
      detail: message.replace("Pattern discovery skipped: ", ""),
      tone: "muted",
    };
  }

  if (message.startsWith("Pattern discovery override: ")) {
    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "New overrides",
      detail: message.replace("Pattern discovery override: ", ""),
      tone: "success",
    };
  }

  if (message.startsWith("Pattern discovery result: ")) {
    const detail = message.replace("Pattern discovery result: ", "");
    if (detail.endsWith(" uses_defaults")) {
      return {
        id: `${event.timestampIso}:${message}`,
        timestamp: event.timestampIso,
        label: "Uses defaults",
        detail: detail.replace(/ uses_defaults$/, ""),
        secondaryDetail: "No destination-specific override was needed.",
        tone: "muted",
      };
    }

    if (detail.endsWith(" no_supported_patterns")) {
      return {
        id: `${event.timestampIso}:${message}`,
        timestamp: event.timestampIso,
        label: "No supported patterns",
        detail: detail.replace(/ no_supported_patterns$/, ""),
        secondaryDetail: "No useful direct cadence was detected for the current rule set.",
        tone: "error",
      };
    }
  }

  if (message.startsWith("Service calendar result: ")) {
    const detail = message.replace("Service calendar result: ", "");
    if (detail.includes(" no outbound departure dates found in the scanned months")) {
      return {
        id: `${event.timestampIso}:${message}`,
        timestamp: event.timestampIso,
        label: "No dates found",
        detail: detail.replace(" no outbound departure dates found in the scanned months", ""),
        secondaryDetail: "No outbound departures were detected in the months scanned for this route.",
        tone: "muted",
      };
    }

    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "Dates found",
      detail,
      tone: "success",
    };
  }

  if (message.startsWith("Service cadence change: ")) {
    return {
      id: `${event.timestampIso}:${message}`,
      timestamp: event.timestampIso,
      label: "Cadence change",
      detail: message.replace("Service cadence change: ", ""),
      tone: "success",
    };
  }

  return {
    id: `${event.timestampIso}:${message}`,
    timestamp: event.timestampIso,
    label: "Hard error",
    detail: message,
    tone: "error",
  };
}

function collectRecentLogLines(events: LogEvent[], limit?: number) {
  const lines = events
    .map((event) => toLogLine(event))
    .filter(Boolean) as LocalPatternDiscoveryLogLine[];

  if (typeof limit === "number") {
    return lines.slice(-limit);
  }

  return lines;
}

function summarizeLogLines(logLines: LocalPatternDiscoveryLogLine[]): LocalPatternDiscoveryRunTotals {
  const totals: LocalPatternDiscoveryRunTotals = {
    usesDefaults: 0,
    manualRules: 0,
    newOverrides: 0,
    noSupportedPatterns: 0,
    cadenceChanges: 0,
    hardErrors: 0,
  };

  for (const line of logLines) {
    switch (line.label) {
      case "Uses defaults":
        totals.usesDefaults += 1;
        break;
      case "Manual rules":
        totals.manualRules += 1;
        break;
      case "New overrides":
        totals.newOverrides += 1;
        break;
      case "No supported patterns":
        totals.noSupportedPatterns += 1;
        break;
      case "Cadence change":
        totals.cadenceChanges += 1;
        break;
      case "Hard error":
        totals.hardErrors += 1;
        break;
      default:
        break;
    }
  }

  return totals;
}

export async function getLocalPatternDiscoveryStatus(): Promise<LocalPatternDiscoveryStatus> {
  const scannerRoot = await resolveScannerRoot();
  if (!scannerRoot) {
    try {
      return (await getSupabasePatternDiscoveryStatus()) ?? unavailableStatus();
    } catch {
      return unavailableStatus();
    }
  }

  const stdoutEvents = parseEvents(
    await readTextIfExists(path.join(scannerRoot, "logs", "local-pattern-discovery.stdout.log")),
  );
  const stderrEvents = parseEvents(
    await readTextIfExists(path.join(scannerRoot, "logs", "local-pattern-discovery.stderr.log")),
  );
  const totalRoutes = await readTotalRoutes(scannerRoot);

  const startEvent = latestMatching(
    stdoutEvents,
    (event) => event.message === "Starting local route pattern discovery.",
  );
  const finishEvent = latestMatching(
    stdoutEvents,
    (event) => event.message === "Local route pattern discovery finished successfully.",
  );
  const failedEvent = latestMatching(
    stderrEvents,
    (event) => event.message === "Local route pattern discovery failed.",
  );
  const lockExists = await pathExists("/tmp/luxcheapflights-pattern-discovery.lock");
  const scriptPid = await readPidIfExists(
    path.join(scannerRoot, "scanner", "state", "local-pattern-discovery.pid"),
  );
  const childPid = await readPidIfExists(
    path.join(scannerRoot, "scanner", "state", "local-pattern-discovery.child.pid"),
  );
  const running = [childPid, scriptPid].some((pid) => pid !== null && processExists(pid));

  if (!running && lockExists) {
    await cleanupStaleState(scannerRoot);
  }

  if (!running) {
    const mergedEvents = [...stdoutEvents, ...stderrEvents].sort(
      (left, right) => left.timestampMs - right.timestampMs,
    );
    const available = stdoutEvents.length > 0 || stderrEvents.length > 0;

    if (!available) {
      try {
        return (await getSupabasePatternDiscoveryStatus()) ?? unavailableStatus();
      } catch {
        return unavailableStatus();
      }
    }

    const localStatus = {
      source: "local",
      available,
      running: false,
      totalRoutes,
      startedRoutes: null,
      remainingRoutes: null,
      startedAt: startEvent?.timestampIso ?? null,
      latestFinishedAt: finishEvent?.timestampIso ?? null,
      latestFailedAt: failedEvent?.timestampIso ?? null,
      currentRouteLabel: null,
      latestActivity: finishEvent?.message ?? failedEvent?.message ?? startEvent?.message ?? null,
      recentLogLines: collectRecentLogLines(mergedEvents, 120),
      liveTotals: null,
    } satisfies LocalPatternDiscoveryStatus;

    try {
      const remoteStatus = await getSupabasePatternDiscoveryStatus();
      if (
        remoteStatus?.available &&
        statusFreshnessMs(remoteStatus) > statusFreshnessMs(localStatus)
      ) {
        return remoteStatus;
      }
    } catch {
      // Keep the local feed when Supabase is temporarily unavailable.
    }

    return localStatus;
  }

  const startMs = startEvent?.timestampMs ?? Number.NEGATIVE_INFINITY;
  const activeStdoutEvents = stdoutEvents.filter((event) => event.timestampMs >= startMs);
  const activeStderrEvents = stderrEvents.filter((event) => event.timestampMs >= startMs);
  const scopeEvent = latestMatching(
    activeStdoutEvents,
    (event) => event.message.startsWith("Discovery scope: single route "),
  );
  const routeStarts = activeStderrEvents.filter((event) =>
    event.message.startsWith("Pattern discovery start: "),
  );
  const latestActivity = activeStderrEvents.at(-1)?.message ?? startEvent?.message ?? null;
  const startedRoutes = routeStarts.length;
  const effectiveTotalRoutes = scopeEvent ? 1 : totalRoutes;
  const remainingRoutes =
    effectiveTotalRoutes !== null ? Math.max(effectiveTotalRoutes - startedRoutes, 0) : null;
  const activeEvents = [...activeStdoutEvents, ...activeStderrEvents].sort(
    (left, right) => left.timestampMs - right.timestampMs,
  );
  const activeLogLines = collectRecentLogLines(activeEvents);

  return {
    source: "local",
    available: true,
    running: true,
    totalRoutes: effectiveTotalRoutes,
    startedRoutes,
    remainingRoutes,
    startedAt: startEvent?.timestampIso ?? null,
    latestFinishedAt: finishEvent?.timestampIso ?? null,
    latestFailedAt: failedEvent?.timestampIso ?? null,
    currentRouteLabel: routeStarts.length
      ? extractCurrentRouteLabel(routeStarts.at(-1)!.message)
      : scopeEvent
        ? extractSingleRouteScope(scopeEvent.message)
      : null,
    latestActivity,
    recentLogLines: activeLogLines,
    liveTotals: summarizeLogLines(activeLogLines),
  };
}
