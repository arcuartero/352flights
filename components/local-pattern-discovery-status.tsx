"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import type {
  LocalPatternDiscoveryLogLine,
  LocalPatternDiscoveryRunTotals,
  LocalPatternDiscoveryStatus,
} from "@/lib/local-pattern-discovery-status-shared";

function formatRelativeTime(value: string | null) {
  if (!value) {
    return "just now";
  }

  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 60_000) {
    return "just now";
  }

  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatLogTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function logToneClassName(logLine: LocalPatternDiscoveryLogLine) {
  if (logLine.tone === "success") return "is-success";
  if (logLine.tone === "error") return "is-error";
  if (logLine.tone === "muted") return "is-muted";
  return "is-progress";
}

function buildLiveTotals(totals: LocalPatternDiscoveryRunTotals) {
  return [
    { label: "Uses defaults", value: totals.usesDefaults, tone: "is-muted" },
    { label: "Manual rules", value: totals.manualRules, tone: "is-muted" },
    { label: "New overrides", value: totals.newOverrides, tone: "is-success" },
    { label: "No patterns", value: totals.noSupportedPatterns, tone: "is-error" },
    { label: "Cadence changes", value: totals.cadenceChanges, tone: "is-success" },
    { label: "Hard errors", value: totals.hardErrors, tone: "is-error" },
  ];
}

function formatCollapsedSummary(status: LocalPatternDiscoveryStatus) {
  if (status.running) {
    if (status.startedRoutes !== null && status.totalRoutes !== null) {
      return `${status.startedRoutes}/${status.totalRoutes} routes`;
    }

    return "Checking route cadence";
  }

  return status.latestFinishedAt
    ? `Last finished ${formatRelativeTime(status.latestFinishedAt)}`
    : "No completed discovery yet";
}

type LocalPatternDiscoveryStatusWidgetProps = {
  displayMode?: "floating" | "page";
};

