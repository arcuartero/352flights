"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

import type {
  LocalScannerBreakdownItem,
  LocalScannerLogLine,
  LocalScannerNoResultDiagnostic,
  LocalScannerRunTotals,
  LocalScannerStatus,
} from "@/lib/local-scanner-status-shared";

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

function formatCalendarDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatClockDateTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatStayHours(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const wholeHours = Math.round(value);
  const days = Math.floor(wholeHours / 24);
  const hours = wholeHours % 24;

  if (days === 0) {
    return `${hours}h`;
  }

  if (hours === 0) {
    return `${days}d`;
  }

  return `${days}d ${hours}h`;
}

function formatMoney(value: number | null | undefined, currency: string | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (currency === "EUR" || !currency) {
    return `€${Math.round(value)}`;
  }

  return `${currency} ${Math.round(value)}`;
}

function formatCollapsedSummary(status: LocalScannerStatus) {
  if (status.running) {
    if (status.startedRoutes !== null && status.totalRoutes !== null) {
      return `${status.startedRoutes}/${status.totalRoutes} routes`;
    }

    return "Working through routes";
  }

  return status.latestCompletedAt
    ? `Last run ${formatRelativeTime(status.latestCompletedAt)}`
    : "No completed run yet";
}

function formatPatternWithWindow(status: LocalScannerStatus) {
  if (!status.currentPatternLabel) {
    return "Preparing first pattern...";
  }

  if (!status.currentPatternWindowLabel) {
    return status.currentPatternLabel;
  }

  return `${status.currentPatternLabel} (${status.currentPatternWindowLabel})`;
}

function formatRunDuration(durationMs: number | null) {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs <= 0) {
    return "n/a";
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  return `${seconds}s`;
}

function logToneClassName(logLine: LocalScannerLogLine) {
  if (logLine.tone === "success") return "is-success";
  if (logLine.tone === "error") return "is-error";
  if (logLine.tone === "muted") return "is-muted";
  return "is-progress";
}

function buildLiveTotals(totals: LocalScannerRunTotals) {
  return [
    { label: "Found", value: totals.found, tone: "is-success" },
    { label: "No results", value: totals.noResults, tone: "is-muted" },
    { label: "Timed out", value: totals.timedOut, tone: "is-error" },
    { label: "Net / DNS", value: totals.networkOutages, tone: "is-error" },
    { label: "Hard errors", value: totals.hardErrors, tone: "is-error" },
    { label: "Retries", value: totals.retries, tone: "is-progress" },
  ];
}

function buildNoResultRouteLabel(diagnostic: LocalScannerNoResultDiagnostic | null | undefined) {
  if (!diagnostic) {
    return null;
  }

  return diagnostic.destinationCity
    ? `${diagnostic.routeLabel} (${diagnostic.destinationCity})`
    : diagnostic.routeLabel;
}

type LocalScannerStatusWidgetProps = {
  displayMode?: "floating" | "page";
};

