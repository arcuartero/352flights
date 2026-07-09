import { NextResponse } from "next/server";

import { getLocalScannerStatus } from "@/lib/local-scanner-status";
import type {
  LocalScannerBreakdownItem,
  LocalScannerLogLine,
  LocalScannerRunTotals,
  LocalScannerStatus,
} from "@/lib/local-scanner-status-shared";
import {
  callVpsScannerAgent,
  hasVpsScannerAgentConfig,
  type VpsScannerAgentStatus,
} from "@/lib/vps-scanner-agent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      error: error.name || "Error",
      detail: error.message || "Unknown error",
      stack: process.env.NODE_ENV !== "production" ? error.stack ?? null : null,
    };
  }

  return {
    error: "UnknownError",
    detail: typeof error === "string" ? error : "Unknown scanner status error",
    stack: null,
  };
}

function unauthorizedResponse() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Lux Ops", charset="UTF-8"',
    },
  });
}

type VpsJournalEvent = {
  timestampMs: number;
  timestampIso: string;
  message: string;
};

function parseSystemdTimestamp(value: string | undefined) {
  if (!value || value === "n/a") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function parseVpsJournalEvent(line: string): VpsJournalEvent | null {
  const match = line.match(/\[(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})Z\]\s*(.*)$/);
  if (!match) return null;

  const [, calendarDate, clockTime, rawMessage] = match;
  const parsed = new Date(`${calendarDate}T${clockTime}Z`);
  if (!Number.isFinite(parsed.getTime())) return null;

  return {
    timestampMs: parsed.getTime(),
    timestampIso: parsed.toISOString(),
    message: rawMessage,
  };
}

function splitLogMeta(message: string) {
  const marker = " ||meta|| ";
  const markerIndex = message.indexOf(marker);
  if (markerIndex === -1) {
    return { message, meta: null as Record<string, unknown> | null };
  }

  const baseMessage = message.slice(0, markerIndex);
  try {
    return {
      message: baseMessage,
      meta: JSON.parse(message.slice(markerIndex + marker.length)) as Record<string, unknown>,
    };
  } catch {
    return { message: baseMessage, meta: null };
  }
}