export function LocalPatternDiscoveryStatusWidget({
  displayMode = "floating",
}: LocalPatternDiscoveryStatusWidgetProps) {
  const pathname = usePathname();
  const [status, setStatus] = useState<LocalPatternDiscoveryStatus | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);
  const logFeedRef = useRef<HTMLDivElement | null>(null);
  const isPageMode = displayMode === "page";
  const canCollapse = displayMode === "floating";

  useEffect(() => {
    if (isPageMode) {
      setIsCollapsed(false);
    }
  }, [isPageMode]);

  useEffect(() => {
    let isMounted = true;

    async function loadStatus() {
      try {
        const response = await fetch("/api/ops/pattern-discovery-live-status", {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }

        const nextStatus = (await response.json()) as LocalPatternDiscoveryStatus;
        if (isMounted) {
          setStatus(nextStatus);
        }
      } catch {
        // Quiet polling failure.
      }
    }

    void loadStatus();
    const interval = window.setInterval(loadStatus, 7000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const progressRatio = useMemo(() => {
    if (!status?.running || !status.totalRoutes || status.startedRoutes === null) {
      return 0;
    }

    return Math.min(status.startedRoutes / status.totalRoutes, 1);
  }, [status]);

  useEffect(() => {
    if (!logFeedRef.current || (canCollapse && isCollapsed)) {
      return;
    }

    if (isPinnedToBottom) {
      logFeedRef.current.scrollTop = logFeedRef.current.scrollHeight;
    }
  }, [canCollapse, isCollapsed, isPinnedToBottom, status?.recentLogLines]);

  if (!isPageMode && (pathname.startsWith("/ops/scanner-live") || pathname.startsWith("/ops/dates-scanner"))) {
    return null;
  }

  if (!status) {
    return (
      <section
        className={`ops-scanner-status ${
          isPageMode ? "ops-scanner-status--page" : "ops-scanner-status--floating"
        } is-idle`}
      >
        <div className="ops-scanner-status__header">
          <div>
            <p className="ops-panel__eyebrow">Dates Scanner</p>
            <h2>Loading discovery feed</h2>
          </div>
        </div>
        <p className="ops-scanner-status__meta">
          Checking the latest monthly discovery run and live log feed.
        </p>
      </section>
    );
  }

  if (!status.available) {
    return (
      <section
        className={`ops-scanner-status ${
          isPageMode ? "ops-scanner-status--page" : "ops-scanner-status--floating"
        } is-idle`}
      >
        <div className="ops-scanner-status__header">
          <div>
            <p className="ops-panel__eyebrow">Dates Scanner</p>
            <h2>Discovery feed unavailable</h2>
          </div>
          <span className="ops-send-badge is-warning">Unavailable</span>
        </div>
        <p className="ops-scanner-status__meta">
          This page can only show cadence discovery progress when the app can read the local logs on
          this machine.
        </p>
      </section>
    );
  }

  function handleLogFeedScroll() {
    const element = logFeedRef.current;
    if (!element) {
      return;
    }

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    setIsPinnedToBottom(distanceFromBottom < 24);
  }

  return (
    <section
      aria-live="polite"
      className={`ops-scanner-status ${
        isPageMode ? "ops-scanner-status--page" : "ops-scanner-status--floating"
      } ${
        status.running ? "is-running" : "is-idle"
      } ${canCollapse && isCollapsed ? "is-collapsed" : "is-expanded"}`}
    >
      <div className="ops-scanner-status__header">
        <div>
          <p className="ops-panel__eyebrow">Dates Scanner</p>
          <h2>{status.running ? "Discovering flight cadence" : "Dates scanner idle"}</h2>
        </div>
        <div className="ops-scanner-status__actions">
          <span className={`ops-send-badge ${status.running ? "is-live" : "is-warning"}`}>
            {status.running ? "Running" : "Idle"}
          </span>
          {canCollapse ? (
            <button
              aria-expanded={!isCollapsed}
              className="ops-scanner-status__toggle"
              onClick={() => setIsCollapsed((current) => !current)}
              type="button"
            >
              {isCollapsed ? "Expand" : "Minimize"}
            </button>
          ) : null}
        </div>
      </div>

      {canCollapse && isCollapsed ? (
        <div className="ops-scanner-status__collapsed">
          <p className="ops-scanner-status__meta">{formatCollapsedSummary(status)}</p>
          {status.running && status.currentRouteLabel ? (
            <p className="ops-scanner-status__footnote">{status.currentRouteLabel}</p>
          ) : null}
        </div>
      ) : status.running ? (
        <>
          {status.liveTotals ? (
            <section className="ops-scanner-status__totals" aria-label="Live discovery totals">
              {buildLiveTotals(status.liveTotals).map((item) => (
                <article className={`ops-scanner-status__total ${item.tone}`} key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </section>
          ) : null}
          <div className="ops-scanner-status__progress">
            <strong>
              {status.startedRoutes ?? 0}
              {status.totalRoutes !== null ? `/${status.totalRoutes}` : ""}
            </strong>
            <span>routes checked</span>
          </div>
          <div aria-hidden="true" className="ops-scanner-status__meter">
            <span style={{ width: `${progressRatio * 100}%` }} />
          </div>
          <p className="ops-scanner-status__meta">
            {status.remainingRoutes !== null ? `${status.remainingRoutes} left` : "Counting routes"}
            {status.startedAt ? ` · started ${formatRelativeTime(status.startedAt)}` : ""}
          </p>
          <dl className="ops-scanner-status__details">
            <div>
              <dt>Current route</dt>
              <dd>{status.currentRouteLabel ?? "Preparing first route..."}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>Monthly cadence discovery</dd>
            </div>
          </dl>
          <section className="ops-scanner-status__logs">
            <div className="ops-scanner-status__logs-header">
              <strong>Live feed</strong>
              <span>service cadence and rule decisions</span>
            </div>
            <div className="ops-scanner-status__log-feed" onScroll={handleLogFeedScroll} ref={logFeedRef}>
              {status.recentLogLines.length === 0 ? (
                <p className="ops-scanner-status__empty-feed">Waiting for the first live event...</p>
              ) : (
                status.recentLogLines.map((logLine) => (
                  <article
                    className={`ops-scanner-status__log-line ${logToneClassName(logLine)}`}
                    key={logLine.id}
                  >
                    <span>{formatLogTime(logLine.timestamp)}</span>
                    <strong>{logLine.label}</strong>
                    <p>{logLine.detail}</p>
                    {logLine.secondaryDetail ? (
                      <p className="ops-scanner-status__log-subdetail">{logLine.secondaryDetail}</p>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </section>
        </>
      ) : (
        <>
          <p className="ops-scanner-status__meta">
            {status.latestFinishedAt
              ? `Last finished ${formatRelativeTime(status.latestFinishedAt)}`
              : "No completed discovery run recorded yet"}
          </p>
          {status.latestFinishedAt ? (
            <p className="ops-scanner-status__footnote">
              Last clean finish: {formatDateTime(status.latestFinishedAt)}
            </p>
          ) : null}
          {status.latestFailedAt ? (
            <p className="ops-scanner-status__footnote">
              Last failure: {formatDateTime(status.latestFailedAt)}
            </p>
          ) : null}
          <section className="ops-scanner-status__logs">
            <div className="ops-scanner-status__logs-header">
              <strong>Recent feed</strong>
              <span>last discovery events</span>
            </div>
            <div className="ops-scanner-status__log-feed" onScroll={handleLogFeedScroll} ref={logFeedRef}>
              {status.recentLogLines.length === 0 ? (
                <p className="ops-scanner-status__empty-feed">No recent discovery events yet.</p>
              ) : (
                status.recentLogLines.map((logLine) => (
                  <article
                    className={`ops-scanner-status__log-line ${logToneClassName(logLine)}`}
                    key={logLine.id}
                  >
                    <span>{formatLogTime(logLine.timestamp)}</span>
                    <strong>{logLine.label}</strong>
                    <p>{logLine.detail}</p>
                    {logLine.secondaryDetail ? (
                      <p className="ops-scanner-status__log-subdetail">{logLine.secondaryDetail}</p>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