export function LocalScannerStatusWidget({
  displayMode = "floating",
}: LocalScannerStatusWidgetProps) {
  const pathname = usePathname();
  const [status, setStatus] = useState<LocalScannerStatus | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);
  const [selectedNoResultCode, setSelectedNoResultCode] = useState<string | null>(null);
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
        const response = await fetch("/api/ops/scanner-status", {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }

        const nextStatus = (await response.json()) as LocalScannerStatus;
        if (isMounted) {
          setStatus(nextStatus);
        }
      } catch {
        // Ignore intermittent polling failures; the widget should stay quiet.
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

  const selectedNoResultBreakdownItem = useMemo(
    () => {
      if (!selectedNoResultCode || !status) {
        return null;
      }

      const sourceBreakdown = status.running ? status.noResultBreakdown : status.lastRunNoResultBreakdown;
      return sourceBreakdown.find((item) => item.code === selectedNoResultCode) ?? null;
    },
    [selectedNoResultCode, status],
  );

  const selectedNoResultLogLines = useMemo(() => {
    if (!selectedNoResultCode || !status) {
      return [];
    }

    const sourceLogLines = status.running ? status.recentLogLines : status.lastRunLogLines;

    return sourceLogLines
      .filter(
        (logLine) =>
          logLine.label === "No results" && logLine.categoryCode === selectedNoResultCode,
      )
      .slice()
      .reverse();
  }, [selectedNoResultCode, status]);

  useEffect(() => {
    if (
      selectedNoResultCode &&
      status &&
      !(status.running ? status.noResultBreakdown : status.lastRunNoResultBreakdown).some(
        (item) => item.code === selectedNoResultCode,
      )
    ) {
      setSelectedNoResultCode(null);
    }
  }, [selectedNoResultCode, status]);

  useEffect(() => {
    if (!selectedNoResultCode) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedNoResultCode(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNoResultCode]);

  useEffect(() => {
    if (!selectedNoResultCode) {
      return undefined;
    }

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = documentElement.style.overflow;

    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";

    return () => {
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [selectedNoResultCode]);

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
    if (!isPageMode) {
      return null;
    }

    return (
      <section className="ops-scanner-status ops-scanner-status--page is-idle">
        <div className="ops-scanner-status__header">
          <div>
            <p className="ops-panel__eyebrow">Price Scanner</p>
            <h2>Loading scanner feed</h2>
          </div>
        </div>
        <p className="ops-scanner-status__meta">
          Checking the latest local scanner status and live log feed.
        </p>
      </section>
    );
  }

  if (!status.available) {
    if (!isPageMode) {
      return null;
    }

    return (
      <section className="ops-scanner-status ops-scanner-status--page is-idle">
        <div className="ops-scanner-status__header">
          <div>
            <p className="ops-panel__eyebrow">Price Scanner</p>
            <h2>Scanner feed unavailable</h2>
          </div>
          <span className="ops-send-badge is-warning">Unavailable</span>
        </div>
        <p className="ops-scanner-status__meta">
          This page can only show live scanner progress when the app can read the local scanner
          logs on this machine.
        </p>
      </section>
    );
  }

  function handleLogFeedScroll() {
    const element = logFeedRef.current;
    if (!element) {
      return;
    }

    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    setIsPinnedToBottom(distanceFromBottom < 24);
  }

  return (
    <aside
      aria-live="polite"
      className={`ops-scanner-status ${
        isPageMode ? "ops-scanner-status--page" : "ops-scanner-status--floating"
      } ${
        status.running ? "is-running" : "is-idle"
      } ${canCollapse && isCollapsed ? "is-collapsed" : "is-expanded"}`}
    >
      <div className="ops-scanner-status__header">
        <div>
          <p className="ops-panel__eyebrow">Price Scanner</p>
          <h2>{status.running ? "Scanning now" : "Scanner idle"}</h2>
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
            <p className="ops-scanner-status__footnote">
              {status.currentRouteLabel}
              {status.currentPatternLabel ? ` · ${formatPatternWithWindow(status)}` : ""}
            </p>
          ) : null}
        </div>
      ) : status.running ? (
        <>
          {status.liveTotals ? (
            <section className="ops-scanner-status__totals" aria-label="Live scan totals">
              {buildLiveTotals(status.liveTotals).map((item) => (
                <article
                  className={`ops-scanner-status__total ${item.tone}`}
                  key={item.label}
                >
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </section>
          ) : null}
          {status.noResultBreakdown.length > 0 ? (
            <section className="ops-scanner-status__breakdown" aria-label="No results breakdown">
              <div className="ops-scanner-status__breakdown-header">
                <strong>No results breakdown</strong>
                <span>{status.liveTotals?.noResults ?? 0} total misses</span>
              </div>
              <div className="ops-scanner-status__breakdown-pills">
                {status.noResultBreakdown.map((item) => (
                  <button
                    className={`ops-scanner-status__breakdown-pill ${
                      selectedNoResultCode === item.code ? "is-active" : ""
                    }`}
                    key={item.code}
                    onClick={() => setSelectedNoResultCode(item.code)}
                    type="button"
                  >
                    {item.count} {item.label}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          <div className="ops-scanner-status__progress">
            <strong>
              {status.startedRoutes ?? 0}
              {status.totalRoutes !== null ? `/${status.totalRoutes}` : ""}
            </strong>
            <span>routes started</span>
          </div>
          <div
            aria-hidden="true"
            className="ops-scanner-status__meter"
          >
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
                <dt>Pattern</dt>
                <dd>{formatPatternWithWindow(status)}</dd>
              </div>
            </dl>
          <section className="ops-scanner-status__logs">
            <div className="ops-scanner-status__logs-header">
              <strong>Live feed</strong>
              <span>results, misses, and errors</span>
            </div>
            <div
              className="ops-scanner-status__log-feed"
              onScroll={handleLogFeedScroll}
              ref={logFeedRef}
            >
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
            {status.latestCompletedAt
              ? `Last finished ${formatRelativeTime(status.latestCompletedAt)}`
              : "No completed run recorded yet"}
          </p>
          {status.lastRunDurationMs !== null ? (
            <p className="ops-scanner-status__footnote">
              Last run duration: {formatRunDuration(status.lastRunDurationMs)}
            </p>
          ) : null}
          {status.latestFinishedAt ? (
            <p className="ops-scanner-status__footnote">
              Last clean finish: {formatDateTime(status.latestFinishedAt)}
            </p>
          ) : null}
          {status.lastRunTotals ? (
            <section className="ops-scanner-status__totals" aria-label="Last run totals">
              {buildLiveTotals(status.lastRunTotals).map((item) => (
                <article
                  className={`ops-scanner-status__total ${item.tone}`}
                  key={item.label}
                >
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </section>
          ) : null}
          {status.lastRunNoResultBreakdown.length > 0 ? (
            <section className="ops-scanner-status__breakdown" aria-label="Last run no results breakdown">
              <div className="ops-scanner-status__breakdown-header">
                <strong>Last run breakdown</strong>
                <span>{status.lastRunTotals?.noResults ?? 0} total misses</span>
              </div>
              <div className="ops-scanner-status__breakdown-pills">
                {status.lastRunNoResultBreakdown.map((item) => (
                  <button
                    className={`ops-scanner-status__breakdown-pill ${
                      selectedNoResultCode === item.code ? "is-active" : ""
                    }`}
                    key={item.code}
                    onClick={() => setSelectedNoResultCode(item.code)}
                    type="button"
                  >
                    {item.count} {item.label}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          <section className="ops-scanner-status__logs">
            <div className="ops-scanner-status__logs-header">
              <strong>Recent feed</strong>
              <span>last scanner events</span>
            </div>
            <div
              className="ops-scanner-status__log-feed"
              onScroll={handleLogFeedScroll}
              ref={logFeedRef}
            >
              {status.recentLogLines.length === 0 ? (
                <p className="ops-scanner-status__empty-feed">No recent scanner events yet.</p>
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
      {selectedNoResultBreakdownItem && typeof document !== "undefined"
        ? createPortal(
        <div
          className="ops-scanner-status__modal-backdrop"
          onMouseDown={() => setSelectedNoResultCode(null)}
          role="presentation"
        >
          <section
            aria-labelledby="scanner-no-result-dialog-title"
            className="ops-scanner-status__modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="ops-scanner-status__modal-header">
              <div>
                <p className="ops-panel__eyebrow">No results breakdown</p>
                <h3 id="scanner-no-result-dialog-title">
                  {selectedNoResultBreakdownItem.code === "outside_current_window"
                    ? "Outside current scan window"
                    : selectedNoResultBreakdownItem.label}
                </h3>
                <p>
                  {selectedNoResultBreakdownItem.count} recent{" "}
                  {selectedNoResultBreakdownItem.count === 1 ? "case" : "cases"} in this scan
                </p>
              </div>
              <button
                className="ops-scanner-status__modal-close"
                onClick={() => setSelectedNoResultCode(null)}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="ops-scanner-status__modal-list">
              {selectedNoResultLogLines.map((logLine) => {
                const diagnostic = logLine.diagnostic;
                const routeLabel = buildNoResultRouteLabel(diagnostic);
                const patternLabel = diagnostic?.patternLabel ?? logLine.detail;
                const outboundDate = formatCalendarDate(diagnostic?.departureDate);
                const returnDate = formatCalendarDate(diagnostic?.returnDate);
                const outboundTime = formatClockDateTime(diagnostic?.outboundDepartureAt);
                const outboundArrival = formatClockDateTime(diagnostic?.outboundArrivalAt);
                const returnDeparture = formatClockDateTime(diagnostic?.returnDepartureAt);
                const returnArrival = formatClockDateTime(diagnostic?.returnArrivalAt);
                const priceLabel = formatMoney(diagnostic?.price, diagnostic?.currency);
                const stayLabel = formatStayHours(diagnostic?.destinationStayHours);
                const searchWindowLabel =
                  diagnostic?.searchWindowStart && diagnostic?.searchWindowEnd
                    ? `${formatCalendarDate(diagnostic.searchWindowStart)} to ${formatCalendarDate(
                        diagnostic.searchWindowEnd,
                      )}`
                    : "Unavailable for this legacy run";
                const exactDatesLabel =
                  outboundDate || returnDate
                    ? `${outboundDate ? `Out ${outboundDate}` : "Out n/a"}\n${
                        returnDate ? `Back ${returnDate}` : "Back n/a"
                      }`
                    : diagnostic?.reasonCode === "outside_current_window"
                      ? "No exact departure/return pair falls inside this scan window"
                    : "Unavailable for this legacy run";

                return (
                  <article className="ops-scanner-status__modal-card" key={logLine.id}>
                    <div className="ops-scanner-status__modal-card-header">
                      <div>
                        <span>{formatLogTime(logLine.timestamp)}</span>
                        <strong>{routeLabel ?? logLine.detail}</strong>
                      </div>
                      <p>{patternLabel}</p>
                    </div>
                    <div className="ops-scanner-status__modal-grid">
                      <div>
                        <span>Travel pattern</span>
                        <strong>{patternLabel}</strong>
                      </div>
                      <div>
                        <span>Search window used</span>
                        <strong>{searchWindowLabel}</strong>
                      </div>
                      <div>
                        <span>Exact dates checked</span>
                        <strong style={{ whiteSpace: "pre-line" }}>{exactDatesLabel}</strong>
                      </div>
                      <div>
                        <span>Reason</span>
                        <strong>
                          {diagnostic?.reason ??
                            logLine.secondaryDetail ??
                            "No extra detail recorded."}
                        </strong>
                      </div>
                      {diagnostic?.routing ? (
                        <div>
                          <span>Routing</span>
                          <strong>{diagnostic.routing}</strong>
                        </div>
                      ) : null}
                      {outboundTime || outboundArrival || returnDeparture || returnArrival ? (
                        <div>
                          <span>Flight times</span>
                          <strong>
                            {outboundTime || outboundArrival
                              ? `Out ${outboundTime ?? "n/a"} -> ${outboundArrival ?? "n/a"}`
                              : "Out n/a"}
                            <br />
                            {returnDeparture || returnArrival
                              ? `Back ${returnDeparture ?? "n/a"} -> ${returnArrival ?? "n/a"}`
                              : "Back n/a"}
                            {stayLabel ? (
                              <>
                                <br />
                                {`Stay ${stayLabel}`}
                              </>
                            ) : null}
                          </strong>
                        </div>
                      ) : null}
                      {diagnostic?.airlineSummary ? (
                        <div>
                          <span>Airline</span>
                          <strong>{diagnostic.airlineSummary}</strong>
                        </div>
                      ) : null}
                      {priceLabel ? (
                        <div>
                          <span>Indicative fare</span>
                          <strong>{priceLabel}</strong>
                        </div>
                      ) : null}
                    </div>
                    <div className="ops-scanner-status__modal-actions">
                      {diagnostic?.skyscannerUrl ? (
                        <a
                          className="ops-scanner-status__modal-link"
                          href={diagnostic.skyscannerUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open in Skyscanner
                        </a>
                      ) : null}
                      {!diagnostic ? (
                        <p className="ops-scanner-status__modal-note">
                          This log line came from an older run before rich no-result diagnostics were
                          captured.
                        </p>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
          ,
          document.body,
        )
        : null}
    </aside>
  );
}