function asText(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function parseNoResultReason(detail: string) {
  const match = detail.match(/\(([^()]*)\)\s*$/);
  return match?.[1] ?? "No matching result for this route and pattern.";
}

function parseNoResultDetail(detail: string) {
  const withReason = detail.match(/^(.+?) \((.+)\)$/);
  if (!withReason) {
    return {
      routeDetail: detail,
      reason: null as string | null,
    };
  }

  return {
    routeDetail: withReason[1],
    reason: withReason[2],
  };
}

function toVpsLogLine(event: VpsJournalEvent): LocalScannerLogLine | null {
  const { message, meta } = splitLogMeta(event.message);
  const id = `${event.timestampIso}:${message}`;

  if (message.startsWith("Route start: ")) {
    return {
      id,
      timestamp: event.timestampIso,
      label: "Route",
      detail: message.replace("Route start: ", ""),
      tone: "progress",
    };
  }

  if (message.startsWith("Pattern start: ")) {
    return {
      id,
      timestamp: event.timestampIso,
      label: "Pattern",
      detail: message.replace("Pattern start: ", ""),
      tone: "progress",
    };
  }

  if (message.startsWith("Pattern done: ")) {
    return {
      id,
      timestamp: event.timestampIso,
      label: "Found",
      detail: message.replace("Pattern done: ", ""),
      tone: "success",
    };
  }

  if (message.startsWith("Pattern no results: ")) {
    const parsed = parseNoResultDetail(message.replace("Pattern no results: ", ""));
    const reasonCode = asText(meta?.reason_code) ?? "no_results";
    const reasonLabel = asText(meta?.reason_label) ?? "No results";
    const reason = asText(meta?.reason) ?? parsed.reason ?? parseNoResultReason(parsed.routeDetail);

    return {
      id,
      timestamp: event.timestampIso,
      label: "No results",
      detail: parsed.routeDetail,
      secondaryDetail: reason,
      categoryCode: reasonCode,
      categoryLabel: reasonLabel,
      diagnostic: {
        reasonCode,
        reasonLabel,
        reason,
        routeLabel: asText(meta?.route_label) ?? parsed.routeDetail,
        destinationCity: asText(meta?.destination_city),
        bucket: asText(meta?.bucket),
        routing: asText(meta?.routing),
        patternLabel: asText(meta?.pattern_label) ?? "Unknown pattern",
        tripNights: asNumber(meta?.trip_nights),
        searchWindowStart: asText(meta?.search_window_start),
        searchWindowEnd: asText(meta?.search_window_end),
        departureDate: asText(meta?.departure_date),
        returnDate: asText(meta?.return_date),
        airlineSummary: asText(meta?.airline_summary),
        price: asNumber(meta?.price),
        currency: asText(meta?.currency),
        skyscannerUrl: asText(meta?.skyscanner_url),
        outboundDepartureAt: asText(meta?.outbound_departure_at),
        outboundArrivalAt: asText(meta?.outbound_arrival_at),
        returnDepartureAt: asText(meta?.return_departure_at),
        returnArrivalAt: asText(meta?.return_arrival_at),
        destinationStayHours: asNumber(meta?.destination_stay_hours),
        outboundStopCount: asNumber(meta?.outbound_stop_count),
        returnStopCount: asNumber(meta?.return_stop_count),
        totalStopCount: asNumber(meta?.total_stop_count),
        configuredRouting: asText(meta?.configured_routing),
        historyPoints: asNumber(meta?.history_points),
        minimumHistoryPoints: asNumber(meta?.minimum_history_points),
        baselinePrice: asNumber(meta?.baseline_price),
        requiredPrice: asNumber(meta?.required_price),
        dropRatio: asNumber(meta?.drop_ratio),
        discountPercent: asNumber(meta?.discount_percent),
        reviewRatio: asNumber(meta?.review_ratio),
        effectiveReviewRatio: asNumber(meta?.effective_review_ratio),
        bootstrapReviewRatio: asNumber(meta?.bootstrap_review_ratio),
        bootstrapVisibleDealTarget: asNumber(meta?.bootstrap_visible_deal_target),
        visibleDealsForDestination: asNumber(meta?.visible_deals_for_destination),
        dealMode: asText(meta?.deal_mode),
        routingRelaxed: asBoolean(meta?.routing_relaxed),
        routingRelaxedReason: asText(meta?.routing_relaxed_reason),
      },
      tone: "muted",
    };
  }

  if (message.startsWith("Deal skipped: ")) {
    const parsed = parseNoResultDetail(message.replace("Deal skipped: ", ""));
    const reasonCode = asText(meta?.reason_code) ?? "not_an_offer";
    const reasonLabel = asText(meta?.reason_label) ?? "Not an offer";
    const reason = asText(meta?.reason) ?? parsed.reason ?? "Price was tracked, but not promoted as an offer.";

    return {
      id,
      timestamp: event.timestampIso,
      label: "No offer",
      detail: parsed.routeDetail,
      secondaryDetail: reason,
      categoryCode: reasonCode,
      categoryLabel: reasonLabel,
      diagnostic: {
        reasonCode,
        reasonLabel,
        reason,
        routeLabel: asText(meta?.route_label) ?? parsed.routeDetail,
        destinationCity: asText(meta?.destination_city),
        bucket: asText(meta?.bucket),
        routing: asText(meta?.routing),
        configuredRouting: asText(meta?.configured_routing),
        patternLabel: asText(meta?.pattern_label) ?? "Unknown pattern",
        tripNights: asNumber(meta?.trip_nights),
        searchWindowStart: asText(meta?.search_window_start),
        searchWindowEnd: asText(meta?.search_window_end),
        departureDate: asText(meta?.departure_date),
        returnDate: asText(meta?.return_date),
        airlineSummary: asText(meta?.airline_summary),
        price: asNumber(meta?.price),
        currency: asText(meta?.currency),
        skyscannerUrl: asText(meta?.skyscanner_url),
        historyPoints: asNumber(meta?.history_points),
        minimumHistoryPoints: asNumber(meta?.minimum_history_points),
        baselinePrice: asNumber(meta?.baseline_price),
        requiredPrice: asNumber(meta?.required_price),
        dropRatio: asNumber(meta?.drop_ratio),
        discountPercent: asNumber(meta?.discount_percent),
        reviewRatio: asNumber(meta?.review_ratio),
        effectiveReviewRatio: asNumber(meta?.effective_review_ratio),
        bootstrapReviewRatio: asNumber(meta?.bootstrap_review_ratio),
        bootstrapVisibleDealTarget: asNumber(meta?.bootstrap_visible_deal_target),
        visibleDealsForDestination: asNumber(meta?.visible_deals_for_destination),
        dealMode: asText(meta?.deal_mode),
        routingRelaxed: asBoolean(meta?.routing_relaxed),
        routingRelaxedReason: asText(meta?.routing_relaxed_reason),
      },
      tone: "muted",
    };
  }

  if (message.startsWith("Deal candidate: ")) {
    return {
      id,
      timestamp: event.timestampIso,
      label: "Offer",
      detail: message.replace("Deal candidate: ", ""),
      tone: "success",
    };
  }

  if (message.startsWith("Pattern retry: ")) {
    return {
      id,
      timestamp: event.timestampIso,
      label: "Retry",
      detail: message.replace("Pattern retry: ", ""),
      tone: "progress",
    };
  }

  if (message.startsWith("Pattern timed out: ")) {
    return {
      id,
      timestamp: event.timestampIso,
      label: "Timed out",
      detail: message.replace("Pattern timed out: ", ""),
      tone: "error",
    };
  }

  if (message.startsWith("Pattern network outage: ")) {
    return {
      id,
      timestamp: event.timestampIso,
      label: "Network / DNS",
      detail: message.replace("Pattern network outage: ", ""),
      tone: "error",
    };
  }

  if (message.startsWith("Pattern hard error: ") || message.startsWith("Pattern error: ")) {
    return {
      id,
      timestamp: event.timestampIso,
      label: "Hard error",
      detail: message.replace(/^Pattern (hard )?error: /, ""),
      tone: "error",
    };
  }

  if (message.startsWith("Scanner finished with status ")) {
    return {
      id,
      timestamp: event.timestampIso,
      label: "Scanner",
      detail: message,
      tone: message.includes("status 0") ? "success" : "error",
    };
  }

  if (message === "Scanner and sync finished.") {
    return {
      id,
      timestamp: event.timestampIso,
      label: "Scanner",
      detail: "Scanner and sync finished",
      tone: "success",
    };
  }

  return null;
}

function summarizeLogLines(logLines: LocalScannerLogLine[]): LocalScannerRunTotals {
  return logLines.reduce<LocalScannerRunTotals>(
    (totals, line) => {
      if (line.label === "Found") totals.found += 1;
      if (line.label === "No results") totals.noResults += 1;
      if (line.label === "Timed out") totals.timedOut += 1;
      if (line.label === "Network / DNS") totals.networkOutages += 1;
      if (line.label === "Hard error") totals.hardErrors += 1;
      if (line.label === "Retry") totals.retries += 1;
      return totals;
    },
    { found: 0, noResults: 0, timedOut: 0, networkOutages: 0, hardErrors: 0, retries: 0 },
  );
}

function summarizeNoResults(logLines: LocalScannerLogLine[]): LocalScannerBreakdownItem[] {
  const counts = new Map<string, LocalScannerBreakdownItem>();
  for (const line of logLines) {
    if (line.label !== "No results") continue;
    const code = line.categoryCode ?? "no_results";
    const label = line.categoryLabel ?? "No results";
    const existing = counts.get(code);
    counts.set(code, {
      code,
      label,
      count: (existing?.count ?? 0) + 1,
    });
  }
  return [...counts.values()].sort((left, right) => right.count - left.count);
}

function routeProgressFromMessage(message: string | null) {
  const match = message?.match(/Route start:\s*(\d+)\/(\d+)\s*.\s*(.*)$/);
  if (!match) return { startedRoutes: null, totalRoutes: null, currentRouteLabel: null };

  return {
    startedRoutes: Number.parseInt(match[1], 10),
    totalRoutes: Number.parseInt(match[2], 10),
    currentRouteLabel: match[3] || null,
  };
}

function currentPatternFromMessage(message: string | null) {
  const match = message?.match(/Pattern start:\s*\d+\/\d+\s*.\s*.*?\s+([A-Z][a-z]{2}\s*->.*)$/);
  return match?.[1] ?? null;
}

function vpsStatusToLocalScannerStatus(status: VpsScannerAgentStatus): LocalScannerStatus {
  const events = status.journal
    .map((line) => parseVpsJournalEvent(line))
    .filter(Boolean)
    .sort((left, right) => left!.timestampMs - right!.timestampMs) as VpsJournalEvent[];
  const logLines = events.map((event) => toVpsLogLine(event)).filter(Boolean) as LocalScannerLogLine[];
  const latestRouteStart = [...events].reverse().find((event) => event.message.startsWith("Route start: ")) ?? null;
  const latestPatternStart = [...events].reverse().find((event) => event.message.startsWith("Pattern start: ")) ?? null;
  const routeProgress = routeProgressFromMessage(latestRouteStart?.message ?? null);
  const remainingRoutes =
    routeProgress.totalRoutes !== null && routeProgress.startedRoutes !== null
      ? Math.max(routeProgress.totalRoutes - routeProgress.startedRoutes, 0)
      : null;
  const lastScannerLine = logLines.at(-1) ?? null;
  const liveTotals = summarizeLogLines(logLines);
  const noResultBreakdown = summarizeNoResults(logLines);
  const startTimestamp = parseSystemdTimestamp(status.service.ExecMainStartTimestamp);
  const exitTimestamp = parseSystemdTimestamp(status.service.ExecMainExitTimestamp);

  return {
    available: true,
    running: status.running,
    totalRoutes: routeProgress.totalRoutes,
    startedRoutes: routeProgress.startedRoutes,
    remainingRoutes,
    startedAt: startTimestamp,
    latestCompletedAt: exitTimestamp,
    latestFinishedAt: status.running ? null : exitTimestamp,
    currentRouteLabel: routeProgress.currentRouteLabel,
    currentPatternLabel: currentPatternFromMessage(latestPatternStart?.message ?? null),
    currentPatternWindowLabel: null,
    latestActivity: lastScannerLine?.detail ?? null,
    recentLogLines: logLines.slice(-120),
    liveTotals: status.running ? liveTotals : null,
    noResultBreakdown: status.running ? noResultBreakdown : [],
    lastRunDurationMs: null,
    lastRunTotals: status.running ? null : liveTotals,
    lastRunNoResultBreakdown: status.running ? [] : noResultBreakdown,
    lastRunLogLines: status.running ? [] : logLines.slice(-120),
  };
}

export async function GET(request: Request) {
  const expectedUser = process.env.OPS_BASIC_AUTH_USER;
  const expectedPassword = process.env.OPS_BASIC_AUTH_PASSWORD;

  if (expectedUser && expectedPassword) {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Basic ")) {
      return unauthorizedResponse();
    }

    try {
      const encoded = authorization.slice("Basic ".length);
      const decoded = atob(encoded);
      const separatorIndex = decoded.indexOf(":");
      const user = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : decoded;
      const password = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : "";

      if (user !== expectedUser || password !== expectedPassword) {
        return unauthorizedResponse();
      }
    } catch {
      return unauthorizedResponse();
    }
  }

  try {
    if (hasVpsScannerAgentConfig()) {
      const status = await callVpsScannerAgent<VpsScannerAgentStatus>("status");
      return NextResponse.json(vpsStatusToLocalScannerStatus(status), {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    const status = await getLocalScannerStatus();

    return NextResponse.json(status, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const payload = serializeError(error);

    return NextResponse.json(
      {
        error: "Scanner status failed.",
        detail: `${payload.error}: ${payload.detail}`,
        stack: payload.stack,
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }
}
