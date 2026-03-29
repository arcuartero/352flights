"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";

import type { OpsPriceIntelligenceData, OpsPriceSeries } from "@/lib/ops";
import { formatNightsLabel, formatRouteStayLabel } from "@/lib/route-stay";

type PriceIntelligenceBoardProps = {
  data: OpsPriceIntelligenceData;
};

function formatCurrency(value: number, currency: string = "EUR") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
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

function formatTravelDate(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatRelativeBucket(bucket: string) {
  return bucket.replaceAll("_", " ");
}

function formatStops(value: string) {
  if (value === "NON_STOP") {
    return "Non-stop only";
  }

  if (value === "ONE_STOP_OR_FEWER") {
    return "Up to 1 stop";
  }

  if (value === "ANY") {
    return "Any routing";
  }

  return value.replaceAll("_", " ");
}

function formatPriceChange(current: number | null, previous: number | null) {
  if (current === null || previous === null) {
    return "No previous run yet";
  }

  const delta = current - previous;
  if (delta === 0) {
    return "Flat versus prior cron";
  }

  const direction = delta < 0 ? "down" : "up";
  return `${formatCurrency(Math.abs(delta))} ${direction} versus prior cron`;
}

function formatSearchRange(series: OpsPriceSeries) {
  return formatRouteStayLabel({
    tripNights: series.routeTripNights,
    minTripNights: series.routeMinTripNights,
    maxTripNights: series.routeMaxTripNights,
  });
}

function buildPath(points: Array<{ x: number; y: number }>) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

function chartCoordinates(values: number[], width: number, height: number) {
  if (values.length === 0) {
    return [];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values.map((value, index) => ({
    x: values.length === 1 ? width / 2 : (index / (values.length - 1)) * width,
    y: height - ((value - min) / range) * height,
  }));
}

function RouteSparkline({ series }: { series: OpsPriceSeries }) {
  const coordinates = chartCoordinates(
    series.points.map((point) => point.price),
    116,
    34,
  );

  if (coordinates.length === 0) {
    return null;
  }

  return (
    <svg
      aria-hidden="true"
      className="price-card__sparkline"
      viewBox="0 0 116 34"
      preserveAspectRatio="none"
    >
      <path className="price-card__sparkline-grid" d="M 0 17 L 116 17" />
      <path className="price-card__sparkline-line" d={buildPath(coordinates)} />
    </svg>
  );
}

function RouteTrendChart({ series }: { series: OpsPriceSeries }) {
  const values = series.points.map((point) => point.price);
  const coordinates = chartCoordinates(values, 640, 220);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const latest = series.points.at(-1) ?? null;

  if (coordinates.length === 0 || !latest) {
    return (
      <div className="price-chart__empty">
        <p>No chart data for this route yet.</p>
      </div>
    );
  }

  const areaPath = `${buildPath(coordinates)} L 640 220 L 0 220 Z`;

  return (
    <div className="price-chart">
      <svg
        aria-hidden="true"
        className="price-chart__svg"
        viewBox="0 0 640 220"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="price-area-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="price-chart__grid" d="M 0 220 L 640 220" />
        <path className="price-chart__grid" d="M 0 110 L 640 110" />
        <path className="price-chart__grid" d="M 0 0 L 640 0" />
        <path className="price-chart__area" d={areaPath} />
        <path className="price-chart__line" d={buildPath(coordinates)} />
        {coordinates.map((point, index) => (
          <circle
            className={`price-chart__dot ${index === coordinates.length - 1 ? "is-latest" : ""}`}
            cx={point.x}
            cy={point.y}
            key={`${series.routeId}-${index}`}
            r={index === coordinates.length - 1 ? 5 : 3}
          />
        ))}
      </svg>
      <div className="price-chart__legend">
        <div>
          <span>Recent range</span>
          <strong>
            {formatCurrency(min)} to {formatCurrency(max)}
          </strong>
        </div>
        <div>
          <span>Latest scan</span>
          <strong>{formatDateTime(latest.scannedAt)}</strong>
        </div>
        <div>
          <span>Travel dates</span>
          <strong>
            {formatTravelDate(latest.departureDate)} to {formatTravelDate(latest.returnDate)}
          </strong>
        </div>
      </div>
    </div>
  );
}

export function PriceIntelligenceBoard({ data }: PriceIntelligenceBoardProps) {
  const [searchValue, setSearchValue] = useState("");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const deferredSearch = useDeferredValue(searchValue);

  const filteredSeries = useMemo(() => {
    const search = deferredSearch.trim().toLowerCase();

    return data.series.filter((series) => {
      const matchesBucket = bucketFilter === "all" || series.routeBucket === bucketFilter;
      if (!matchesBucket) {
        return false;
      }

      if (!search) {
        return true;
      }

      return [
        series.routeLabel,
        series.destinationCity,
        series.destinationAirport,
        formatRelativeBucket(series.routeBucket),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [bucketFilter, data.series, deferredSearch]);

  useEffect(() => {
    if (filteredSeries.length === 0) {
      setSelectedRouteId(null);
      setIsModalOpen(false);
      return;
    }

    if (selectedRouteId && !filteredSeries.some((series) => series.routeId === selectedRouteId)) {
      setSelectedRouteId(isModalOpen ? filteredSeries[0].routeId : null);
    }
  }, [filteredSeries, isModalOpen, selectedRouteId]);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsModalOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isModalOpen]);

  const selectedSeries =
    filteredSeries.find((series) => series.routeId === selectedRouteId) ?? null;

  const filteredRows = useMemo(() => {
    if (filteredSeries.length === 0) {
      return [];
    }

    const routeIds = new Set(filteredSeries.map((series) => series.routeId));
    return data.tableRows.filter((row) => routeIds.has(row.routeId));
  }, [data.tableRows, filteredSeries]);

  const bucketOptions = useMemo(
    () =>
      ["all", ...new Set(data.series.map((series) => series.routeBucket))]
        .map((bucket) => ({
          value: bucket,
          label: bucket === "all" ? "All buckets" : formatRelativeBucket(bucket),
        })),
    [data.series],
  );

  return (
    <section className="price-intelligence">
      {data.onboardingMessage ? (
        <section className="ops-banner" role="status">
          <p>{data.onboardingMessage}</p>
        </section>
      ) : null}

      <section className="price-intelligence__intro">
        <div>
          <p className="ops-panel__eyebrow">Cron history</p>
          <h2>Every tracked price snapshot the scanner has written so far.</h2>
          <p>{data.scannerNote}</p>
        </div>
        <div className="price-intelligence__meta">
          <article>
            <span>Routes tracked</span>
            <strong>{data.totals.routesTracked}</strong>
          </article>
          <article>
            <span>Snapshots loaded</span>
            <strong>{data.totals.snapshotsLoaded}</strong>
          </article>
          <article>
            <span>Freshest cron</span>
            <strong>{formatDateTime(data.totals.latestSnapshotAt)}</strong>
          </article>
          <article>
            <span>Lowest live fare</span>
            <strong>
              {data.totals.liveLowestPrice !== null
                ? formatCurrency(data.totals.liveLowestPrice)
                : "n/a"}
            </strong>
            <small>{data.totals.liveLowestRouteLabel ?? "No route yet"}</small>
          </article>
        </div>
      </section>

      <section className="price-controls">
        <label className="price-control">
          <span>Search route</span>
          <input
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="London, LIS, long haul..."
            type="search"
            value={searchValue}
          />
        </label>

        <label className="price-control">
          <span>Bucket</span>
          <select onChange={(event) => setBucketFilter(event.target.value)} value={bucketFilter}>
            {bucketOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="price-route-grid">
        {filteredSeries.map((series) => (
          <button
            className={`price-card ${series.routeId === selectedRouteId ? "is-active" : ""}`}
            key={series.routeId}
            aria-controls="price-route-dialog"
            aria-expanded={isModalOpen && series.routeId === selectedRouteId}
            onClick={() => {
              setSelectedRouteId(series.routeId);
              setIsModalOpen(true);
            }}
            type="button"
          >
            <div className="price-card__header">
              <div>
                <p className="ops-tag">{formatRelativeBucket(series.routeBucket)}</p>
                <h3>{series.routeLabel}</h3>
              </div>
              <strong>
                {series.latestPrice !== null ? formatCurrency(series.latestPrice) : "n/a"}
              </strong>
            </div>
            <p className="price-card__meta">
              Scans {formatSearchRange(series)} · {formatStops(series.maxStops)}
            </p>
            <RouteSparkline series={series} />
            <p className="price-card__delta">
              {formatPriceChange(series.latestPrice, series.previousPrice)}
              {series.latestTripNights !== null
                ? ` · latest winner ${formatNightsLabel(series.latestTripNights)}`
                : ""}
            </p>
            <p className="price-card__delta">
              {series.latestAirlineSummary ?? "Latest airline pending"}
            </p>
          </button>
        ))}
      </section>

      <section className="price-table-panel">
        <div className="ops-panel__header">
          <div>
            <p className="ops-panel__eyebrow">Snapshot table</p>
            <h2>Most recent croned prices across the filtered routes.</h2>
          </div>
          <p>{filteredRows.length} rows in view</p>
        </div>

        {filteredRows.length === 0 ? (
          <div className="ops-empty">
            <p>No snapshots match the current search and bucket filter.</p>
          </div>
        ) : (
          <div className="price-table" role="table" aria-label="Croned price history">
            <div className="price-table__row price-table__row--head" role="row">
              <span role="columnheader">Route</span>
              <span role="columnheader">Bucket</span>
              <span role="columnheader">Travel dates</span>
              <span role="columnheader">Trip shape</span>
              <span role="columnheader">Airline</span>
              <span role="columnheader">Price</span>
              <span role="columnheader">Croned at</span>
            </div>
            {filteredRows.slice(0, 180).map((row) => (
              <div className="price-table__row" key={row.id} role="row">
                <span role="cell">
                  <strong className="price-table__inline-label">Route</strong>
                  {row.routeLabel}
                </span>
                <span role="cell">
                  <strong className="price-table__inline-label">Bucket</strong>
                  {formatRelativeBucket(row.routeBucket)}
                </span>
                <span role="cell">
                  <strong className="price-table__inline-label">Travel dates</strong>
                  {formatTravelDate(row.departureDate)} to {formatTravelDate(row.returnDate)}
                </span>
                <span role="cell">
                  <strong className="price-table__inline-label">Trip shape</strong>
                  {row.tripNights} nights · {formatStops(row.maxStops)}
                </span>
                <span role="cell">
                  <strong className="price-table__inline-label">Airline</strong>
                  {row.airlineSummary ?? "Pending"}
                </span>
                <span role="cell">
                  <strong className="price-table__inline-label">Price</strong>
                  {formatCurrency(row.price, row.currency)}
                  {row.bookingUrl ? (
                    <>
                      <br />
                      <a href={row.bookingUrl} rel="noreferrer" target="_blank">
                        Open in Skyscanner
                      </a>
                    </>
                  ) : null}
                </span>
                <span role="cell">
                  <strong className="price-table__inline-label">Croned at</strong>
                  {formatDateTime(row.scannedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {selectedSeries && isModalOpen ? (
        <div
          aria-hidden={false}
          className="price-modal"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsModalOpen(false);
            }
          }}
        >
          <section
            aria-labelledby="price-route-dialog-title"
            aria-modal="true"
            className="price-focus price-modal__panel"
            id="price-route-dialog"
            role="dialog"
          >
            <div className="price-modal__chrome">
              <p className="ops-panel__eyebrow">Selected route</p>
              <button
                aria-label="Close route detail"
                className="price-modal__close"
                onClick={() => setIsModalOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="price-focus__header">
              <div>
                <h2 id="price-route-dialog-title">{selectedSeries.routeLabel}</h2>
                <p>
                  Scans {formatSearchRange(selectedSeries)} ·{" "}
                  {selectedSeries.latestTripNights !== null
                    ? `latest cheapest ${formatNightsLabel(selectedSeries.latestTripNights)}`
                    : "no winner yet"}{" "}
                  · {formatStops(selectedSeries.maxStops)} · {selectedSeries.points.length} cron snapshots
                </p>
                <p>
                  Latest airline: {selectedSeries.latestAirlineSummary ?? "Awaiting itinerary detail"}
                </p>
                {selectedSeries.latestBookingUrl ? (
                  <p>
                    <a href={selectedSeries.latestBookingUrl} rel="noreferrer" target="_blank">
                      Open this search in Skyscanner
                    </a>
                  </p>
                ) : null}
              </div>
              <div className="price-focus__stats">
                <article>
                  <span>Latest</span>
                  <strong>
                    {selectedSeries.latestPrice !== null
                      ? formatCurrency(selectedSeries.latestPrice)
                      : "n/a"}
                  </strong>
                </article>
                <article>
                  <span>Low</span>
                  <strong>
                    {selectedSeries.minPrice !== null
                      ? formatCurrency(selectedSeries.minPrice)
                      : "n/a"}
                  </strong>
                </article>
                <article>
                  <span>High</span>
                  <strong>
                    {selectedSeries.maxPrice !== null
                      ? formatCurrency(selectedSeries.maxPrice)
                      : "n/a"}
                  </strong>
                </article>
              </div>
            </div>

            <RouteTrendChart series={selectedSeries} />
          </section>
        </div>
      ) : null}
    </section>
  );
}
