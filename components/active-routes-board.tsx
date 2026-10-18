"use client";

import type {
  OpsActiveRoutesData,
  ActiveRouteSummary,
} from "@/lib/active-routes";
import {
  useRef,
  useState,
  useTransition,
  useMemo,
  useEffect,
  type MouseEvent as ReactMouseEvent,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { formatStayBucketListLabel } from "@/lib/stay-buckets";
import { subscribeOpsPolling } from "@/lib/ops-polling-client";
import { emitClientActivityLog } from "@/lib/client-activity-log";
import { saveRoutePlannerRulesAction } from "@/app/ops/actions";
import {
  ACTIVE_ROUTE_COLUMN_MIN_WIDTHS,
  type ActiveRouteColumnKey,
  type ActiveRouteColumnWidths,
  type ActiveRoutesSortDirection,
  type ActiveRoutesSortField,
  DEFAULT_ACTIVE_ROUTE_COLUMN_WIDTHS,
  type PlannerSelectionState,
  activeRouteTableGridTemplate,
  applySelectionToRoute,
  ariaSortValue,
  compareText,
  createAutomaticRulesRequest,
  formatStops,
  nextSortDirection,
  summarizePriceScanCapacity,
} from "./active-routes/helpers";
import {
  CapacityMetricLabel,
  SortableHeader,
} from "./active-routes/table-parts";
import { RoutePlannerModal } from "./active-routes/route-planner";

export function ActiveRoutesBoard({ data }: { data: OpsActiveRoutesData }) {
  const pollingRef = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedRouteSnapshot, setSelectedRouteSnapshot] = useState<ActiveRouteSummary | null>(null);
  const [routeOverrides, setRouteOverrides] = useState<Record<string, ActiveRouteSummary>>({});
  const [isDiscoveryRunning, setIsDiscoveryRunning] = useState(false);
  const [isDiscoveryBusy, setIsDiscoveryBusy] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [discoveryRouteId, setDiscoveryRouteId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<ActiveRoutesSortField>("route");
  const [sortDirection, setSortDirection] = useState<ActiveRoutesSortDirection>("asc");
  const [areFiltersOpen, setAreFiltersOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [routingFilter, setRoutingFilter] = useState("all");
  const [airlineFilter, setAirlineFilter] = useState("all");
  const [rulesFilter, setRulesFilter] = useState("all");
  const [cadenceFilter, setCadenceFilter] = useState("all");
  const [columnWidths, setColumnWidths] = useState<ActiveRouteColumnWidths>(
    DEFAULT_ACTIVE_ROUTE_COLUMN_WIDTHS,
  );
  const [isBulkPending, startBulkTransition] = useTransition();
  const wasDiscoveryRunningRef = useRef(false);
  const resizeStateRef = useRef<{
    key: ActiveRouteColumnKey;
    startX: number;
    startWidth: number;
  } | null>(null);
  const routesForView = useMemo(
    () => data.routes.map((route) => routeOverrides[route.id] ?? route),
    [data.routes, routeOverrides],
  );
  const priceScanCapacity = useMemo(
    () => summarizePriceScanCapacity(routesForView),
    [routesForView],
  );
  const bucketOptions = useMemo(
    () => Array.from(new Set(routesForView.flatMap((route) => route.stayBuckets))).sort(),
    [routesForView],
  );
  const routingOptions = useMemo(
    () => Array.from(new Set(routesForView.map((route) => route.maxStops))).sort(),
    [routesForView],
  );
  const airlineOptions = useMemo(
    () =>
      Array.from(new Set(routesForView.flatMap((route) => route.airlineNames))).sort(
        (left, right) => left.localeCompare(right, "en"),
      ),
    [routesForView],
  );
  const filteredRoutes = useMemo(() => {
    const search = searchFilter.trim().toLocaleLowerCase("en");
    return routesForView.filter((route) => {
      const activeRuleCount = route.months.reduce(
        (total, month) => total + month.activePatternKeys.length,
        0,
      );
      if (
        search &&
        ![
          route.label,
          route.destinationCity,
          route.originAirport,
          route.destinationAirport,
          ...route.airlineNames,
        ]
          .join(" ")
          .toLocaleLowerCase("en")
          .includes(search)
      ) return false;
      if (
        bucketFilter !== "all" &&
        !route.stayBuckets.some((bucket) => bucket === bucketFilter)
      ) return false;
      if (routingFilter !== "all" && route.maxStops !== routingFilter) return false;
      if (airlineFilter !== "all" && !route.airlineNames.includes(airlineFilter)) return false;
      if (rulesFilter === "with-rules" && activeRuleCount === 0) return false;
      if (rulesFilter === "without-rules" && activeRuleCount > 0) return false;
      if (cadenceFilter === "changes" && route.pendingChangeCount === 0) return false;
      if (cadenceFilter === "stable" && route.pendingChangeCount > 0) return false;
      if (cadenceFilter === "airline-pending" && route.airlineNames.length > 0) return false;
      return true;
    });
  }, [
    airlineFilter,
    bucketFilter,
    cadenceFilter,
    routesForView,
    routingFilter,
    rulesFilter,
    searchFilter,
  ]);
  const sortedRoutes = useMemo(() => {
    return [...filteredRoutes].sort((left, right) => {
      const leftRulesActive = left.months.reduce(
        (total, month) => total + month.activePatternKeys.length,
        0,
      );
      const rightRulesActive = right.months.reduce(
        (total, month) => total + month.activePatternKeys.length,
        0,
      );

      let comparison = 0;
      switch (sortField) {
        case "route":
          comparison = compareText(left.label, right.label);
          break;
        case "bucket":
          comparison =
            compareText(
              formatStayBucketListLabel(left.stayBuckets),
              formatStayBucketListLabel(right.stayBuckets),
            ) ||
            compareText(left.label, right.label);
          break;
        case "routing":
          comparison =
            compareText(formatStops(left.maxStops), formatStops(right.maxStops)) ||
            compareText(left.label, right.label);
          break;
        case "airlines":
          comparison =
            compareText(left.airlineSummary ?? "zzzz", right.airlineSummary ?? "zzzz") ||
            compareText(left.label, right.label);
          break;
        case "rulesActive":
          comparison = leftRulesActive - rightRulesActive || compareText(left.label, right.label);
          break;
        case "cadenceChanges":
          comparison =
            left.pendingChangeCount - right.pendingChangeCount || compareText(left.label, right.label);
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredRoutes, sortDirection, sortField]);
  const hasActiveFilters = Boolean(
    searchFilter || bucketFilter !== "all" || routingFilter !== "all" ||
    airlineFilter !== "all" || rulesFilter !== "all" || cadenceFilter !== "all",
  );
  const selectedRoute = useMemo(
    () =>
      sortedRoutes.find((route) => route.id === selectedRouteId) ??
      routesForView.find((route) => route.id === selectedRouteId) ??
      (selectedRouteSnapshot?.id === selectedRouteId ? selectedRouteSnapshot : null) ??
      null,
    [routesForView, selectedRouteId, selectedRouteSnapshot, sortedRoutes],
  );
  const selectedRouteIndex = useMemo(
    () => sortedRoutes.findIndex((route) => route.id === selectedRouteId),
    [selectedRouteId, sortedRoutes],
  );

  function openRoute(route: ActiveRouteSummary) {
    setSelectedRouteId(route.id);
    setSelectedRouteSnapshot(route);
  }

  function closeRoutePlanner() {
    setSelectedRouteId(null);
    setSelectedRouteSnapshot(null);
  }

  function clearRouteFilters() {
    setSearchFilter("");
    setBucketFilter("all");
    setRoutingFilter("all");
    setAirlineFilter("all");
    setRulesFilter("all");
    setCadenceFilter("all");
  }

  function applySelectionOverrides(
    updates: Array<{ routeId: string; nextSelection: PlannerSelectionState }>,
  ) {
    if (updates.length === 0) {
      return;
    }

    setRouteOverrides((current) => {
      const next = { ...current };
      for (const update of updates) {
        const baseRoute =
          current[update.routeId] ??
          routesForView.find((route) => route.id === update.routeId) ??
          data.routes.find((route) => route.id === update.routeId);
        if (!baseRoute) {
          continue;
        }

        next[update.routeId] = applySelectionToRoute(baseRoute, update.nextSelection);
      }

      return next;
    });
  }

  function applyPersistedSelectionToSnapshot(routeId: string, nextSelection: PlannerSelectionState) {
    applySelectionOverrides([{ routeId, nextSelection }]);
    setSelectedRouteSnapshot((current) => {
      if (!current || current.id !== routeId) {
        return current;
      }

      return applySelectionToRoute(current, nextSelection);
    });
  }

  useEffect(() => {
    setRouteOverrides({});
    setSelectedRouteSnapshot((current) => {
      if (!current) {
        return current;
      }

      return data.routes.find((route) => route.id === current.id) ?? current;
    });
  }, [data.routes]);

  useEffect(() => {
    let isMounted = true;
    let lastProgressSignature: string | null = null;

    async function loadStatus(response: Response) {
      try {

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { running?: boolean };
        if (!isMounted) {
          return;
        }

        const running = Boolean(payload.running);
        const wasRunning = wasDiscoveryRunningRef.current;
        const progressSignature = JSON.stringify({
          startedRoutes: (payload as { startedRoutes?: number | null }).startedRoutes ?? null,
          currentRouteLabel: (payload as { currentRouteLabel?: string | null }).currentRouteLabel ?? null,
          latestActivity: (payload as { latestActivity?: string | null }).latestActivity ?? null,
        });
        wasDiscoveryRunningRef.current = running;
        setIsDiscoveryRunning(running);
        if ((running && lastProgressSignature !== null && progressSignature !== lastProgressSignature) || (wasRunning && !running)) {
          router.refresh();
        }
        lastProgressSignature = progressSignature;
        if (!running) {
          setDiscoveryRouteId(null);
        }
      } catch {
        // Keep quiet if the ops poll fails.
      }
    }

    const unsubscribe = subscribeOpsPolling("/api/ops/pattern-discovery-status", loadStatus, pollingRef.current);
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    function handlePointerMove(event: MouseEvent) {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const delta = event.clientX - resizeState.startX;
      const nextWidth = Math.max(
        ACTIVE_ROUTE_COLUMN_MIN_WIDTHS[resizeState.key],
        resizeState.startWidth + delta,
      );

      setColumnWidths((current) => ({
        ...current,
        [resizeState.key]: nextWidth,
      }));
    }

    function stopResize() {
      resizeStateRef.current = null;
      document.body.classList.remove("is-resizing-columns");
    }

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", stopResize);

    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", stopResize);
    };
  }, []);

  async function runSingleRouteDiscovery(route: ActiveRouteSummary) {
    setIsDiscoveryBusy(true);
    setDiscoveryRouteId(route.id);
    setBulkFeedback(null);
    setBulkError(null);

    try {
      const response = await fetch("/api/ops/pattern-discovery-run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          forceRefresh: true,
          route: {
            originAirport: route.originAirport,
            destinationAirport: route.destinationAirport,
            maxStops: route.maxStops,
          },
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { reason?: string; detail?: string; routeScope?: unknown }
        | null;

      if (response.status === 409) {
        setDiscoveryRouteId(null);
        if (payload?.reason === "already_running") {
          setIsDiscoveryRunning(true);
          setBulkError("The Dates Scanner is already running. Follow the current run in Dates Scanner before starting another route.");
        } else {
          setIsDiscoveryRunning(false);
          setBulkError("The Price Scanner is currently using the flight provider. Wait for it to finish, then scan this route again.");
        }
        emitClientActivityLog({
          kind: "action",
          level: "warning",
          title: `Dates Scanner did not start for ${route.label}`,
          detail: payload?.detail ?? payload?.reason ?? "Another scanner is already running.",
        });
        return;
      }

      if (!response.ok) {
        setDiscoveryRouteId(null);
        setBulkError(
          `The Dates Scanner could not start for ${route.label}: ${payload?.detail ?? payload?.reason ?? `HTTP ${response.status}`}`,
        );
        emitClientActivityLog({
          kind: "action",
          level: "error",
          title: `Dates Scanner could not start for ${route.label}`,
          detail: payload?.detail ?? payload?.reason ?? `HTTP ${response.status}`,
        });
        return;
      }

      setIsDiscoveryRunning(true);
      setBulkFeedback(
        `Dates Scanner started for ${route.label} only. It is refreshing every visible month across all airlines; live progress and results will appear in Dates Scanner.`,
      );
      emitClientActivityLog({
        kind: "action",
        level: "info",
        title: `Dates Scanner started for ${route.label}`,
        detail: "Single-route refresh · all visible months · all airlines",
      });
    } catch (error) {
      setDiscoveryRouteId(null);
      setBulkError(
        `The Dates Scanner request failed for ${route.label}: ${
          error instanceof Error ? error.message : "Unknown request error."
        }`,
      );
      emitClientActivityLog({
        kind: "action",
        level: "error",
        title: `Dates Scanner request failed for ${route.label}`,
        detail: error instanceof Error ? error.message : "Unknown request error.",
      });
    } finally {
      setIsDiscoveryBusy(false);
    }
  }

  function toggleSort(field: ActiveRoutesSortField) {
    setSortDirection((currentDirection) =>
      nextSortDirection(sortField, currentDirection, field),
    );
    setSortField(field);
  }

  function startColumnResize(key: ActiveRouteColumnKey, event: ReactMouseEvent<HTMLSpanElement>) {
    event.preventDefault();
    event.stopPropagation();
    resizeStateRef.current = {
      key,
      startX: event.clientX,
      startWidth: columnWidths[key],
    };
    document.body.classList.add("is-resizing-columns");
  }

  function openPreviousRoute() {
    if (sortedRoutes.length === 0 || selectedRouteIndex < 0) {
      return;
    }

    const nextIndex = (selectedRouteIndex - 1 + sortedRoutes.length) % sortedRoutes.length;
    const nextRoute = sortedRoutes[nextIndex] ?? null;
    setSelectedRouteId(nextRoute?.id ?? null);
    setSelectedRouteSnapshot(nextRoute);
  }

  function openNextRoute() {
    if (sortedRoutes.length === 0 || selectedRouteIndex < 0) {
      return;
    }

    const nextIndex = (selectedRouteIndex + 1) % sortedRoutes.length;
    const nextRoute = sortedRoutes[nextIndex] ?? null;
    setSelectedRouteId(nextRoute?.id ?? null);
    setSelectedRouteSnapshot(nextRoute);
  }

  function createRulesForAllRoutes() {
    setBulkFeedback(null);
    setBulkError(null);

    const routesWithDetectedDepartures = sortedRoutes.filter((route) =>
      route.months.some((month) => month.departureDates.length > 0),
    );
    const skippedRouteCount = sortedRoutes.length - routesWithDetectedDepartures.length;

    if (routesWithDetectedDepartures.length === 0) {
      const message =
        "No automatic rules were created because none of the visible destinations have detected departures.";
      setBulkFeedback(message);
      emitClientActivityLog({
        kind: "action",
        level: "warning",
        title: "Global create rules found no detected departures",
        detail: message,
      });
      return;
    }

    startBulkTransition(async () => {
      try {
        const generatedPayload = await createAutomaticRulesRequest<
          Awaited<
            ReturnType<
              typeof import("@/lib/active-routes").createAutomaticRoutePlannerSearchRulesForRoutes
            >
          >
        >({
          routeIds: routesWithDetectedDepartures.map((route) => route.id),
        });
        const routesUpdated = generatedPayload.filter((route) => route.rulesAdded > 0).length;
        const rulesAdded = generatedPayload.reduce((total, route) => total + route.rulesAdded, 0);
        const monthsUpdated = generatedPayload.reduce((total, route) => total + route.monthsUpdated, 0);

        if (rulesAdded === 0) {
          const message = `No new automatic rules were possible for the destinations with detected departures.${
            skippedRouteCount > 0
              ? ` ${skippedRouteCount} destination(s) without detected departures were left unchanged.`
              : ""
          }`;
          setBulkFeedback(message);
          setBulkError(null);
          emitClientActivityLog({
            kind: "action",
            level: "warning",
            title: "Global create rules found nothing",
            detail: message,
          });
          router.refresh();
          return;
        }

        applySelectionOverrides(
          generatedPayload.map((route) => ({
            routeId: route.routeId,
            nextSelection: Object.fromEntries(
              route.months.map((month) => [month.monthStart, month.patternKeys]),
            ),
          })),
        );
        setSelectedRouteSnapshot((current) => {
          if (!current) {
            return current;
          }
          const matching = generatedPayload.find((route) => route.routeId === current.id);
          if (!matching) {
            return current;
          }
          return applySelectionToRoute(
            current,
            Object.fromEntries(matching.months.map((month) => [month.monthStart, month.patternKeys])),
          );
        });
        setBulkFeedback(
          `Automatic rules created in ${monthsUpdated} month(s) across ${routesUpdated} destination(s) and saved automatically.${
            skippedRouteCount > 0
              ? ` ${skippedRouteCount} destination(s) without detected departures were left unchanged.`
              : ""
          }`,
        );
        emitClientActivityLog({
          kind: "action",
          level: "info",
          title: "Global automatic rules created",
          detail: `${monthsUpdated} month(s) updated in ${routesUpdated} destination(s) · ${rulesAdded} new rule slot(s) generated and saved automatically${
            skippedRouteCount > 0
              ? ` · ${skippedRouteCount} destination(s) without detected departures left unchanged`
              : ""
          }`,
        });
        router.refresh();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "The automatic rules could not be created right now.";
        setBulkError(message);
        emitClientActivityLog({
          kind: "action",
          level: "error",
          title: "Global create rules failed",
          detail: message,
        });
      }
    });
  }

  function clearRulesForAllRoutes() {
    const routesWithRules = sortedRoutes.filter((route) =>
      route.months.some((month) => month.activePatternKeys.length > 0),
    );
    if (routesWithRules.length === 0) {
      const message = "There are no visible route rules to clear.";
      setBulkFeedback(message);
      setBulkError(null);
      emitClientActivityLog({
        kind: "action",
        level: "warning",
        title: "Global clear rules found nothing",
        detail: message,
      });
      return;
    }

    const payload = routesWithRules.map((route) => ({
      routeId: route.id,
      months: route.months.map((month) => ({
        monthStart: month.monthStart,
        patternKeys: [] as string[],
      })),
    }));

    setBulkFeedback(null);
    setBulkError(null);
    startBulkTransition(async () => {
      try {
        for (const route of payload) {
          await saveRoutePlannerRulesAction({
            routeId: route.routeId,
            months: route.months,
          });
        }
        applySelectionOverrides(
          payload.map((route) => ({
            routeId: route.routeId,
            nextSelection: Object.fromEntries(
              route.months.map((month) => [month.monthStart, month.patternKeys]),
            ),
          })),
        );
        setSelectedRouteSnapshot((current) => {
          if (!current) {
            return current;
          }
          const matching = payload.find((route) => route.routeId === current.id);
          if (!matching) {
            return current;
          }
          return applySelectionToRoute(
            current,
            Object.fromEntries(matching.months.map((month) => [month.monthStart, month.patternKeys])),
          );
        });
        setBulkFeedback(
          `All visible rules cleared across ${routesWithRules.length} destination(s) and saved automatically.`,
        );
        emitClientActivityLog({
          kind: "action",
          level: "info",
          title: "Global rules cleared",
          detail: `${routesWithRules.length} destination(s) cleared · saved automatically`,
        });
        router.refresh();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "The rules could not be cleared right now.";
        setBulkError(message);
        emitClientActivityLog({
          kind: "action",
          level: "error",
          title: "Global clear rules failed",
          detail: message,
        });
      }
    });
  }

  const tableGridTemplate = useMemo(
    () => activeRouteTableGridTemplate(columnWidths),
    [columnWidths],
  );
  const rowStyle = useMemo(
    () => ({ gridTemplateColumns: tableGridTemplate } satisfies CSSProperties),
    [tableGridTemplate],
  );

  return (
    <>
      <section
        aria-labelledby="price-scan-capacity-title"
        className="ops-panel ops-panel--wide active-route-scan-capacity"
      >
        <div className="active-route-scan-capacity__intro">
          <p className="ops-panel__eyebrow">Price scanner reach</p>
          <h2 id="price-scan-capacity-title">
            {priceScanCapacity.pricePossibilities.toLocaleString("en-GB")}
          </h2>
          <strong>possible price checks</strong>
          <p>
            The scanner can test{" "}
            {priceScanCapacity.pricePossibilities.toLocaleString("en-GB")} exact
            outbound-and-return date combinations across{" "}
            {priceScanCapacity.activeRoutes.toLocaleString("en-GB")} active route
            {priceScanCapacity.activeRoutes === 1 ? "" : "s"} and{" "}
            {priceScanCapacity.activeRouteMonths.toLocaleString("en-GB")} active route-month
            {priceScanCapacity.activeRouteMonths === 1 ? "" : "s"}, using the rules and departure
            dates currently detected.
          </p>
        </div>
        <dl className="active-route-scan-capacity__breakdown">
          <div>
            <CapacityMetricLabel
              label="Active routes"
              tooltip="How many routes the scanner can check now. Routes with no searches turned on are not counted."
              tooltipId="active-routes-help"
            />
            <dd>{priceScanCapacity.activeRoutes.toLocaleString("en-GB")}</dd>
          </div>
          <div>
            <CapacityMetricLabel
              label="Active route-months"
              tooltip="How many route-and-month pairs are ready. Example: 1 route active for 9 months = 9."
              tooltipId="active-route-months-help"
            />
            <dd>{priceScanCapacity.activeRouteMonths.toLocaleString("en-GB")}</dd>
          </div>
          <div>
            <CapacityMetricLabel
              label="Enabled rule slots"
              tooltip="How many searches are turned on across all routes and months. The same search in 9 months counts as 9."
              tooltipId="enabled-rule-slots-help"
            />
            <dd>{priceScanCapacity.activeRuleSlots.toLocaleString("en-GB")}</dd>
          </div>
        </dl>
      </section>

      <section ref={pollingRef} className="ops-panel ops-panel--wide active-route-grid">
        <div className="ops-panel__header">
          <div>
            <p className="ops-panel__eyebrow">Coverage</p>
            <h2>Active route grid</h2>
          </div>
          <div className="active-route-grid__header-side">
            <p>
              {data.routes.length} seeded routes · {data.totalChangeAlerts} cadence change(s) waiting
            </p>
            <div className="active-route-grid__actions">
              <button
                className="ops-button ops-button--ghost"
                disabled={isBulkPending}
                onClick={createRulesForAllRoutes}
                type="button"
              >
                {isBulkPending ? "Creating..." : "Create rules"}
              </button>
              <button
                className="ops-button ops-button--ghost"
                disabled={isBulkPending}
                onClick={clearRulesForAllRoutes}
                type="button"
              >
                {isBulkPending ? "Clearing..." : "Clear all rules"}
              </button>
            </div>
          </div>
        </div>

        {bulkFeedback ? <p className="active-route-grid__feedback is-success">{bulkFeedback}</p> : null}
        {bulkError ? <p className="active-route-grid__feedback is-error">{bulkError}</p> : null}

        <section
          className={`ops-review-controls active-route-filters ${areFiltersOpen ? "is-open" : ""}`}
        >
          <button
            aria-expanded={areFiltersOpen}
            className="ops-filter-panel__toggle"
            onClick={() => setAreFiltersOpen((current) => !current)}
            type="button"
          >
            <span>Route filters</span>
            <strong>{areFiltersOpen ? "Hide" : "Show"}</strong>
          </button>
          <div className="ops-filter-panel__body">
            <label className="ops-review-control ops-review-control--search">
              <span>Search route or airline</span>
              <input
                onChange={(event) => setSearchFilter(event.target.value)}
                placeholder="London, STN, Luxair..."
                type="search"
                value={searchFilter}
              />
            </label>
            <label className="ops-review-control">
              <span>Airline</span>
              <select
                onChange={(event) => setAirlineFilter(event.target.value)}
                value={airlineFilter}
              >
                <option value="all">All airlines</option>
                {airlineOptions.map((airline) => (
                  <option key={airline} value={airline}>{airline}</option>
                ))}
              </select>
            </label>
            <label className="ops-review-control">
              <span>Bucket</span>
              <select onChange={(event) => setBucketFilter(event.target.value)} value={bucketFilter}>
                <option value="all">All buckets</option>
                {bucketOptions.map((bucket) => (
                  <option key={bucket} value={bucket}>
                    {formatStayBucketListLabel([bucket])}
                  </option>
                ))}
              </select>
            </label>
            <label className="ops-review-control">
              <span>Routing</span>
              <select onChange={(event) => setRoutingFilter(event.target.value)} value={routingFilter}>
                <option value="all">All routing types</option>
                {routingOptions.map((routing) => (
                  <option key={routing} value={routing}>{formatStops(routing)}</option>
                ))}
              </select>
            </label>
            <label className="ops-review-control">
              <span>Rules</span>
              <select onChange={(event) => setRulesFilter(event.target.value)} value={rulesFilter}>
                <option value="all">Any rules status</option>
                <option value="with-rules">With active rules</option>
                <option value="without-rules">Without active rules</option>
              </select>
            </label>
            <label className="ops-review-control">
              <span>Status</span>
              <select onChange={(event) => setCadenceFilter(event.target.value)} value={cadenceFilter}>
                <option value="all">Any status</option>
                <option value="stable">Stable cadence</option>
                <option value="changes">Cadence changes</option>
                <option value="airline-pending">Airline data pending</option>
              </select>
            </label>
            <div className="active-route-filters__footer">
              <span>{sortedRoutes.length} of {routesForView.length} routes</span>
              <button
                className="ops-button ops-button--ghost ops-button--compact"
                disabled={!hasActiveFilters}
                onClick={clearRouteFilters}
                type="button"
              >
                Clear filters
              </button>
            </div>
          </div>
        </section>

      {data.routes.length === 0 ? (
        <div className="ops-empty">
          <p>
            Run the monthly service discovery after applying the schema and this planner will fill
            with route calendars for the next 9 months.
          </p>
        </div>
      ) : sortedRoutes.length === 0 ? (
        <div className="ops-empty">
          <p>No routes match the selected filters.</p>
          <button className="ops-button ops-button--ghost" onClick={clearRouteFilters} type="button">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="ops-route-table active-route-table" role="table" aria-label="Active route grid">
          <div className="ops-route-table__row ops-route-table__row--head" role="row" style={rowStyle}>
            <span
              aria-sort={ariaSortValue(sortField, sortDirection, "route")}
              role="columnheader"
            >
              <SortableHeader
                activeDirection={sortDirection}
                activeField={sortField}
                field="route"
                label="Route"
                onToggle={toggleSort}
                onResizeStart={(event) => startColumnResize("route", event)}
              />
            </span>
            <span
              aria-sort={ariaSortValue(sortField, sortDirection, "bucket")}
              role="columnheader"
            >
              <SortableHeader
                activeDirection={sortDirection}
                activeField={sortField}
                field="bucket"
                label="Bucket"
                onToggle={toggleSort}
                onResizeStart={(event) => startColumnResize("bucket", event)}
              />
            </span>
            <span
              aria-sort={ariaSortValue(sortField, sortDirection, "routing")}
              role="columnheader"
            >
              <SortableHeader
                activeDirection={sortDirection}
                activeField={sortField}
                field="routing"
                label="Routing"
                onToggle={toggleSort}
                onResizeStart={(event) => startColumnResize("routing", event)}
              />
            </span>
            <span
              aria-sort={ariaSortValue(sortField, sortDirection, "airlines")}
              role="columnheader"
            >
              <SortableHeader
                activeDirection={sortDirection}
                activeField={sortField}
                field="airlines"
                label="Airlines"
                onToggle={toggleSort}
                onResizeStart={(event) => startColumnResize("airlines", event)}
              />
            </span>
            <span
              aria-sort={ariaSortValue(sortField, sortDirection, "rulesActive")}
              role="columnheader"
            >
              <SortableHeader
                activeDirection={sortDirection}
                activeField={sortField}
                field="rulesActive"
                label="Rules"
                onToggle={toggleSort}
                onResizeStart={(event) => startColumnResize("rules", event)}
              />
            </span>
            <span
              aria-sort={ariaSortValue(sortField, sortDirection, "cadenceChanges")}
              role="columnheader"
            >
              <SortableHeader
                activeDirection={sortDirection}
                activeField={sortField}
                field="cadenceChanges"
                label="Cadence changes"
                onToggle={toggleSort}
                onResizeStart={(event) => startColumnResize("cadence", event)}
              />
            </span>
            <span role="columnheader">
              <div className="ops-route-table__sort-wrap">
                <span className="ops-route-table__plain-head">Scan</span>
                <span
                  aria-hidden="true"
                  className="ops-route-table__resize-handle"
                  onMouseDown={(event) => startColumnResize("scan", event)}
                />
              </div>
            </span>
            <span role="columnheader">
              <div className="ops-route-table__sort-wrap">
                <span className="ops-route-table__plain-head">Open</span>
                <span
                  aria-hidden="true"
                  className="ops-route-table__resize-handle"
                  onMouseDown={(event) => startColumnResize("planner", event)}
                />
              </div>
            </span>
          </div>
          {sortedRoutes.map((route) => {
            const activeRuleCount = route.months.reduce(
              (total, month) => total + month.activePatternKeys.length,
              0,
            );
            const isRouteBeingScanned = discoveryRouteId === route.id;
            const discoveryButtonLabel = isDiscoveryBusy && isRouteBeingScanned
              ? "Starting..."
              : isDiscoveryRunning && isRouteBeingScanned
                ? "Scanning..."
                : isDiscoveryRunning
                  ? "Scanner busy"
                  : "Scan dates";

            return (
              <div
                aria-label={`Open planner for ${route.label}`}
                className="ops-route-table__row active-route-table__row is-clickable"
                key={route.id}
                onClick={() => openRoute(route)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openRoute(route);
                  }
                }}
                role="row"
                style={rowStyle}
                tabIndex={0}
              >
                <span role="cell">
                  <strong>{route.label}</strong>
                </span>
                <span role="cell">{formatStayBucketListLabel(route.stayBuckets)}</span>
                <span role="cell">{formatStops(route.maxStops)}</span>
                <span role="cell">
                  {route.airlineNames.length > 0 ? (
                    <span className="active-route-table__airlines">
                      {route.airlineNames.map((airline) => (
                        <span key={airline}>{airline}</span>
                      ))}
                    </span>
                  ) : "Pending"}
                </span>
                <span role="cell">{activeRuleCount}</span>
                <span role="cell">
                  {route.pendingChangeCount > 0 ? (
                    <span className="active-route-table__badge is-warning">
                      {route.pendingChangeCount} change(s)
                    </span>
                  ) : (
                    <span className="active-route-table__badge">Stable</span>
                  )}
                </span>
                <span role="cell">
                  <button
                    aria-label={`Scan flight dates for ${route.label} across all airlines`}
                    className="ops-button ops-button--ghost"
                    disabled={isDiscoveryBusy || isDiscoveryRunning}
                    onClick={(event) => {
                      event.stopPropagation();
                      void runSingleRouteDiscovery(route);
                    }}
                    title="Refresh this route only, across all airlines"
                    type="button"
                  >
                    {discoveryButtonLabel === "Scan dates" ? "Scan" : discoveryButtonLabel}
                  </button>
                </span>
                <span role="cell">
                  <button
                    aria-label={`Open planner for ${route.label}`}
                    className="ops-button ops-button--ghost active-route-table__icon-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openRoute(route);
                    }}
                    type="button"
                  >
                    ↗
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {selectedRoute ? (
        <RoutePlannerModal
          onClose={closeRoutePlanner}
          onNext={openNextRoute}
          onPrevious={openPreviousRoute}
          onSelectionPersisted={applyPersistedSelectionToSnapshot}
          route={selectedRoute}
          routeCount={sortedRoutes.length}
          routeIndex={Math.max(selectedRouteIndex, 0)}
        />
      ) : null}
      </section>
    </>
  );
}
