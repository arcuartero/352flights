import { ensureOpsAuthorized } from "@/lib/ops-auth";
import { NextResponse } from "next/server";

import type { LocalScannerStatus } from "@/lib/local-scanner-status-shared";
import {
  getLatestRunningPriceScanProgress,
  type PriceScanLiveProgress,
} from "@/lib/price-scan-runs";
import { getMacScannerControlState } from "@/lib/mac-scanner-control";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      error: error.name || "Error",
      detail: error.message || "Unknown error",
      stack:
        process.env.NODE_ENV !== "production" ? (error.stack ?? null) : null,
    };
  }

  return {
    error: "UnknownError",
    detail: typeof error === "string" ? error : "Unknown scanner status error",
    stack: null,
  };
}

function breakdownFromProgress(progress: PriceScanLiveProgress) {
  return Object.entries(progress.noResultBreakdown)
    .map(([code, count]) => ({
      code,
      label: code.replaceAll("pattern", "rule").replaceAll("_", " "),
      count,
    }))
    .sort((left, right) => right.count - left.count);
}

function isProgressForActiveService(
  progress: PriceScanLiveProgress,
  serviceStartedAt: string | null,
) {
  if (!serviceStartedAt) return true;
  const differenceMs = Math.abs(
    new Date(progress.startedAt).getTime() -
      new Date(serviceStartedAt).getTime(),
  );
  return Number.isFinite(differenceMs) && differenceMs <= 5 * 60_000;
}

function mergePersistedProgress(
  status: LocalScannerStatus,
  progress: PriceScanLiveProgress | null,
  serviceStartedAt: string | null,
) {
  if (!progress) {
    return status;
  }

  const isVpsProgress = progress.scannerSource.startsWith("vps");
  if (
    isVpsProgress &&
    (!status.running || !isProgressForActiveService(progress, serviceStartedAt))
  ) {
    return status;
  }

  const totalRoutes = progress.routesPlanned || status.totalRoutes;
  const startedRoutes = progress.routesStarted;
  const remainingRoutes =
    totalRoutes === null ? null : Math.max(totalRoutes - startedRoutes, 0);

  return {
    ...status,
    available: true,
    running: true,
    runnerSource: progress.scannerSource,
    controlAvailable: isVpsProgress ? true : status.controlAvailable !== false,
    totalRoutes,
    startedRoutes,
    remainingRoutes,
    startedAt: progress.startedAt,
    currentRouteLabel: progress.currentRouteLabel ?? status.currentRouteLabel,
    currentPatternLabel: isVpsProgress
      ? status.currentPatternLabel
      : progress.currentRuleLabel,
    currentPatternWindowLabel: isVpsProgress
      ? status.currentPatternWindowLabel
      : null,
    latestCompletedAt: null,
    latestFinishedAt: null,
    latestActivity: isVpsProgress
      ? status.latestActivity
      : `Live progress received from ${progress.scannerSource}`,
    recentLogLines: isVpsProgress
      ? status.recentLogLines
      : progress.recentEvents.length > 0
        ? progress.recentEvents
        : [
            {
              id: `persisted:${progress.runKey}:${progress.lastProgressAt ?? progress.updatedAt}`,
              timestamp:
                progress.lastProgressAt ??
                progress.heartbeatAt ??
                progress.updatedAt,
              label: "Mac scanner",
              detail: `${progress.routesStarted}/${totalRoutes ?? "?"} routes started`,
              secondaryDetail: `${progress.foundPrices} verified prices · ${progress.indicativePrices} calendar prices · ${progress.patternsScanned} rules processed`,
              tone: "progress" as const,
            },
          ],
    liveTotals: {
      routesStarted: progress.routesStarted,
      patternsStarted: progress.patternsScanned,
      indicativePrices: progress.indicativePrices,
      calendarQueries: progress.calendarQueries,
      exactQueries: progress.exactQueries,
      found: progress.foundPrices,
      noResults: progress.noResults,
      timedOut: progress.timedOut,
      networkOutages: progress.networkOutages,
      hardErrors: progress.hardErrors,
      retries: progress.retries,
    },
    noResultBreakdown: breakdownFromProgress(progress),
  } satisfies LocalScannerStatus;
}

export async function GET(request: Request) {
  const unauthorized = ensureOpsAuthorized(request);
  if (unauthorized) return unauthorized;

  try {
    const [control, persistedProgress] = await Promise.all([
      getMacScannerControlState("price_scanner"),
      getLatestRunningPriceScanProgress(),
    ]);
    const controllerStatus: LocalScannerStatus = {
      available: control.configured,
      running: control.priceScannerRunning,
      runnerSource: "mac",
      controlAvailable: control.online,
      totalRoutes: null,
      startedRoutes: null,
      remainingRoutes: null,
      startedAt: null,
      latestCompletedAt: null,
      latestFinishedAt: null,
      currentRouteLabel: null,
      currentPatternLabel: null,
      currentPatternWindowLabel: null,
      latestActivity: control.online
        ? "Mac controller connected"
        : "Mac controller offline",
      recentLogLines: [],
      liveTotals: null,
      noResultBreakdown: [],
      lastRunDurationMs: null,
      lastRunTotals: null,
      lastRunNoResultBreakdown: [],
      lastRunLogLines: [],
    };
    const status = mergePersistedProgress(
      controllerStatus,
      persistedProgress.progress,
      null,
    );

    return NextResponse.json(
      {
        ...status,
        pendingAction: control.pendingCommand?.action ?? null,
        pendingCommandStatus: control.pendingCommand?.status ?? null,
        controllerLastSeenAt: control.lastSeenAt,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
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
