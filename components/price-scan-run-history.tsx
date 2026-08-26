"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Database,
  FileText,
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

type RunHistoryResponse =
  | { ok: true; runs: PriceScanRun[] }
  | { ok: false; reason: string; detail?: string };

type SortDirection = "asc" | "desc";
type SortKind = "number" | "text";
type SortState<Key extends string> = {
  direction: SortDirection;
  key: Key;
};
type SortValue = number | string | null | undefined;

type RunExplanation = {
  generatedAt: string;
  headline: string;
  work: string;
  findings: string;
  issues: string;
  impact: string;
};

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

function formatDuration(value: number | null, status: string) {
  if (value === null) return status === "running" ? "In progress" : "Duration unavailable";
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

function formatFlightTime(value: string | null) {
  if (!value) return "time unavailable";
  const match = value.match(/T(\d{2}:\d{2})/);
  return match?.[1] ?? value;
}

function itineraryDetail(pattern: PriceScanPatternSummary) {
  if (!pattern.airline) return pattern.reason ?? pattern.error ?? "Itinerary details unavailable";
  const outbound = `${formatFlightTime(pattern.outbound_departure_at)}–${formatFlightTime(pattern.outbound_arrival_at)}`;
  const inbound = `${formatFlightTime(pattern.return_departure_at)}–${formatFlightTime(pattern.return_arrival_at)}`;
  const stops = Math.max(
    pattern.outbound_stop_count ?? 0,
    pattern.return_stop_count ?? 0,
  );
  return `${pattern.airline_code ? `${pattern.airline_code} · ` : ""}${pattern.airline} · Out ${outbound} · Back ${inbound} · ${stops === 0 ? "Direct" : `${stops} stop${stops === 1 ? "" : "s"}`}`;
}

function ItineraryDetail({ pattern }: { pattern: PriceScanPatternSummary }) {
  if (!pattern.airline) return pattern.reason ?? pattern.error ?? "Itinerary details unavailable";
  const stops = Math.max(
    pattern.outbound_stop_count ?? 0,
    pattern.return_stop_count ?? 0,
  );
  return (
    <>
      <strong>{pattern.airline_code ? `${pattern.airline_code} · ` : ""}{pattern.airline}</strong>
      <small>
        Out {formatFlightTime(pattern.outbound_departure_at)}–{formatFlightTime(pattern.outbound_arrival_at)} · Back {formatFlightTime(pattern.return_departure_at)}–{formatFlightTime(pattern.return_arrival_at)} · {stops === 0 ? "Direct" : `${stops} stop${stops === 1 ? "" : "s"}`}
      </small>
    </>
  );
}

function statusLabel(run: PriceScanRun) {
  if (run.stoppedReasonCode === "provider_unavailable") return "Proveedor no disponible";
  if (run.stoppedReasonCode === "heartbeat_expired") return "Stale / unverified";
  if (run.stoppedReasonCode === "superseded_by_new_run") return "Stopped automatically";
  if (run.status === "completed") return "Completed";
  if (run.status === "completed_with_errors") return "Completed with errors";
  if (run.status === "partial") return "Partial";
  if (run.status === "failed") return "Failed";
  if (run.status === "stopped") return "Stopped";
  if (run.status === "running") return "Running";
  return run.status;
}

function statusTone(run: PriceScanRun) {
  if (run.stoppedReasonCode === "heartbeat_expired") return "is-warning";
  if (run.status === "completed") return "is-success";
  if (run.status === "running") return "is-live";
  if (run.status === "completed_with_errors" || run.status === "partial") return "is-warning";
  return "is-error";
}

function percentage(numerator: number, denominator: number) {
  if (denominator <= 0) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function sum(runs: PriceScanRun[], read: (run: PriceScanRun) => number) {
  return runs.reduce((total, run) => total + read(run), 0);
}

function plural(value: number, singular: string, pluralForm = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

function spanishList(values: string[]) {
  return new Intl.ListFormat("es", {
    style: "long",
    type: "conjunction",
  }).format(values);
}

function syncCount(run: PriceScanRun, key: string) {
  const value = run.syncSummary[key];
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildRunExplanation(run: PriceScanRun): RunExplanation {
  const terminalOutcomes =
    run.foundPrices +
    run.noResults +
    run.timedOut +
    run.networkOutages +
    run.hardErrors;
  const foundRate = percentage(run.foundPrices, terminalOutcomes);
  const completedCoverage = percentage(run.routesCompleted, run.routesPlanned);
  const problemCount = run.timedOut + run.networkOutages + run.hardErrors;
  const pendingRoutes = Math.max(run.routesPlanned - run.routesCompleted, 0);
  const topDestinations = [...run.destinations]
    .filter((destination) => destination.found_prices > 0)
    .sort((left, right) => right.found_prices - left.found_prices)
    .slice(0, 3)
    .map((destination) => destination.destination_city);
  const topDestinationText = topDestinations.length > 0
    ? ` Las ciudades con más resultados fueron ${spanishList(topDestinations)}.`
    : "";
  const dominantNoResult = Object.entries(run.noResultBreakdown)
    .sort((left, right) => right[1] - left[1])[0];
  const dominantNoResultText = dominantNoResult
    ? ` La causa más repetida sin resultado fue “${
        noResultLabels[dominantNoResult[0]] ?? dominantNoResult[0].replaceAll("_", " ")
      }” (${dominantNoResult[1]}).`
    : "";
  const rateLimited = Number(run.errorBreakdown.rate_limited ?? 0);
  const syncedSnapshots = syncCount(run, "snapshots_synced");

  let headline = "Este escaneo terminó y dejó resultados utilizables.";
  if (run.status === "running") {
    headline = "Este escaneo sigue en marcha; las cifras todavía pueden aumentar.";
  } else if (run.stoppedReasonCode === "provider_unavailable") {
    headline = "El proveedor de vuelos no estaba disponible y el escaneo se detuvo automáticamente.";
  } else if (run.stoppedReasonCode === "heartbeat_expired") {
    headline = "Este escaneo dejó de enviar actividad real y se cerró automáticamente conservando sus resultados.";
  } else if (run.status === "failed") {
    headline = "Este escaneo falló antes de completar el trabajo previsto.";
  } else if (run.status === "stopped") {
    headline = "Este escaneo fue detenido antes de completar todas las rutas.";
  } else if (run.status === "completed_with_errors" || run.status === "partial") {
    headline = "Este escaneo produjo precios, pero terminó con trabajo incompleto o incidencias.";
  }

  const work = [
    `Revisó ${plural(run.destinationsScanned, "ciudad", "ciudades")} y ${run.routesStarted} de ${run.routesPlanned} rutas previstas (${completedCoverage} completado).`,
    `Procesó ${plural(run.patternsScanned, "combinación", "combinaciones")} de fechas y realizó ${plural(run.rulesScanned, "búsqueda", "búsquedas")} reales.`,
    run.searchWindowStart && run.searchWindowEnd
      ? `El periodo analizado fue del ${formatDate(run.searchWindowStart)} al ${formatDate(run.searchWindowEnd)}.`
      : "El periodo exacto de búsqueda no quedó registrado.",
  ].join(" ");

  const priceSummary = run.foundPrices > 0
    ? `Los precios encontrados van de ${formatMoney(run.minPrice, run.currency)} a ${formatMoney(run.maxPrice, run.currency)}, con una mediana de ${formatMoney(run.medianPrice, run.currency)}.`
    : "No encontró una tarifa válida nueva.";
  const findings = `Encontró ${plural(run.foundPrices, "precio", "precios")} o itinerarios válidos (${foundRate} de los resultados finales) y marcó ${plural(run.dealCandidates, "candidato a oferta", "candidatos a oferta")}. ${priceSummary}${topDestinationText}`;

  let issues = `Hubo ${plural(run.noResults, "búsqueda sin vuelo válido", "búsquedas sin vuelo válido")} y ${plural(problemCount, "incidencia técnica", "incidencias técnicas")}: ${run.timedOut} por espera agotada, ${run.networkOutages} de red/DNS y ${run.hardErrors} errores no recuperados.`;
  if (run.retries > 0) {
    issues += ` El escáner hizo ${plural(run.retries, "reintento")} para recuperar búsquedas.`;
  }
  if (rateLimited > 0) {
    issues += ` ${plural(rateLimited, "fallo", "fallos")} fueron límites 429 del proveedor.`;
  }
  issues += dominantNoResultText;
  if (problemCount === 0 && run.noResults === 0) {
    issues = "No se registraron errores técnicos ni búsquedas sin resultado en los datos actuales.";
  }
  if (run.stoppedReasonCode === "provider_unavailable") {
    issues = `El proveedor respondió sin datos utilizables. El sistema lo reconoció como una incidencia técnica y evitó continuar con ${plural(pendingRoutes, "ruta pendiente", "rutas pendientes")}.`;
  }

  let impact = "Todavía no hay precios nuevos de este registro que puedan afectar a la web pública.";
  if (run.status === "running") {
    impact = `La web puede ir recibiendo resultados mientras continúa el escaneo. Por ahora hay ${plural(run.dealCandidates, "precio especialmente interesante", "precios especialmente interesantes")} que pueden destacar para el usuario tras la sincronización.`;
  } else if (run.syncStatus === "completed") {
    const syncDetail = syncedSnapshots > 0
      ? ` Se sincronizaron ${plural(syncedSnapshots, "registro de precio", "registros de precio")}.`
      : " La sincronización consta como completada.";
    impact = `${plural(run.foundPrices, "resultado válido", "resultados válidos")} quedaron disponibles para actualizar comparaciones, medias mensuales y listados de rutas.${syncDetail} ${plural(run.dealCandidates, "precio", "precios")} cumplen los criterios para ser candidatos a oferta visible.`;
  } else if (run.foundPrices > 0) {
    impact = `El escáner encontró ${plural(run.foundPrices, "precio", "precios")}, pero la sincronización figura como “${run.syncStatus}”. Hasta que termine, la web puede no reflejar todos esos resultados.`;
  }
  if (pendingRoutes > 0) {
    impact += ` Quedaron ${plural(pendingRoutes, "ruta", "rutas")} sin completar, por lo que esas rutas pueden conservar información anterior o mostrar menos opciones nuevas.`;
  }
  if (run.stoppedReasonCode === "provider_unavailable") {
    impact = "No se publicaron falsos resultados de “sin vuelos”. Los precios anteriores permanecen disponibles y el scanner podrá intentarlo de nuevo cuando el proveedor vuelva a responder correctamente.";
  }

  return {
    generatedAt: new Date().toISOString(),
    headline,
    work,
    findings,
    issues,
    impact,
  };
}

function patternOutcomeLabel(pattern: PriceScanPatternSummary) {
  if (pattern.status === "tracked") return "Price found";
  if (pattern.status === "deal") return "Deal found";
  if (pattern.status === "no_results") {
    return noResultLabels[pattern.reason_code ?? ""] ?? "No result";
  }
  if (pattern.error_type === "timeout") return "Timed out";
  if (pattern.error_type === "network_outage") return "Network / DNS";
  if (pattern.error_type === "provider_unavailable") return "Proveedor no disponible";
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

function problemMetricClass(value: number) {
  return value === 0 ? undefined : "is-problem-metric";
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
            <td data-label="Destination">
              <strong>{destination.destination_city}</strong>
              <small>{destination.destination_airports.join(", ")}</small>
            </td>
            <td data-label="Routes">{destination.routes_started}/{destination.routes_planned}</td>
            <td data-label="Patterns">{destination.patterns_scanned}</td>
            <td data-label="Rules">{destination.rules_scanned}</td>
            <td data-label="Found">{destination.found_prices}</td>
            <td className={problemMetricClass(destination.no_results)} data-label="No result">{destination.no_results}</td>
            <td className={problemMetricClass(destination.timed_out)} data-label="Timeout">{destination.timed_out}</td>
            <td className={problemMetricClass(destination.network_outages)} data-label="Net / DNS">{destination.network_outages}</td>
            <td className={problemMetricClass(destination.hard_errors)} data-label="Hard errors">{destination.hard_errors}</td>
            <td className={problemMetricClass(destination.retries)} data-label="Retries">{destination.retries}</td>
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
  | "hard"
  | "retries";

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
        if (key === "hard") return row.hard_errors;
        return row.retries;
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
          <SortableHeader column="retries" kind="number" label="Retries" onSort={onSort} sort={sort} tooltip="Additional attempts made after a failed or inconclusive route search." />
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((route) => (
          <tr key={route.route_key}>
            <td data-label="Route"><strong>{route.route_label}</strong><small>{route.routing}</small></td>
            <td data-label="Destination">{route.destination_city}</td>
            <td data-label="Status">{routeStatus(route)}</td>
            <td data-label="Patterns">{route.patterns_scanned}</td>
            <td data-label="Rules">{route.rules_scanned}</td>
            <td data-label="Found">{route.found_prices}</td>
            <td className={problemMetricClass(route.no_results)} data-label="No result">{route.no_results}</td>
            <td className={problemMetricClass(route.timed_out)} data-label="Timeout">{route.timed_out}</td>
            <td className={problemMetricClass(route.network_outages)} data-label="Net / DNS">{route.network_outages}</td>
            <td className={problemMetricClass(route.hard_errors)} data-label="Hard errors">{route.hard_errors}</td>
            <td className={problemMetricClass(route.retries)} data-label="Retries">{route.retries}</td>
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
        return itineraryDetail(row);
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
          <SortableHeader column="detail" kind="text" label="Itinerary / detail" onSort={onSort} sort={sort} tooltip="Airline, outbound and return times, stops, rejection reason, or technical error. A pattern can contain several distinct itineraries." />
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((pattern, index) => (
          <tr key={`${pattern.route_key}:${pattern.pattern_key}:${index}`}>
            <td data-label="Route"><strong>{pattern.route_label}</strong><small>{pattern.destination_city}</small></td>
            <td data-label="Pattern"><strong>{pattern.pattern_label}</strong><small>{pattern.trip_nights} nights</small></td>
            <td data-label="Dates">{pattern.departure_date ?? "n/a"}<small>{pattern.return_date ?? "n/a"}</small></td>
            <td data-label="Outcome">{patternOutcomeLabel(pattern)}</td>
            <td data-label="Price">{formatMoney(pattern.price, pattern.currency)}</td>
            <td data-label="Rules">{pattern.rules_scanned}</td>
            <td data-label="Itinerary / detail"><ItineraryDetail pattern={pattern} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PriceScanRunHistory({ error, runs }: Props) {
  const [liveRuns, setLiveRuns] = useState(runs);
  const [liveError, setLiveError] = useState(error);
  const [isInitialLoading, setIsInitialLoading] = useState(runs.length === 0 && !error);
  const [runLimit, setRunLimit] = useState(Math.min(10, Math.max(runs.length, 1)));
  const [loadedPatterns, setLoadedPatterns] = useState<
    Record<string, PriceScanPatternSummary[]>
  >({});
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<{
    message: string;
    runId: string;
  } | null>(null);
  const [explanations, setExplanations] = useState<Record<string, RunExplanation>>({});
  const [refreshingExplanationRunId, setRefreshingExplanationRunId] = useState<
    string | null
  >(null);
  const [explanationError, setExplanationError] = useState<{
    message: string;
    runId: string;
  } | null>(null);
  const loadedPatternRunIds = useRef(new Set<string>());
  const runningPatternRunIds = useRef(new Set<string>());
  const visibleRuns = liveRuns.slice(0, runLimit);

  useEffect(() => {
    let disposed = false;
    let controller: AbortController | null = null;

    async function refreshRuns() {
      if (document.visibilityState === "hidden") return;
      if (controller) return;
      controller = new AbortController();
      const activeController = controller;
      try {
        const response = await fetch("/api/ops/price-scan-runs", {
          cache: "no-store",
          signal: activeController.signal,
        });
        const payload = (await response.json()) as RunHistoryResponse;
        if (!response.ok || !payload.ok) {
          throw new Error(payload.ok ? "Scan history refresh failed." : payload.detail ?? payload.reason);
        }
        if (!disposed) {
          setLiveRuns(payload.runs);
          setLiveError(null);
          setRunLimit((current) =>
            runs.length === 0
              ? Math.min(10, Math.max(payload.runs.length, 1))
              : Math.min(current, Math.max(payload.runs.length, 1)),
          );
        }
        const runningLoadedIds = payload.runs
          .filter((run) => {
            if (!loadedPatternRunIds.current.has(run.id)) return false;
            if (run.status === "running") {
              runningPatternRunIds.current.add(run.id);
              return true;
            }
            if (runningPatternRunIds.current.has(run.id)) {
              runningPatternRunIds.current.delete(run.id);
              return true;
            }
            return false;
          })
          .map((run) => run.id);
        const refreshedDetails = await Promise.allSettled(
          runningLoadedIds.map(async (runId) => {
            const detailResponse = await fetch(`/api/ops/price-scan-runs/${runId}`, {
              cache: "no-store",
              signal: controller?.signal,
            });
            const detailPayload = (await detailResponse.json()) as RunDetailResponse;
            if (!detailResponse.ok || !detailPayload.ok) {
              throw new Error("Pattern refresh failed.");
            }
            return [runId, detailPayload.run.patterns ?? []] as const;
          }),
        );
        if (!disposed) {
          setLoadedPatterns((current) => {
            const next = { ...current };
            for (const result of refreshedDetails) {
              if (result.status === "fulfilled") next[result.value[0]] = result.value[1];
            }
            return next;
          });
        }
      } catch (requestError) {
        if (!disposed && !(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setLiveError(
            requestError instanceof Error ? requestError.message : "Scan history refresh failed.",
          );
        }
      } finally {
        if (controller === activeController) controller = null;
        if (!disposed) setIsInitialLoading(false);
      }
    }

    void refreshRuns();
    const interval = window.setInterval(() => void refreshRuns(), 15_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshRuns();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

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
      [10, 25, 50, 100, liveRuns.length]
        .filter((value) => value > 0 && value <= liveRuns.length)
        .sort((left, right) => left - right),
    ),
  );

  async function loadPatterns(runId: string) {
    if (loadingRunId === runId) return;
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
      loadedPatternRunIds.current.add(runId);
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

  function explainRunWhenOpened(run: PriceScanRun) {
    setExplanations((current) => {
      if (current[run.id]) return current;
      return { ...current, [run.id]: buildRunExplanation(run) };
    });
  }

  async function refreshExplanation(run: PriceScanRun) {
    if (refreshingExplanationRunId === run.id) return;
    setRefreshingExplanationRunId(run.id);
    setExplanationError(null);
    try {
      const response = await fetch(`/api/ops/price-scan-runs/${run.id}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as RunDetailResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.ok
            ? "No se pudo actualizar la explicación."
            : payload.detail ?? payload.reason,
        );
      }
      setLiveRuns((current) =>
        current.map((item) => (item.id === run.id ? payload.run : item)),
      );
      if (payload.run.patterns) {
        setLoadedPatterns((current) => ({
          ...current,
          [run.id]: payload.run.patterns ?? [],
        }));
      }
      setExplanations((current) => ({
        ...current,
        [run.id]: buildRunExplanation(payload.run),
      }));
    } catch (requestError) {
      setExplanationError({
        message:
          requestError instanceof Error
            ? requestError.message
            : "No se pudo actualizar la explicación.",
        runId: run.id,
      });
    } finally {
      setRefreshingExplanationRunId(null);
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
        {liveRuns.length > 0 ? (
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

      {liveError ? (
        <p className="ops-status ops-status--error">
          Scan history could not be refreshed: {liveError}
        </p>
      ) : null}

      {isInitialLoading ? (
        <div className="price-scan-history__empty" role="status">
          <RefreshCw aria-hidden="true" className="is-spinning" size={22} />
          <div>
            <strong>Loading scan history</strong>
            <p>The page is ready while the stored runs load independently.</p>
          </div>
        </div>
      ) : null}

      {liveRuns.length === 0 && !liveError && !isInitialLoading ? (
        <div className="price-scan-history__empty">
          <Database aria-hidden="true" size={22} />
          <div>
            <strong>No stored price scans yet</strong>
            <p>The next Price Scanner run will create the first complete summary.</p>
          </div>
        </div>
      ) : null}

      {liveRuns.length > 0 ? (
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
              const explanation = explanations[run.id];

              return (
                <details
                  className="price-scan-history__run"
                  key={run.id}
                  onToggle={(event) => {
                    if (event.currentTarget.open) explainRunWhenOpened(run);
                  }}
                >
                  <summary>
                    <div className="price-scan-history__run-identity">
                      <span className={`ops-send-badge ${statusTone(run)}`}>
                        {statusLabel(run)}
                      </span>
                      <strong>{formatDateTime(run.startedAt)}</strong>
                      <small>{run.scannerSource} · {formatDuration(run.durationMs, run.status)}</small>
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
                    {explanation ? (
                      <section
                        aria-label="Explicación sencilla del escaneo"
                        className="price-scan-history__explanation"
                      >
                        <div className="price-scan-history__explanation-head">
                          <div>
                            <p className="ops-panel__eyebrow">Resumen fácil</p>
                            <h3>Qué pasó en este escaneo</h3>
                          </div>
                          <button
                            className="ops-button ops-button--ghost"
                            disabled={refreshingExplanationRunId === run.id}
                            onClick={() => void refreshExplanation(run)}
                            type="button"
                          >
                            <RefreshCw
                              aria-hidden="true"
                              className={
                                refreshingExplanationRunId === run.id
                                  ? "is-spinning"
                                  : undefined
                              }
                              size={15}
                            />
                            {refreshingExplanationRunId === run.id
                              ? "Actualizando"
                              : "Actualizar explicación"}
                          </button>
                        </div>
                        <div className="price-scan-history__explanation-lead">
                          <FileText aria-hidden="true" size={20} />
                          <strong>{explanation.headline}</strong>
                        </div>
                        <div className="price-scan-history__explanation-grid">
                          <article>
                            <span>Qué hizo</span>
                            <p>{explanation.work}</p>
                          </article>
                          <article>
                            <span>Qué encontró</span>
                            <p>{explanation.findings}</p>
                          </article>
                          <article>
                            <span>Qué problemas hubo</span>
                            <p>{explanation.issues}</p>
                          </article>
                          <article className="is-impact">
                            <span>Impacto para el usuario y la web</span>
                            <p>{explanation.impact}</p>
                          </article>
                        </div>
                        <small>
                          Generado con los datos guardados a las {formatDateTime(explanation.generatedAt)}.
                        </small>
                        {explanationError?.runId === run.id ? (
                          <p className="ops-status ops-status--error">
                            {explanationError.message}
                          </p>
                        ) : null}
                      </section>
                    ) : null}

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
                        <strong>{formatDuration(run.durationMs, run.status)}</strong>
                      </div>
                      <div>
                        <span>Last real activity</span>
                        <strong>
                          {run.heartbeatAt || run.lastProgressAt
                            ? formatDateTime(run.heartbeatAt ?? run.lastProgressAt ?? run.startedAt)
                            : "Not recorded"}
                        </strong>
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
                      <p
                        className={`ops-status ${
                          run.stoppedReasonCode === "heartbeat_expired"
                            ? "ops-status--warning"
                            : "ops-status--error"
                        }`}
                      >
                        {run.stoppedReasonCode === "provider_unavailable"
                          ? "Proveedor no disponible: "
                          : "Run stopped: "}
                        {run.stoppedReason}
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
                          <p>Each found row is a distinct itinerary; one pattern and date pair can contain several schedules and prices.</p>
                        </div>
                        <button
                          className="ops-button ops-button--ghost"
                          disabled={loadingRunId === run.id}
                          onClick={() => void loadPatterns(run.id)}
                          type="button"
                        >
                          <RefreshCw aria-hidden="true" size={15} />
                          {patterns
                            ? `${patterns.length} results · Refresh`
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
