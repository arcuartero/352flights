"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Database,
  RefreshCw,
} from "lucide-react";

import type {
  PriceScanDestinationSummary,
  PriceScanPatternSummary,
  PriceScanRouteSummary,
  PriceScanRun,
} from "@/lib/price-scan-runs";

type Props = {
  error: string | null;
  runs: PriceScanRun[];
};

type RunDetailResponse =
  | { ok: true; run: PriceScanRun }
  | { ok: false; reason: string; detail?: string };

type SortDirection = "asc" | "desc";
type SortKind = "number" | "text";
type SortState<Key extends string> = {
  direction: SortDirection;
  key: Key;
};
type SortValue = number | string | null | undefined;

const noResultLabels: Record<string, string> = {
  no_flights_found: "No flights found",
  more_stops_required: "More stops required",
  pattern_not_available: "Pattern unavailable",
  outside_current_window: "Outside current window",
  destination_stay_under_24h: "Stay under 24h",
  validation_rejected: "Validation rejected",
  unknown_no_result: "Other no result",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatDuration(value: number | null) {
  if (value === null) return "In progress";
  const totalMinutes = Math.max(Math.round(value / 60_000), 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours}h ${minutes}m`;
}

function formatMoney(value: number | null, currency: string | null) {
  if (value === null) return "n/a";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency ?? "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function statusLabel(status: string) {
  if (status === "completed") return "Completed";
  if (status === "completed_with_errors") return "Completed with errors";
  if (status === "partial") return "Partial";
  if (status === "failed") return "Failed";
  if (status === "stopped") return "Stopped";
  if (status === "running") return "Running";
  return status;
}

function statusTone(status: string) {
  if (status === "completed") return "is-success";
  if (status === "running") return "is-live";
  if (status === "completed_with_errors" || status === "partial") return "is-warning";
  return "is-error";
}

function percentage(numerator: number, denominator: number) {
  if (denominator <= 0) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function sum(runs: PriceScanRun[], read: (run: PriceScanRun) => number) {
  return runs.reduce((total, run) => total + read(run), 0);
}

function patternOutcomeLabel(pattern: PriceScanPatternSummary) {
  if (pattern.status === "tracked") return "Price found";
  if (pattern.status === "deal") return "Deal found";
  if (pattern.status === "no_results") {
    return noResultLabels[pattern.reason_code ?? ""] ?? "No result";
  }
  if (pattern.error_type === "timeout") return "Timed out";
  if (pattern.error_type === "network_outage") return "Network / DNS";
  return pattern.status === "error" ? "Hard error" : pattern.status;
}

function compareSortValues(left: SortValue, right: SortValue) {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), "en", {
    numeric: true,
    sensitivity: "base",
  });
}

function sortRows<Row, Key extends string>(
  rows: Row[],
  sort: SortState<Key>,
  readValue: (row: Row, key: Key) => SortValue,
) {
  return [...rows].sort((left, right) => {
    const leftValue = readValue(left, sort.key);
    const rightValue = readValue(right, sort.key);
    if (leftValue == null && rightValue == null) return 0;
    if (leftValue == null) return 1;
    if (rightValue == null) return -1;
    const comparison = compareSortValues(
      leftValue,
      rightValue,
    );
    return sort.direction === "asc" ? comparison : -comparison;
  });
}

function nextSort<Key extends string>(
  current: SortState<Key>,
  key: Key,
  kind: SortKind,
): SortState<Key> {
  if (current.key === key) {
    return {
      key,
      direction: current.direction === "asc" ? "desc" : "asc",
    };
  }
  return { key, direction: kind === "number" ? "desc" : "asc" };
}

function SortableHeader<Key extends string>({
  column,
  kind,
  label,
  onSort,
  sort,
  tooltip,
}: {
  column: Key;
  kind: SortKind;
  label: string;
  onSort: (column: Key, kind: SortKind) => void;
  sort: SortState<Key>;
  tooltip: string;
}) {
  const active = sort.key === column;
  const Icon = active
    ? sort.direction === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <th aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        aria-label={`${label}. ${tooltip}`}
        className={active ? "is-active" : undefined}
        onClick={() => onSort(column, kind)}
        title={`${tooltip} Click to sort ${kind === "number" ? "by value" : "alphabetically"}.`}
        type="button"
      >
        <span>{label}</span>
        <Icon aria-hidden="true" size={13} strokeWidth={2} />
      </button>
    </th>
  );
}

type DestinationSortKey =
  | "destination"
  | "routes"
  | "patterns"
  | "rules"
  | "found"
  | "noResult"
  | "timeout"
  | "network"
  | "hard"
  | "retries";

function DestinationSummaryTable({ rows }: { rows: PriceScanDestinationSummary[] }) {
  const [sort, setSort] = useState<SortState<DestinationSortKey>>({
    direction: "asc",
    key: "destination",
  });
  const sortedRows = useMemo(
    () =>
      sortRows(rows, sort, (row, key) => {
        if (key === "destination") return row.destination_city;
        if (key === "routes") return row.routes_started;
        if (key === "patterns") return row.patterns_scanned;
        if (key === "rules") return row.rules_scanned;
        if (key === "found") return row.found_prices;
        if (key === "noResult") return row.no_results;
        if (key === "timeout") return row.timed_out;
        if (key === "network") return row.network_outages;
        if (key === "hard") return row.hard_errors;
        return row.retries;
      }),
    [rows, sort],
  );
  const onSort = (column: DestinationSortKey, kind: SortKind) =>
    setSort((current) => nextSort(current, column, kind));

  return (
    <table>
      <thead>
        <tr>
          <SortableHeader column="destination" kind="text" label="Destination" onSort={onSort} sort={sort} tooltip="City scanned and the destination airports included in that city." />
          <SortableHeader column="routes" kind="number" label="Routes" onSort={onSort} sort={sort} tooltip="Airport routes started compared with the routes planned for this city." />
          <SortableHeader column="patterns" kind="number" label="Patterns" onSort={onSort} sort={sort} tooltip="Date and weekday combinations processed for this city." />
          <SortableHeader column="rules" kind="number" label="Rules" onSort={onSort} sort={sort} tooltip="Actual scanner searches performed, including fallback searches." />
          <SortableHeader column="found" kind="number" label="Found" onSort={onSort} sort={sort} tooltip="Patterns for which the scanner found a valid fare." />
          <SortableHeader column="noResult" kind="number" label="No result" onSort={onSort} sort={sort} tooltip="Patterns completed without an available valid fare." />
          <SortableHeader column="timeout" kind="number" label="Timeout" onSort={onSort} sort={sort} tooltip="Searches stopped because the provider did not answer in time." />
          <SortableHeader column="network" kind="number" label="Net / DNS" onSort={onSort} sort={sort} tooltip="Searches affected by network connectivity or DNS failures." />
          <SortableHeader column="hard" kind="number" label="Hard" onSort={onSort} sort={sort} tooltip="Unexpected scanner or provider errors that were not recoverable." />
          <SortableHeader column="retries" kind="number" label="Retries" onSort={onSort} sort={sort} tooltip="Additional attempts made after a failed or inconclusive search." />
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((destination) => (
          <tr key={destination.destination_city}>
            <td>
              <strong>{destination.destination_city}</strong>
              <small>{destination.destination_airports.join(", ")}</small>
            </td>
            <td>{destination.routes_started}/{destination.routes_planned}</td>
            <td>{destination.patterns_scanned}</td>
            <td>{destination.rules_scanned}</td>
            <td>{destination.found_prices}</td>
            <td>{destination.no_results}</td>
            <td>{destination.timed_out}</td>
            <td>{destination.network_outages}</td>
            <td>{destination.hard_errors}</td>
            <td>{destination.retries}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type RouteSortKey =
  | "route"
  | "destination"
  | "status"
  | "patterns"
  | "rules"
  | "found"
  | "noResult"
  | "timeout"
  | "network"
  | "hard";

function routeStatus(route: PriceScanRouteSummary) {
  return route.completed ? "Completed" : route.started ? "Partial" : "Not started";
}

function RouteAuditTable({ rows }: { rows: PriceScanRouteSummary[] }) {
  const [sort, setSort] = useState<SortState<RouteSortKey>>({
    direction: "asc",
    key: "route",
  });
  const sortedRows = useMemo(
    () =>
      sortRows(rows, sort, (row, key) => {
        if (key === "route") return row.route_label;
        if (key === "destination") return row.destination_city;
        if (key === "status") return routeStatus(row);
        if (key === "patterns") return row.patterns_scanned;
        if (key === "rules") return row.rules_scanned;
        if (key === "found") return row.found_prices;
        if (key === "noResult") return row.no_results;
        if (key === "timeout") return row.timed_out;
        if (key === "network") return row.network_outages;
        return row.hard_errors;
      }),
    [rows, sort],
  );
  const onSort = (column: RouteSortKey, kind: SortKind) =>
    setSort((current) => nextSort(current, column, kind));

  return (
    <table>
      <thead>
        <tr>
          <SortableHeader column="route" kind="text" label="Route" onSort={onSort} sort={sort} tooltip="Origin and destination airport pair processed by the scanner." />
          <SortableHeader column="destination" kind="text" label="Destination" onSort={onSort} sort={sort} tooltip="Destination city associated with the airport route." />
          <SortableHeader column="status" kind="text" label="Status" onSort={onSort} sort={sort} tooltip="Whether this route completed, ran partially, or never started." />
          <SortableHeader column="patterns" kind="number" label="Patterns" onSort={onSort} sort={sort} tooltip="Date and weekday combinations processed for this route." />
          <SortableHeader column="rules" kind="number" label="Rules" onSort={onSort} sort={sort} tooltip="Actual scanner searches performed for this route." />
          <SortableHeader column="found" kind="number" label="Found" onSort={onSort} sort={sort} tooltip="Patterns on this route for which a valid fare was found." />
          <SortableHeader column="noResult" kind="number" label="No result" onSort={onSort} sort={sort} tooltip="Patterns completed without an available valid fare." />
          <SortableHeader column="timeout" kind="number" label="Timeout" onSort={onSort} sort={sort} tooltip="Searches stopped because the provider did not answer in time." />
          <SortableHeader column="network" kind="number" label="Net / DNS" onSort={onSort} sort={sort} tooltip="Searches affected by network connectivity or DNS failures." />
          <SortableHeader column="hard" kind="number" label="Hard" onSort={onSort} sort={sort} tooltip="Unexpected non-recoverable scanner or provider errors." />
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((route) => (
          <tr key={route.route_key}>
            <td><strong>{route.route_label}</strong><small>{route.routing}</small></td>
            <td>{route.destination_city}</td>
            <td>{routeStatus(route)}</td>
            <td>{route.patterns_scanned}</td>
            <td>{route.rules_scanned}</td>
            <td>{route.found_prices}</td>
            <td>{route.no_results}</td>
            <td>{route.timed_out}</td>
            <td>{route.network_outages}</td>
            <td>{route.hard_errors}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type PatternSortKey = "route" | "pattern" | "dates" | "outcome" | "price" | "rules" | "detail";

function PatternAuditTable({ rows }: { rows: PriceScanPatternSummary[] }) {
  const [sort, setSort] = useState<SortState<PatternSortKey>>({
    direction: "asc",
    key: "route",
  });
  const sortedRows = useMemo(
    () =>
      sortRows(rows, sort, (row, key) => {
        if (key === "route") return row.route_label;
        if (key === "pattern") return row.pattern_label;
        if (key === "dates") return row.departure_date;
        if (key === "outcome") return patternOutcomeLabel(row);
        if (key === "price") return row.price;
        if (key === "rules") return row.rules_scanned;
        return row.reason ?? row.error ?? "Completed normally";
      }),
    [rows, sort],
  );
  const onSort = (column: PatternSortKey, kind: SortKind) =>
    setSort((current) => nextSort(current, column, kind));

  return (
    <table>
      <thead>
        <tr>
          <SortableHeader column="route" kind="text" label="Route" onSort={onSort} sort={sort} tooltip="Airport route and destination city associated with this pattern." />
          <SortableHeader column="pattern" kind="text" label="Pattern" onSort={onSort} sort={sort} tooltip="Outbound weekday, return weekday, and trip duration combination." />
          <SortableHeader column="dates" kind="text" label="Dates" onSort={onSort} sort={sort} tooltip="Departure and return dates selected for this execution." />
          <SortableHeader column="outcome" kind="text" label="Outcome" onSort={onSort} sort={sort} tooltip="Final result of the pattern: price, no result, timeout, network failure, or error." />
          <SortableHeader column="price" kind="number" label="Price" onSort={onSort} sort={sort} tooltip="Valid fare found for this pattern, in the displayed currency." />
          <SortableHeader column="rules" kind="number" label="Rules" onSort={onSort} sort={sort} tooltip="Number of actual searches performed for this pattern." />
          <SortableHeader column="detail" kind="text" label="Detail" onSort={onSort} sort={sort} tooltip="Provider result, rejection reason, or technical error recorded for the pattern." />
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((pattern, index) => (
          <tr key={`${pattern.route_key}:${pattern.pattern_key}:${index}`}>
            <td><strong>{pattern.route_label}</strong><small>{pattern.destination_city}</small></td>
            <td><strong>{pattern.pattern_label}</strong><small>{pattern.trip_nights} nights</small></td>
            <td>{pattern.departure_date ?? "n/a"}<small>{pattern.return_date ?? "n/a"}</small></td>
            <td>{patternOutcomeLabel(pattern)}</td>
            <td>{formatMoney(pattern.price, pattern.currency)}</td>
            <td>{pattern.rules_scanned}</td>
            <td>{pattern.reason ?? pattern.error ?? "Completed normally"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PriceScanRunHistory({ error, runs }: Props) {
  const [runLimit, setRunLimit] = useState(Math.min(10, Math.max(runs.length, 1)));
  const [loadedPatterns, setLoadedPatterns] = useState<
    Record<string, PriceScanPatternSummary[]>
  >({});
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<{
    message: string;
    runId: string;
  } | null>(null);
  const visibleRuns = runs.slice(0, runLimit);

  const aggregate = useMemo(() => {
    const destinationNames = new Set<string>();
    const routeKeys = new Set<string>();
    for (const run of visibleRuns) {
      for (const destination of run.destinations) {
        destinationNames.add(destination.destination_city);
      }
      for (const route of run.routes) {
        routeKeys.add(route.route_key);
      }
    }

    const found = sum(visibleRuns, (run) => run.foundPrices);
    const noResults = sum(visibleRuns, (run) => run.noResults);
    const timedOut = sum(visibleRuns, (run) => run.timedOut);
    const network = sum(visibleRuns, (run) => run.networkOutages);
    const hardErrors = sum(visibleRuns, (run) => run.hardErrors);
    const terminalOutcomes = found + noResults + timedOut + network + hardErrors;

    return {
      destinations: destinationNames.size,
      routes: routeKeys.size,
      patterns: sum(visibleRuns, (run) => run.patternsScanned),
      rules: sum(visibleRuns, (run) => run.rulesScanned),
      found,
      deals: sum(visibleRuns, (run) => run.dealCandidates),
      noResults,
      timedOut,
      network,
      hardErrors,
      retries: sum(visibleRuns, (run) => run.retries),
      successRate: percentage(found, terminalOutcomes),
    };
  }, [visibleRuns]);

  const limitOptions = Array.from(
    new Set(
      [10, 25, 50, 100, runs.length]
        .filter((value) => value > 0 && value <= runs.length)
        .sort((left, right) => left - right),
    ),
  );

  async function loadPatterns(runId: string) {
    if (loadedPatterns[runId] || loadingRunId === runId) return;
    setLoadingRunId(runId);
    setLoadError(null);
    try {
      const response = await fetch(`/api/ops/price-scan-runs/${runId}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as RunDetailResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.ok ? "Pattern audit request failed." : payload.detail ?? payload.reason,
        );
      }
      setLoadedPatterns((current) => ({
        ...current,
        [runId]: payload.run.patterns ?? [],
      }));
    } catch (requestError) {
      setLoadError({
        message:
          requestError instanceof Error
            ? requestError.message
            : "Pattern audit request failed.",
        runId,
      });
    } finally {
      setLoadingRunId(null);
    }
  }

  return (
    <section className="ops-panel ops-panel--wide price-scan-history">
      <div className="price-scan-history__header">
        <div>
          <p className="ops-panel__eyebrow">Persistent scan history</p>
          <h2>Price Scanner analysis</h2>
          <p>
            Every run is stored with its coverage, outcomes, retries, failures, and
            route-level detail.
          </p>
        </div>
        {runs.length > 0 ? (
          <label className="price-scan-history__range">
            <span>Aggregate</span>
            <select
              onChange={(event) => setRunLimit(Number(event.target.value))}
              value={runLimit}
            >
              {limitOptions.map((option) => (
                <option key={option} value={option}>
                  Last {option} scan{option === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {error ? (
        <p className="ops-status ops-status--error">
          Scan history could not be read: {error}
        </p>
      ) : null}

      {runs.length === 0 && !error ? (
        <div className="price-scan-history__empty">
          <Database aria-hidden="true" size={22} />
          <div>
            <strong>No stored price scans yet</strong>
            <p>The next Price Scanner run will create the first complete summary.</p>
          </div>
        </div>
      ) : null}

      {runs.length > 0 ? (
        <>
          <div className="price-scan-history__definitions" aria-label="Metric definitions">
            <span><strong>Destinations</strong> unique cities attempted</span>
            <span><strong>Routes</strong> airport pairs attempted</span>
            <span><strong>Patterns</strong> date and weekday combinations processed</span>
            <span><strong>Rules</strong> actual searches, including retries</span>
          </div>

          <section className="price-scan-history__aggregate" aria-label="Aggregated scanner totals">
            <div><span>Scans</span><strong>{visibleRuns.length}</strong></div>
            <div><span>Destinations</span><strong>{aggregate.destinations}</strong></div>
            <div><span>Routes</span><strong>{aggregate.routes}</strong></div>
            <div><span>Patterns</span><strong>{aggregate.patterns}</strong></div>
            <div><span>Rules scanned</span><strong>{aggregate.rules}</strong></div>
            <div className="is-success"><span>Found prices</span><strong>{aggregate.found}</strong></div>
            <div className="is-success"><span>Deal candidates</span><strong>{aggregate.deals}</strong></div>
            <div><span>No results</span><strong>{aggregate.noResults}</strong></div>
            <div className="is-error"><span>Timed out</span><strong>{aggregate.timedOut}</strong></div>
            <div className="is-error"><span>Net / DNS</span><strong>{aggregate.network}</strong></div>
            <div className="is-error"><span>Hard errors</span><strong>{aggregate.hardErrors}</strong></div>
            <div><span>Retries</span><strong>{aggregate.retries}</strong></div>
            <div className="is-rate"><span>Found rate</span><strong>{aggregate.successRate}</strong></div>
          </section>

          <div className="price-scan-history__list">
            {visibleRuns.map((run) => {
              const terminalOutcomes =
                run.foundPrices +
                run.noResults +
                run.timedOut +
                run.networkOutages +
                run.hardErrors;
              const patterns = loadedPatterns[run.id];

              return (
                <details className="price-scan-history__run" key={run.id}>
                  <summary>
                    <div className="price-scan-history__run-identity">
                      <span className={`ops-send-badge ${statusTone(run.status)}`}>
                        {statusLabel(run.status)}
                      </span>
                      <strong>{formatDateTime(run.startedAt)}</strong>
                      <small>{run.scannerSource} · {formatDuration(run.durationMs)}</small>
                    </div>
                    <div className="price-scan-history__run-stat">
                      <span>Coverage</span>
                      <strong>{run.destinationsScanned} destinations · {run.routesStarted}/{run.routesPlanned} routes</strong>
                    </div>
                    <div className="price-scan-history__run-stat">
                      <span>Work</span>
                      <strong>{run.patternsScanned} patterns · {run.rulesScanned} rules</strong>
                    </div>
                    <div className="price-scan-history__run-stat">
                      <span>Outcome</span>
                      <strong>{run.foundPrices} found · {run.noResults} no result</strong>
                    </div>
                    <ChevronDown aria-hidden="true" className="price-scan-history__chevron" size={20} />
                  </summary>

                  <div className="price-scan-history__run-body">
                    <div className="price-scan-history__run-metrics">
                      <div><span>Found rate</span><strong>{percentage(run.foundPrices, terminalOutcomes)}</strong></div>
                      <div><span>Found prices</span><strong>{run.foundPrices}</strong></div>
                      <div><span>No results</span><strong>{run.noResults}</strong></div>
                      <div><span>Timed out</span><strong>{run.timedOut}</strong></div>
                      <div><span>Net / DNS</span><strong>{run.networkOutages}</strong></div>
                      <div><span>Hard errors</span><strong>{run.hardErrors}</strong></div>
                      <div><span>Retries</span><strong>{run.retries}</strong></div>
                      <div><span>Sync</span><strong>{run.syncStatus}</strong></div>
                    </div>

                    <div className="price-scan-history__run-scope">
                      <div>
                        <span>Started</span>
                        <strong>{formatDateTime(run.startedAt)}</strong>
                      </div>
                      <div>
                        <span>Finished</span>
                        <strong>
                          {run.completedAt ? formatDateTime(run.completedAt) : "In progress"}
                        </strong>
                      </div>
                      <div>
                        <span>Duration</span>
                        <strong>{formatDuration(run.durationMs)}</strong>
                      </div>
                      <div>
                        <span>Search dates</span>
                        <strong>
                          {formatDate(run.searchWindowStart)} to {formatDate(run.searchWindowEnd)}
                        </strong>
                      </div>
                      <div>
                        <span>Routes scanned</span>
                        <strong>
                          {run.routesStarted} of {run.routesPlanned}
                          {run.routesCompleted !== run.routesStarted
                            ? ` · ${run.routesCompleted} completed`
                            : ""}
                        </strong>
                      </div>
                      <div className="is-cities">
                        <span>Cities scanned</span>
                        <strong>
                          {run.scannedCities.length > 0
                            ? `${run.scannedCities.length} · ${run.scannedCities.join(", ")}`
                            : "0 · No city started"}
                        </strong>
                      </div>
                    </div>

                    <div className="price-scan-history__price-band">
                      <strong>Found price distribution</strong>
                      <span>Min {formatMoney(run.minPrice, run.currency)}</span>
                      <span>Median {formatMoney(run.medianPrice, run.currency)}</span>
                      <span>Average {formatMoney(run.averagePrice, run.currency)}</span>
                      <span>Max {formatMoney(run.maxPrice, run.currency)}</span>
                    </div>

                    {Object.keys(run.noResultBreakdown).length > 0 ? (
                      <section className="price-scan-history__breakdown">
                        <h3>No result reasons</h3>
                        <div>
                          {Object.entries(run.noResultBreakdown)
                            .sort((left, right) => right[1] - left[1])
                            .map(([reason, count]) => (
                              <span key={reason}>
                                <strong>{count}</strong>{" "}
                                {noResultLabels[reason] ?? reason.replaceAll("_", " ")}
                              </span>
                            ))}
                        </div>
                      </section>
                    ) : null}

                    {run.stoppedReason ? (
                      <p className="ops-status ops-status--error">
                        Run stopped: {run.stoppedReason}
                      </p>
                    ) : null}

                    <section className="price-scan-history__table-section">
                      <div className="price-scan-history__section-head">
                        <div>
                          <h3>Destination summary</h3>
                          <p>Aggregated across all airport routes for each city.</p>
                        </div>
                      </div>
                      <div className="price-scan-history__table-wrap">
                        <DestinationSummaryTable rows={run.destinations} />
                      </div>
                    </section>

                    <section className="price-scan-history__table-section">
                      <div className="price-scan-history__section-head">
                        <div>
                          <h3>Route audit</h3>
                          <p>Every airport route planned for this execution.</p>
                        </div>
                      </div>
                      <div className="price-scan-history__table-wrap">
                        <RouteAuditTable rows={run.routes} />
                      </div>
                    </section>

                    <section className="price-scan-history__table-section">
                      <div className="price-scan-history__section-head">
                        <div>
                          <h3>Pattern audit</h3>
                          <p>Exact weekday and duration rule outcomes for this scan.</p>
                        </div>
                        <button
                          className="ops-button ops-button--ghost"
                          disabled={loadingRunId === run.id || Boolean(patterns)}
                          onClick={() => void loadPatterns(run.id)}
                          type="button"
                        >
                          <RefreshCw aria-hidden="true" size={15} />
                          {patterns
                            ? `${patterns.length} patterns loaded`
                            : loadingRunId === run.id
                              ? "Loading"
                              : "Load pattern audit"}
                        </button>
                      </div>
                      {loadError?.runId === run.id ? (
                        <p className="ops-status ops-status--error">
                          {loadError.message}
                        </p>
                      ) : null}
                      {patterns ? (
                        <div className="price-scan-history__table-wrap is-patterns">
                          <PatternAuditTable rows={patterns} />
                        </div>
                      ) : null}
                    </section>
                  </div>
                </details>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}
