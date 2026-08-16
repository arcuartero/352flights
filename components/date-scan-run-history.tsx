"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Database, FileText, RefreshCw } from "lucide-react";

import type { DateScanRun } from "@/lib/date-scan-runs";

type Props = { error: string | null; runs: DateScanRun[] };
type Response = { ok: true; runs: DateScanRun[] } | { ok: false; reason: string; detail?: string };

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(value: number | null) {
  if (value === null) return "En curso";
  const minutes = Math.max(Math.round(value / 60_000), 0);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes} min`;
}

function statusLabel(status: string) {
  return {
    completed: "Completado",
    completed_with_errors: "Completado con errores",
    running: "En curso",
    failed: "Fallido",
    stopped: "Detenido",
    partial: "Parcial",
  }[status] ?? status;
}

function statusTone(status: string) {
  if (status === "completed") return "is-success";
  if (status === "running") return "is-live";
  if (status === "completed_with_errors" || status === "partial") return "is-warning";
  return "is-error";
}

function currentRouteLabel(run: DateScanRun) {
  return run.routes.at(-1)?.route_label ?? "Preparando la siguiente ruta";
}

function compactFailureReason(value: string | null) {
  if (!value) return "Motivo no registrado";
  return value.length > 150 ? `${value.slice(0, 147)}…` : value;
}

function routeFailureSummary(run: DateScanRun) {
  const failedRoutes = run.routes.filter((route) => route.error);
  if (failedRoutes.length === 0) return null;
  const timeouts = failedRoutes.filter((route) => /timed out|timeout/i.test(route.error ?? ""));
  if (timeouts.length === failedRoutes.length) {
    return `${timeouts.length} ruta${timeouts.length === 1 ? "" : "s"} agotaron el tiempo de espera: ${timeouts.map((route) => route.route_label).join(", ")}.`;
  }
  return failedRoutes
    .slice(0, 3)
    .map((route) => `${route.route_label}: ${compactFailureReason(route.error)}`)
    .join(" ");
}

function buildExplanation(run: DateScanRun) {
  const pending = Math.max(run.routesPlanned - run.routesCompleted, 0);
  const topRoutes = run.routes
    .filter((route) => route.departures_detected > 0)
    .sort((a, b) => b.departures_detected - a.departures_detected)
    .slice(0, 3)
    .map((route) => route.route_label)
    .join(", ");

  let headline = "El Date Scanner terminó y guardó sus resultados.";
  if (run.status === "running") headline = `El Date Scanner sigue trabajando: ${run.routesCompleted} de ${run.routesPlanned} rutas revisadas.`;
  if (run.status === "failed") headline = "El Date Scanner falló antes de completar el trabajo previsto.";
  if (run.status === "stopped" || run.status === "partial") headline = "El Date Scanner terminó de forma parcial y dejó guardado lo que pudo comprobar.";
  if (run.status === "completed_with_errors") headline = "El Date Scanner terminó, pero algunas rutas tuvieron incidencias.";

  const partialNote = run.status === "running"
    ? " Son cifras parciales: aumentarán cuando termine cada ruta restante."
    : "";
  const routeFailures = routeFailureSummary(run);

  return {
    headline,
    work: `Hasta ahora ha comprobado ${run.destinationsScanned} ciudades y ${run.routesCompleted} de ${run.routesPlanned} rutas. Ha revisado ${run.serviceMonthsScanned} meses de calendario y detectado ${run.departuresDetected} fechas de salida.${partialNote}`,
    findings: `Hasta ahora hay ${run.cadenceChanges} cambios de cadencia registrados y ${run.skippedComplete} rutas omitidas por estar completas.${topRoutes ? ` Las rutas con más salidas detectadas son ${topRoutes}.` : ""}${partialNote}`,
    issues: `${run.noDatesFound} rutas no han devuelto fechas y ${run.hardErrors} han tenido errores técnicos.${pending > 0 ? ` Quedan ${pending} rutas pendientes.` : ""}${run.error ? ` Motivo del fallo: ${run.error}` : ""}${routeFailures ? ` ${routeFailures}` : ""}`,
  };
}

function runSummary(run: DateScanRun) {
  if (run.status === "running") {
    return {
      coverageLabel: "Progreso",
      coverage: `${run.routesCompleted} de ${run.routesPlanned} rutas`,
      calendarLabel: "Pendientes",
      calendar: `${Math.max(run.routesPlanned - run.routesCompleted, 0)} por revisar`,
      resultLabel: "Ruta actual",
      result: currentRouteLabel(run),
    };
  }

  if (run.status === "failed" || run.status === "stopped") {
    return {
      coverageLabel: "Cobertura",
      coverage: `${run.destinationsScanned} ciudades · ${run.routesCompleted}/${run.routesPlanned} rutas`,
      calendarLabel: "Pendientes",
      calendar: `${Math.max(run.routesPlanned - run.routesCompleted, 0)} por revisar`,
      resultLabel: "Motivo",
      result: compactFailureReason(run.error),
    };
  }

  return {
    coverageLabel: "Cobertura",
    coverage: `${run.destinationsScanned} ciudades · ${run.routesCompleted}/${run.routesPlanned} rutas`,
    calendarLabel: "Calendario",
    calendar: `${run.serviceMonthsScanned} meses · ${run.departuresDetected} salidas`,
    resultLabel: "Resultado",
    result: `${run.cadenceChanges} cambios · ${run.noDatesFound} sin fechas`,
  };
}

export function DateScanRunHistory({ error, runs }: Props) {
  const [liveRuns, setLiveRuns] = useState(runs);
  const [liveError, setLiveError] = useState(error);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [explanations, setExplanations] = useState<Record<string, ReturnType<typeof buildExplanation>>>({});
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);

  async function refresh() {
    if (refreshingRef.current || document.visibilityState === "hidden") return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      const response = await fetch("/api/ops/date-scan-runs", { cache: "no-store" });
      const payload = (await response.json()) as Response;
      if (!response.ok || !payload.ok) throw new Error(payload.ok ? "No se pudo actualizar." : payload.detail ?? payload.reason);
      setLiveRuns(payload.runs);
      setLiveError(null);
    } catch (requestError) {
      setLiveError(requestError instanceof Error ? requestError.message : "No se pudo actualizar el historial.");
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const interval = window.setInterval(() => void refresh(), 4_000);
    return () => window.clearInterval(interval);
  }, []);

  const aggregate = useMemo(() => ({
    active: liveRuns.filter((run) => run.status === "running"),
    destinations: new Set(liveRuns.flatMap((run) => run.routes.map((route) => route.destination_city).filter(Boolean))).size,
    routes: liveRuns.reduce((sum, run) => sum + run.routesCompleted, 0),
    months: liveRuns.reduce((sum, run) => sum + run.serviceMonthsScanned, 0),
    departures: liveRuns.reduce((sum, run) => sum + run.departuresDetected, 0),
    changes: liveRuns.reduce((sum, run) => sum + run.cadenceChanges, 0),
    noDates: liveRuns.reduce((sum, run) => sum + run.noDatesFound, 0),
    errors: liveRuns.reduce((sum, run) => sum + run.hardErrors, 0),
  }), [liveRuns]);

  return (
    <section className="ops-panel ops-panel--wide price-scan-history date-scan-history">
      <div className="price-scan-history__header">
        <div>
          <p className="ops-panel__eyebrow">Historial persistente</p>
          <h2>Date Scanner analysis</h2>
          <p>Cada ejecución queda guardada desde el inicio, se actualiza en directo y conserva su resultado final.</p>
        </div>
        <button className="ops-button ops-button--ghost" onClick={() => void refresh()} type="button">
          <RefreshCw aria-hidden="true" className={refreshing ? "is-spinning" : undefined} size={15} />
          Actualizar
        </button>
      </div>

      {liveError ? <p className="ops-status ops-status--error">No se pudo actualizar el historial: {liveError}</p> : null}
      {liveRuns.length === 0 && !liveError ? (
        <div className="price-scan-history__empty"><Database aria-hidden="true" size={22} /><div><strong>Aún no hay Date Scanners guardados</strong><p>La próxima ejecución aparecerá aquí desde que empiece.</p></div></div>
      ) : null}

      {liveRuns.length > 0 ? (
        <>
          <div className="price-scan-history__definitions" aria-label="Definición de métricas">
            <span><strong>Meses</strong> calendarios revisados</span>
            <span><strong>Salidas</strong> fechas detectadas</span>
            <span><strong>Cambios</strong> modificaciones de cadencia</span>
            <span><strong>Pendientes</strong> rutas aún no terminadas</span>
          </div>
          <section className="price-scan-history__aggregate" aria-label="Totales agregados">
            {aggregate.active.length > 0 ? <>
              <div className="is-live"><span>Scans en curso</span><strong>{aggregate.active.length}</strong></div>
              <div><span>Rutas revisadas</span><strong>{aggregate.active.reduce((sum, run) => sum + run.routesCompleted, 0)}</strong></div>
              <div><span>Rutas pendientes</span><strong>{aggregate.active.reduce((sum, run) => sum + Math.max(run.routesPlanned - run.routesCompleted, 0), 0)}</strong></div>
              <div><span>Progreso total</span><strong>{aggregate.active.reduce((sum, run) => sum + run.routesCompleted, 0)} / {aggregate.active.reduce((sum, run) => sum + run.routesPlanned, 0)}</strong></div>
              <div><span>Resultado</span><strong>Se calculará al terminar</strong></div>
            </> : <>
              <div><span>Scans</span><strong>{liveRuns.length}</strong></div>
              <div><span>Ciudades</span><strong>{aggregate.destinations}</strong></div>
              <div><span>Rutas</span><strong>{aggregate.routes}</strong></div>
              <div><span>Meses</span><strong>{aggregate.months}</strong></div>
              <div className="is-success"><span>Salidas detectadas</span><strong>{aggregate.departures}</strong></div>
              <div className="is-success"><span>Cambios de cadencia</span><strong>{aggregate.changes}</strong></div>
              <div><span>Sin fechas</span><strong>{aggregate.noDates}</strong></div>
              <div className="is-error"><span>Errores</span><strong>{aggregate.errors}</strong></div>
            </>}
          </section>
          <div className="price-scan-history__list">
            {liveRuns.map((run) => {
              const explanation = explanations[run.id];
              const summary = runSummary(run);
              return (
                <details className="price-scan-history__run" key={run.id} open={expanded[run.id] ?? false} onToggle={(event) => {
                  const open = event.currentTarget.open;
                  setExpanded((current) => ({ ...current, [run.id]: open }));
                  if (open) setExplanations((current) => ({ ...current, [run.id]: buildExplanation(run) }));
                }}>
                  <summary>
                    <div className="price-scan-history__run-identity"><span className={`ops-send-badge ${statusTone(run.status)}`}>{statusLabel(run.status)}</span><strong>{formatDateTime(run.startedAt)}</strong><small>{run.scannerSource} · {formatDuration(run.durationMs)}</small></div>
                    <div className="price-scan-history__run-stat"><span>{summary.coverageLabel}</span><strong>{summary.coverage}</strong></div>
                    <div className="price-scan-history__run-stat"><span>{summary.calendarLabel}</span><strong>{summary.calendar}</strong></div>
                    <div className="price-scan-history__run-stat"><span>{summary.resultLabel}</span><strong>{summary.result}</strong></div>
                    <ChevronDown aria-hidden="true" className="price-scan-history__chevron" size={20} />
                  </summary>
                  <div className="price-scan-history__run-body">
                    {explanation ? <section className="price-scan-history__explanation" aria-label="Explicación sencilla">
                      <div className="price-scan-history__explanation-head"><div><p className="ops-panel__eyebrow">Resumen fácil</p><h3>Qué pasó en este Date Scanner</h3></div><button className="ops-button ops-button--ghost" onClick={() => setExplanations((current) => ({ ...current, [run.id]: buildExplanation(run) }))} type="button"><FileText aria-hidden="true" size={15} />Actualizar explicación</button></div>
                      <div className="price-scan-history__explanation-lead"><FileText aria-hidden="true" size={20} /><strong>{explanation.headline}</strong></div>
                      <div className="price-scan-history__explanation-grid"><article><span>Qué hizo</span><p>{explanation.work}</p></article><article><span>Qué encontró</span><p>{explanation.findings}</p></article><article><span>Qué problemas hubo</span><p>{explanation.issues}</p></article></div>
                    </section> : null}
                    <div className="date-scan-history__route-list">
                      {run.routes.slice(-20).map((route) => <div key={`${run.id}:${route.route_key}`}><strong>{route.route_label}</strong><span>{route.destination_city ?? "Ruta actual"}</span><span>{route.status}</span><span>{route.status === "running" ? "Comprobando esta ruta ahora" : `${route.service_months} meses · ${route.departures_detected} salidas · ${route.cadence_changes} cambios`}</span></div>)}
                    </div>
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
