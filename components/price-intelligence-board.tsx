"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";

import type { OpsPriceIntelligenceData, OpsPricePoint, OpsPriceSeries } from "@/lib/ops";
import {
  formatNightsLabel,
  formatRoutePatternLabel,
  formatRouteStayLabel,
} from "@/lib/route-stay";
import { formatStayBucketLabel } from "@/lib/stay-buckets";

type PriceIntelligenceBoardProps = {
  data: OpsPriceIntelligenceData;
};

type SortOption = {
  value: string;
  label: string;
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

function formatTravelDateWithWeekday(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatFlightClock(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatFlightWeekdayClock(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatStayDaysAndHours(value: number | null) {
  if (value === null) {
    return null;
  }

  const totalHours = Math.max(0, Math.round(value));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0 && hours > 0) {
    return `${days}d ${hours}h`;
  }

  if (days > 0) {
    return `${days}d`;
  }

  return `${hours}h`;
}

function formatVerifiedAge(value: string | null, now: Date = new Date()) {
  if (!value) {
    return "Verified recently";
  }

  const diffMs = now.getTime() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 60_000) {
    return "Verified just now";
  }

  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 60) {
    return `Verified ${diffMinutes} min ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `Verified ${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `Verified ${diffDays}d ago`;
}

function formatChartDate(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function formatRelativeBucket(bucket: string) {
  return formatStayBucketLabel(bucket);
}

function extractAirlineFilterValues(summary: string | null) {
  if (!summary) {
    return [];
  }

  return summary
    .split(",")
    .map((item) => item.replace(/\+\s*\d+\s+more/i, "").trim())
    .filter(Boolean);
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
  if (series.patternLabel) {
    return series.patternLabel;
  }

  return formatRouteStayLabel({
    tripNights: series.routeTripNights,
    minTripNights: series.routeMinTripNights,
    maxTripNights: series.routeMaxTripNights,
  });
}

function compareNullableNumber(
  left: number | null,
  right: number | null,
  direction: "asc" | "desc" = "asc",
) {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return direction === "asc" ? left - right : right - left;
}

function applySortCriterion(
  left: OpsPriceSeries,
  right: OpsPriceSeries,
  criterion: string,
  helpers: {
    priceValue: (series: OpsPriceSeries) => number | null;
    nightValue: (series: OpsPriceSeries) => number | null;
    freshnessValue: (series: OpsPriceSeries) => number;
  },
) {
  if (criterion === "price-asc") {
    return compareNullableNumber(helpers.priceValue(left), helpers.priceValue(right), "asc");
  }

  if (criterion === "price-desc") {
    return compareNullableNumber(helpers.priceValue(left), helpers.priceValue(right), "desc");
  }

  if (criterion === "nights-asc") {
    return compareNullableNumber(helpers.nightValue(left), helpers.nightValue(right), "asc");
  }

  if (criterion === "nights-desc") {
    return compareNullableNumber(helpers.nightValue(left), helpers.nightValue(right), "desc");
  }

  return helpers.freshnessValue(right) - helpers.freshnessValue(left);
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
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const values = series.points.map((point) => point.price);
  const svgWidth = 640;
  const svgHeight = 260;
  const margin = {
    top: 16,
    right: 16,
    bottom: 40,
    left: 74,
  };
  const plotWidth = svgWidth - margin.left - margin.right;
  const plotHeight = svgHeight - margin.top - margin.bottom;
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const chartPadding = min === max ? Math.max(8, max * 0.06 || 8) : Math.max((max - min) * 0.12, 8);
  const chartMin = Math.max(0, min - chartPadding);
  const chartMax = max + chartPadding;
  const coordinates =
    values.length === 0
      ? []
      : values.map((value, index) => ({
          x:
            margin.left +
            (values.length === 1 ? plotWidth / 2 : (index / (values.length - 1)) * plotWidth),
          y:
            margin.top +
            plotHeight -
            ((value - chartMin) / (chartMax - chartMin || 1)) * plotHeight,
        }));
  const latest = series.points.at(-1) ?? null;
  const activeIndex = hoveredIndex ?? coordinates.length - 1;
  const activePoint = coordinates[activeIndex] ?? null;
  const activeSnapshot = series.points[activeIndex] ?? null;
  const activePointRatio = activePoint ? activePoint.x / svgWidth : 0.5;
  const tooltipPlacement =
    activePointRatio > 0.82 ? "is-right" : activePointRatio < 0.18 ? "is-left" : "is-center";
  const yTicks = Array.from({ length: 4 }, (_, index) => {
    const ratio = index / 3;
    const value = chartMax - (chartMax - chartMin) * ratio;
    return {
      value,
      y: margin.top + plotHeight * ratio,
    };
  });
  const xTickIndexes = Array.from(
    new Set(
      [0, Math.floor((coordinates.length - 1) / 3), Math.floor(((coordinates.length - 1) * 2) / 3), coordinates.length - 1].filter(
        (index) => index >= 0,
      ),
    ),
  );

  if (coordinates.length === 0 || !latest) {
    return (
      <div className="price-chart__empty">
        <p>No chart data for this route yet.</p>
      </div>
    );
  }

  const areaPath = `${buildPath(coordinates)} L ${margin.left + plotWidth} ${margin.top + plotHeight} L ${margin.left} ${margin.top + plotHeight} Z`;

  return (
    <div className="price-chart">
      <div className="price-chart__axes">
        <span>Price</span>
        <span>Scan day</span>
      </div>
      <div className="price-chart__plot">
        <svg
          aria-hidden="true"
          className="price-chart__svg"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="price-area-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {yTicks.map((tick, index) => (
            <g key={`${series.routeId}-y-${index}`}>
              <path
                className="price-chart__grid"
                d={`M ${margin.left} ${tick.y} L ${margin.left + plotWidth} ${tick.y}`}
              />
              <text
                className="price-chart__axis-label price-chart__axis-label--y"
                x={margin.left - 10}
                y={tick.y + 4}
              >
                {formatCurrency(tick.value)}
              </text>
            </g>
          ))}
          {xTickIndexes.map((index) => {
            const point = coordinates[index];
            const snapshot = series.points[index];

            if (!point || !snapshot) {
              return null;
            }

            return (
              <g key={`${series.routeId}-x-${index}`}>
                <path
                  className="price-chart__axis-tick"
                  d={`M ${point.x} ${margin.top + plotHeight} L ${point.x} ${margin.top + plotHeight + 6}`}
                />
                <text
                  className="price-chart__axis-label price-chart__axis-label--x"
                  textAnchor={index === 0 ? "start" : index === coordinates.length - 1 ? "end" : "middle"}
                  x={point.x}
                  y={margin.top + plotHeight + 22}
                >
                  {formatChartDate(snapshot.scannedAt)}
                </text>
              </g>
            );
          })}
          <path
            className="price-chart__axis-line"
            d={`M ${margin.left} ${margin.top + plotHeight} L ${margin.left + plotWidth} ${margin.top + plotHeight}`}
          />
          <path
            className="price-chart__axis-line"
            d={`M ${margin.left} ${margin.top} L ${margin.left} ${margin.top + plotHeight}`}
          />
          <path className="price-chart__area" d={areaPath} />
          <path className="price-chart__line" d={buildPath(coordinates)} />
          {coordinates.map((point, index) => (
            <g key={`${series.routeId}-${index}`}>
              <circle
                className={`price-chart__dot ${
                  index === coordinates.length - 1 ? "is-latest" : ""
                } ${index === activeIndex ? "is-active" : ""}`}
                cx={point.x}
                cy={point.y}
                r={index === coordinates.length - 1 || index === activeIndex ? 5 : 3}
              />
              <circle
                className="price-chart__hit-area"
                cx={point.x}
                cy={point.y}
                onBlur={() => setHoveredIndex(null)}
                onFocus={() => setHoveredIndex(index)}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                r={11}
                tabIndex={0}
              />
            </g>
          ))}
        </svg>
        {activePoint && activeSnapshot ? (
          <div
            className={`price-chart__tooltip ${tooltipPlacement}`}
            style={{
              left: `${(activePoint.x / svgWidth) * 100}%`,
              top: `${(activePoint.y / svgHeight) * 100}%`,
            }}
          >
            <strong>{formatCurrency(activeSnapshot.price, activeSnapshot.currency)}</strong>
            <span>{formatChartDate(activeSnapshot.scannedAt)}</span>
            <span>Out {formatTravelDateWithWeekday(activeSnapshot.departureDate)}</span>
            <span>Back {formatTravelDateWithWeekday(activeSnapshot.returnDate)}</span>
          </div>
        ) : null}
      </div>
      <div className="price-chart__legend">
        <div>
          <span>Travel dates</span>
          <div className="price-chart__travel-dates">
            <p className="price-chart__detail-line">
              Out {formatTravelDateWithWeekday(latest.departureDate)}
            </p>
            <p className="price-chart__detail-line">
              Back {formatTravelDateWithWeekday(latest.returnDate)}
            </p>
          </div>
        </div>
        <div>
          <span>Flight times</span>
          <div className="price-chart__flight-times">
            <p className="price-chart__detail-line">
              Out {formatFlightWeekdayClock(latest.outboundDepartureAt)} {"->"}{" "}
              {formatFlightClock(latest.outboundArrivalAt)}
            </p>
            <p className="price-chart__detail-line">
              Back {formatFlightWeekdayClock(latest.returnDepartureAt)} {"->"}{" "}
              {formatFlightClock(latest.returnArrivalAt)}
            </p>
            {latest.destinationStayHours !== null ? (
              <p className="price-chart__detail-line">
                Stay {formatStayDaysAndHours(latest.destinationStayHours)}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildMonthlyLows(series: OpsPriceSeries, now: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    month: "short",
  });

  const referenceDepartureDate =
    series.points
      .slice()
      .reverse()
      .find((point) => point.departureDate)?.departureDate ?? null;
  const referenceYear = referenceDepartureDate
    ? new Date(`${referenceDepartureDate}T00:00:00`).getFullYear()
    : now.getFullYear();

  const months = Array.from({ length: 12 }, (_, index) => {
    const value = new Date(referenceYear, index, 1);
    const key = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
    return {
      key,
      label: formatter.format(value),
      point: null as OpsPricePoint | null,
    };
  });

  const monthMap = new Map(months.map((month) => [month.key, month]));

  for (const point of series.points) {
    if (!point.departureDate) {
      continue;
    }

    const departure = new Date(`${point.departureDate}T00:00:00`);
    if (Number.isNaN(departure.getTime())) {
      continue;
    }

    const key = `${departure.getFullYear()}-${String(departure.getMonth() + 1).padStart(2, "0")}`;
    const bucket = monthMap.get(key);
    if (!bucket) {
      continue;
    }

    if (bucket.point === null || point.price < bucket.point.price) {
      bucket.point = point;
    }
  }

  return months;
}

export function PriceIntelligenceBoard({ data }: PriceIntelligenceBoardProps) {
  const [searchValue, setSearchValue] = useState("");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [stopsFilter, setStopsFilter] = useState("all");
  const [airlineFilter, setAirlineFilter] = useState("all");
  const [maxPriceFilter, setMaxPriceFilter] = useState("");
  const [sortBy, setSortBy] = useState<string[]>(["freshness"]);
  const [selectedSeriesKey, setSelectedSeriesKey] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSnapshotTableOpen, setIsSnapshotTableOpen] = useState(false);

  const deferredSearch = useDeferredValue(searchValue);
  const deferredMaxPrice = useDeferredValue(maxPriceFilter);

  const maxPriceValue = useMemo(() => {
    const parsed = Number.parseFloat(deferredMaxPrice);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }, [deferredMaxPrice]);

  const filteredSeries = useMemo(() => {
    const search = deferredSearch.trim().toLowerCase();
    const filtered = data.series.filter((series) => {
      const matchesBucket = bucketFilter === "all" || series.routeBucket === bucketFilter;
      if (!matchesBucket) {
        return false;
      }

      const matchesStops = stopsFilter === "all" || series.maxStops === stopsFilter;
      if (!matchesStops) {
        return false;
      }

      const matchesAirline =
        airlineFilter === "all" ||
        extractAirlineFilterValues(series.latestAirlineSummary).includes(airlineFilter);
      if (!matchesAirline) {
        return false;
      }

      const matchesPrice =
        maxPriceValue === null ||
        (series.latestPrice !== null && series.latestPrice <= maxPriceValue);
      if (!matchesPrice) {
        return false;
      }

      if (!search) {
        return true;
      }

      return [
        series.routeLabel,
        series.patternLabel ?? "",
        series.destinationCity,
        series.destinationAirport,
        formatRelativeBucket(series.routeBucket),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });

    const priceValue = (series: OpsPriceSeries) => series.latestPrice;
    const nightValue = (series: OpsPriceSeries) =>
      series.latestTripNights ?? series.routeTripNights ?? null;
    const freshnessValue = (series: OpsPriceSeries) =>
      series.latestScannedAt ? new Date(series.latestScannedAt).getTime() : 0;

    const activeSorts = sortBy.length > 0 ? sortBy : ["freshness"];

    return [...filtered].sort((left, right) => {
      for (const criterion of activeSorts) {
        const result = applySortCriterion(left, right, criterion, {
          priceValue,
          nightValue,
          freshnessValue,
        });
        if (result !== 0) {
          return result;
        }
      }

      return left.routeLabel.localeCompare(right.routeLabel);
    });
  }, [
    bucketFilter,
    data.series,
    deferredSearch,
    airlineFilter,
    maxPriceValue,
    sortBy,
    stopsFilter,
  ]);

  useEffect(() => {
    if (filteredSeries.length === 0) {
      setSelectedSeriesKey(null);
      setIsModalOpen(false);
      return;
    }

    if (
      selectedSeriesKey &&
      !filteredSeries.some((series) => series.seriesKey === selectedSeriesKey)
    ) {
      setSelectedSeriesKey(isModalOpen ? filteredSeries[0].seriesKey : null);
    }
  }, [filteredSeries, isModalOpen, selectedSeriesKey]);

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
    filteredSeries.find((series) => series.seriesKey === selectedSeriesKey) ?? null;
  const selectedSeriesMonthlyLows = useMemo(
    () => (selectedSeries ? buildMonthlyLows(selectedSeries) : []),
    [selectedSeries],
  );

  const filteredRows = useMemo(() => {
    if (filteredSeries.length === 0) {
      return [];
    }

    const seriesKeys = new Set(filteredSeries.map((series) => series.seriesKey));
    return data.tableRows.filter((row) => seriesKeys.has(row.seriesKey));
  }, [data.tableRows, filteredSeries]);

  useEffect(() => {
    if (filteredRows.length === 0) {
      setIsSnapshotTableOpen(false);
    }
  }, [filteredRows.length]);

  const bucketOptions = useMemo(
    () =>
      ["all", ...new Set(data.series.map((series) => series.routeBucket))]
        .map((bucket) => ({
          value: bucket,
          label: bucket === "all" ? "All buckets" : formatRelativeBucket(bucket),
        })),
    [data.series],
  );

  const stopOptions = useMemo(
    () =>
      ["all", ...new Set(data.series.map((series) => series.maxStops))]
        .map((value) => ({
          value,
          label: value === "all" ? "All routing" : formatStops(value),
        })),
    [data.series],
  );

  const airlineOptions = useMemo(
    () =>
      [
        "all",
        ...new Set(
          data.series.flatMap((series) =>
            extractAirlineFilterValues(series.latestAirlineSummary),
          ),
        ),
      ].map((value) => ({
        value,
        label: value === "all" ? "All airlines" : value,
      })),
    [data.series],
  );

  const sortOptions: SortOption[] = [
    { value: "freshness", label: "Latest scan first" },
    { value: "price-asc", label: "Lowest price first" },
    { value: "price-desc", label: "Highest price first" },
    { value: "nights-asc", label: "Fewest nights first" },
    { value: "nights-desc", label: "Most nights first" },
  ];

  const activeSortSummary = useMemo(() => {
    if (sortBy.length === 0) {
      return "Latest scan first";
    }

    return sortBy
      .map((value) => sortOptions.find((option) => option.value === value)?.label ?? value)
      .join(" + ");
  }, [sortBy]);

  function toggleSortOption(value: string) {
    setSortBy((current) => {
      if (current.includes(value)) {
        const next = current.filter((item) => item !== value);
        return next.length > 0 ? next : ["freshness"];
      }

      const withoutFreshness =
        value !== "freshness" ? current.filter((item) => item !== "freshness") : current;
      return [...withoutFreshness, value];
    });
  }

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
            <span>Series tracked</span>
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
        <label className="price-control price-control--search">
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

        <label className="price-control">
          <span>Routing</span>
          <select onChange={(event) => setStopsFilter(event.target.value)} value={stopsFilter}>
            {stopOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="price-control">
          <span>Airline</span>
          <select onChange={(event) => setAirlineFilter(event.target.value)} value={airlineFilter}>
            {airlineOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="price-control">
          <span>Max live price</span>
          <input
            inputMode="numeric"
            min="0"
            onChange={(event) => setMaxPriceFilter(event.target.value)}
            placeholder="Any price"
            step="1"
            type="number"
            value={maxPriceFilter}
          />
        </label>

        <label className="price-control">
          <span>Sort by</span>
          <details className="price-sort-menu">
            <summary>{activeSortSummary}</summary>
            <div className="price-sort-menu__panel">
              {sortOptions.map((option) => {
                const activeIndex = sortBy.indexOf(option.value);
                return (
                  <label className="price-sort-menu__option" key={option.value}>
                    <input
                      checked={activeIndex !== -1}
                      onChange={() => toggleSortOption(option.value)}
                      type="checkbox"
                    />
                    <span>{option.label}</span>
                    {activeIndex !== -1 ? (
                      <strong className="price-sort-menu__priority">{activeIndex + 1}</strong>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </details>
        </label>
      </section>

      <section className="price-route-grid">
        {filteredSeries.map((series) => (
          <button
            className={`price-card ${series.seriesKey === selectedSeriesKey ? "is-active" : ""}`}
            key={series.seriesKey}
            aria-controls="price-route-dialog"
            aria-expanded={isModalOpen && series.seriesKey === selectedSeriesKey}
            onClick={() => {
              setSelectedSeriesKey(series.seriesKey);
              setIsModalOpen(true);
            }}
            type="button"
          >
            <div className="price-card__header">
              <div>
                <p className="ops-tag">{formatRelativeBucket(series.routeBucket)}</p>
                <h3>{formatRoutePatternLabel(series.routeLabel, series.patternLabel)}</h3>
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
            <p>No snapshots match the current search, filters, and sort view.</p>
          </div>
        ) : (
          <>
            <button
              aria-controls="price-snapshot-table"
              aria-expanded={isSnapshotTableOpen}
              className="price-table__toggle"
              onClick={() => setIsSnapshotTableOpen((current) => !current)}
              type="button"
            >
              <span>
                {isSnapshotTableOpen ? "Hide snapshot table" : "Show snapshot table"}
              </span>
              <strong>{filteredRows.length} rows</strong>
            </button>

            {isSnapshotTableOpen ? (
              <div
                className="price-table"
                id="price-snapshot-table"
                role="table"
                aria-label="Croned price history"
              >
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
                      {formatRoutePatternLabel(row.routeLabel, row.patternLabel)}
                    </span>
                    <span role="cell">
                      <strong className="price-table__inline-label">Bucket</strong>
                      {formatRelativeBucket(row.routeBucket)}
                    </span>
                    <span role="cell">
                      <strong className="price-table__inline-label">Travel dates</strong>
                      {formatTravelDateWithWeekday(row.departureDate)} to{" "}
                      {formatTravelDateWithWeekday(row.returnDate)}
                      {row.outboundDepartureAt && row.outboundArrivalAt ? (
                        <>
                          <br />
                          <small>
                            Out {formatFlightClock(row.outboundDepartureAt)} {"->"}{" "}
                            {formatFlightClock(row.outboundArrivalAt)}
                          </small>
                        </>
                      ) : null}
                      {row.returnDepartureAt && row.returnArrivalAt ? (
                        <>
                          <br />
                          <small>
                            Back {formatFlightClock(row.returnDepartureAt)} {"->"}{" "}
                            {formatFlightClock(row.returnArrivalAt)}
                          </small>
                        </>
                      ) : null}
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
                      <br />
                      <small>{formatVerifiedAge(row.scannedAt)}</small>
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
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
              <div className="price-modal__eyebrow-row">
                <p className="ops-panel__eyebrow">Selected route</p>
                <p className="price-modal__latest-scan-line">
                  Latest scan{" "}
                  {selectedSeries.latestScannedAt
                    ? formatDateTime(selectedSeries.latestScannedAt)
                    : "n/a"}
                </p>
              </div>
              <button
                aria-label="Close route detail"
                className="price-modal__close"
                onClick={() => setIsModalOpen(false)}
                type="button"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <div className="price-focus__header">
              <div>
                <h2 id="price-route-dialog-title">
                  {formatRoutePatternLabel(
                    selectedSeries.routeLabel,
                    selectedSeries.patternLabel,
                  )}
                </h2>
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
                {selectedSeries.latestOutboundDepartureAt &&
                selectedSeries.latestOutboundArrivalAt &&
                selectedSeries.latestReturnDepartureAt &&
                selectedSeries.latestReturnArrivalAt ? (
                  <p>
                    Latest timing: out {formatFlightWeekdayClock(selectedSeries.latestOutboundDepartureAt)}{" "}
                    {"->"} {formatFlightClock(selectedSeries.latestOutboundArrivalAt)} · back{" "}
                    {formatFlightWeekdayClock(selectedSeries.latestReturnDepartureAt)} {"->"}{" "}
                    {formatFlightClock(selectedSeries.latestReturnArrivalAt)}
                    {selectedSeries.latestDestinationStayHours !== null
                      ? ` · stay ${formatStayDaysAndHours(selectedSeries.latestDestinationStayHours)}`
                      : ""}
                  </p>
                ) : null}
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

            <section className="price-monthly-lows">
              <div className="price-monthly-lows__header">
                <span>Monthly lows</span>
                <p>Lowest price by departure month for this route and rule.</p>
              </div>
              <div className="price-monthly-lows__grid">
                {selectedSeriesMonthlyLows.map((month) => (
                  <article className="price-monthly-lows__card" key={month.key}>
                    <span>{month.label}</span>
                    <strong>
                      {month.point !== null
                        ? formatCurrency(month.point.price, month.point.currency)
                        : "n/a"}
                    </strong>
                    {month.point ? (
                      <>
                        <p>
                          Out {formatTravelDateWithWeekday(month.point.departureDate)}
                        </p>
                        <p>
                          Back {formatTravelDateWithWeekday(month.point.returnDate)}
                        </p>
                        <p>
                          {month.point.destinationStayHours !== null
                            ? `Stay ${formatStayDaysAndHours(month.point.destinationStayHours)}`
                            : month.point.tripNights > 0
                              ? `${formatNightsLabel(month.point.tripNights)}`
                              : "Duration n/a"}
                        </p>
                        {month.point.bookingUrl ? (
                          <a href={month.point.bookingUrl} rel="noreferrer" target="_blank">
                            Open in Skyscanner
                          </a>
                        ) : null}
                      </>
                    ) : (
                      <p>No fare found</p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </section>
        </div>
      ) : null}
    </section>
  );
}
