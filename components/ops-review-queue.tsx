"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";

import type { OpsPricePoint, OpsPriceSeries } from "@/lib/ops";
import { buildEditorialSections } from "@/lib/editorial-sections";
import {
  formatNightsLabel,
  formatRoutePatternLabel,
  formatRouteStayLabel,
} from "@/lib/route-stay";
import { formatStayBucketLabel } from "@/lib/stay-buckets";

type ReviewDeal = {
  id: string;
  routeId: string;
  title: string;
  summary: string;
  routeLabel: string;
  routeBucket: string;
  patternKey: string | null;
  patternLabel: string | null;
  departureDate: string | null;
  returnDate: string | null;
  outboundDepartureAt: string | null;
  outboundArrivalAt: string | null;
  returnDepartureAt: string | null;
  returnArrivalAt: string | null;
  destinationStayHours: number | null;
  dealPrice: number;
  baselinePrice: number | null;
  baselineHistoryDays: number | null;
  dropRatio: number | null;
  status: string;
  sendType: string;
  tripNights: number;
  maxStops: string;
  airlineSummary: string | null;
  createdAt: string;
  verifiedAt: string | null;
  bookingUrl: string | null;
  destinationCity: string;
  destinationAirport: string;
};

type OpsReviewQueueProps = {
  deals: ReviewDeal[];
  priceSeries: OpsPriceSeries[];
  totalNewDeals: number;
  bulkReviewDealAction: (formData: FormData) => void | Promise<void>;
  reviewDealAction: (formData: FormData) => void | Promise<void>;
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

function formatDate(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateWithWeekday(value: string | null) {
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

function formatTravelDateWithWeekday(value: string | null) {
  return formatDateWithWeekday(value);
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

function formatChartDate(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
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

function formatRelativeBucket(bucket: string) {
  return formatStayBucketLabel(bucket);
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

function formatDealState(status: string) {
  if (status === "new") {
    return "New";
  }

  if (status === "reviewed") {
    return "Reviewed";
  }

  if (status === "sent") {
    return "Sent";
  }

  if (status === "expired") {
    return "Expired";
  }

  return status;
}

function formatSendType(sendType: string) {
  return sendType === "flash" ? "Flash" : "Digest";
}

function formatDropPercent(dropRatio: number | null) {
  if (dropRatio === null) {
    return null;
  }

  return `${Math.round((1 - dropRatio) * 100)}%`;
}

function formatStayDaysAndHours(value: number | null) {
  if (value === null) {
    return "n/a";
  }

  const totalHours = Math.max(0, Math.round(value));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days === 0) {
    return `${totalHours}h in destination`;
  }

  if (hours === 0) {
    return `${days}d in destination`;
  }

  return `${days}d ${hours}h in destination`;
}

function formatStayDaysAndHoursCompact(value: number | null) {
  if (value === null) {
    return "n/a";
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

  return `${totalHours}h`;
}

function explainDealContext(deal: ReviewDeal) {
  const sentences: string[] = [];
  const dropPercent = formatDropPercent(deal.dropRatio);

  if (deal.baselinePrice !== null && dropPercent) {
    sentences.push(
      `Usually this pattern sits around ${formatCurrency(deal.baselinePrice)}. Right now it is ${dropPercent} cheaper at ${formatCurrency(deal.dealPrice)}.`,
    );
  } else if (deal.baselinePrice !== null) {
    sentences.push(
      `Recent runs were closer to ${formatCurrency(deal.baselinePrice)}, and the current winner is ${formatCurrency(deal.dealPrice)}.`,
    );
  } else {
    sentences.push(
      `The baseline is still forming, but the current winning itinerary is ${formatCurrency(deal.dealPrice)}.`,
    );
  }

  if (deal.maxStops === "NON_STOP") {
    sentences.push("It is a non-stop option.");
  } else if (deal.maxStops === "ONE_STOP_OR_FEWER") {
    sentences.push("It stays within the up-to-1-stop rule.");
  }

  if (deal.destinationStayHours !== null) {
    sentences.push(`You still get ${formatStayDaysAndHours(deal.destinationStayHours)} on the ground.`);
  }

  if (deal.verifiedAt) {
    sentences.push(`${formatVerifiedAge(deal.verifiedAt)}.`);
  }

  return sentences.join(" ");
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

function buildSeriesKey(routeId: string, patternKey: string | null) {
  return `${routeId}:${patternKey ?? "legacy"}`;
}

function buildFallbackSeriesFromDeal(deal: ReviewDeal): OpsPriceSeries {
  const seriesKey = buildSeriesKey(deal.routeId, deal.patternKey);
  const scannedAt = deal.verifiedAt ?? deal.createdAt;
  const point: OpsPricePoint = {
    id: -1,
    seriesKey,
    routeId: deal.routeId,
    routeLabel: deal.routeLabel,
    routeBucket: deal.routeBucket,
    patternKey: deal.patternKey,
    patternLabel: deal.patternLabel,
    destinationCity: deal.destinationCity,
    destinationAirport: deal.destinationAirport,
    tripNights: deal.tripNights,
    routeTripNights: deal.tripNights,
    routeMinTripNights: deal.tripNights,
    routeMaxTripNights: deal.tripNights,
    maxStops: deal.maxStops,
    airlineNames: deal.airlineSummary ? [deal.airlineSummary] : [],
    airlineSummary: deal.airlineSummary,
    bookingUrl: deal.bookingUrl,
    price: deal.dealPrice,
    currency: "EUR",
    departureDate: deal.departureDate ?? scannedAt.slice(0, 10),
    returnDate: deal.returnDate,
    outboundDepartureAt: deal.outboundDepartureAt,
    outboundArrivalAt: deal.outboundArrivalAt,
    returnDepartureAt: deal.returnDepartureAt,
    returnArrivalAt: deal.returnArrivalAt,
    destinationStayHours: deal.destinationStayHours,
    scannedAt,
  };

  return {
    seriesKey,
    routeId: deal.routeId,
    routeLabel: deal.routeLabel,
    routeBucket: deal.routeBucket,
    patternKey: deal.patternKey,
    patternLabel: deal.patternLabel,
    destinationCity: deal.destinationCity,
    destinationAirport: deal.destinationAirport,
    routeTripNights: deal.tripNights,
    routeMinTripNights: deal.tripNights,
    routeMaxTripNights: deal.tripNights,
    latestTripNights: deal.tripNights,
    maxStops: deal.maxStops,
    latestAirlineSummary: deal.airlineSummary,
    latestBookingUrl: deal.bookingUrl,
    latestPrice: deal.dealPrice,
    previousPrice: null,
    minPrice: deal.dealPrice,
    maxPrice: deal.dealPrice,
    latestDepartureDate: deal.departureDate,
    latestReturnDate: deal.returnDate,
    latestOutboundDepartureAt: deal.outboundDepartureAt,
    latestOutboundArrivalAt: deal.outboundArrivalAt,
    latestReturnDepartureAt: deal.returnDepartureAt,
    latestReturnArrivalAt: deal.returnArrivalAt,
    latestDestinationStayHours: deal.destinationStayHours,
    latestScannedAt: scannedAt,
    points: [point],
  };
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

function ReviewTrendChart({ series }: { series: OpsPriceSeries }) {
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
  const activeIndex = hoveredIndex ?? coordinates.length - 1;
  const latest = series.points.at(-1) ?? null;
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
              <g key={`${series.seriesKey}-x-${index}`}>
                <path
                  className="price-chart__axis-tick"
                  d={`M ${point.x} ${margin.top + plotHeight} L ${point.x} ${margin.top + plotHeight + 6}`}
                />
                <text className="price-chart__axis-label price-chart__axis-label--x" textAnchor={index === 0 ? "start" : index === coordinates.length - 1 ? "end" : "middle"} x={point.x} y={margin.top + plotHeight + 22}>
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
                Stay {formatStayDaysAndHoursCompact(latest.destinationStayHours)}
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

  return Array.from({ length: 12 }, (_, index) => {
    const value = new Date(referenceYear, index, 1);
    const key = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
    const point = series.points
      .filter((seriesPoint) => seriesPoint.departureDate?.startsWith(key))
      .sort((left, right) => left.price - right.price)[0] ?? null;

    return {
      key,
      label: formatter.format(value).toUpperCase(),
      point,
    };
  });
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

const REVIEW_RATIO_PERCENT = 72;
const FLASH_RATIO_PERCENT = 60;
const MIN_BASELINE_POINTS = 5;

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
  left: ReviewDeal,
  right: ReviewDeal,
  criterion: string,
  helpers: {
    priceValue: (deal: ReviewDeal) => number | null;
    nightValue: (deal: ReviewDeal) => number | null;
    freshnessValue: (deal: ReviewDeal) => number;
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

export function OpsReviewQueue({
  deals,
  priceSeries,
  totalNewDeals,
  bulkReviewDealAction,
  reviewDealAction,
}: OpsReviewQueueProps) {
  const [searchValue, setSearchValue] = useState("");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [stopsFilter, setStopsFilter] = useState("all");
  const [airlineFilter, setAirlineFilter] = useState("all");
  const [maxPriceFilter, setMaxPriceFilter] = useState("");
  const [sortBy, setSortBy] = useState<string[]>(["freshness"]);
  const [selectedDealIds, setSelectedDealIds] = useState<string[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);

  const deferredSearch = useDeferredValue(searchValue);
  const deferredMaxPrice = useDeferredValue(maxPriceFilter);

  const maxPriceValue = useMemo(() => {
    const parsed = Number.parseFloat(deferredMaxPrice);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }, [deferredMaxPrice]);

  const bucketOptions = useMemo(
    () =>
      ["all", ...new Set(deals.map((deal) => deal.routeBucket))].map((bucket) => ({
        value: bucket,
        label: bucket === "all" ? "All buckets" : formatRelativeBucket(bucket),
      })),
    [deals],
  );

  const stopOptions = useMemo(
    () =>
      ["all", ...new Set(deals.map((deal) => deal.maxStops))].map((value) => ({
        value,
        label: value === "all" ? "All routing" : formatStops(value),
      })),
    [deals],
  );

  const airlineOptions = useMemo(
    () =>
      [
        "all",
        ...new Set(deals.flatMap((deal) => extractAirlineFilterValues(deal.airlineSummary))),
      ].map((value) => ({
        value,
        label: value === "all" ? "All airlines" : value,
      })),
    [deals],
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

  const filteredDeals = useMemo(() => {
    const search = deferredSearch.trim().toLowerCase();
    const filtered = deals.filter((deal) => {
      if (bucketFilter !== "all" && deal.routeBucket !== bucketFilter) {
        return false;
      }

      if (stopsFilter !== "all" && deal.maxStops !== stopsFilter) {
        return false;
      }

      if (
        airlineFilter !== "all" &&
        !extractAirlineFilterValues(deal.airlineSummary).includes(airlineFilter)
      ) {
        return false;
      }

      if (maxPriceValue !== null && deal.dealPrice > maxPriceValue) {
        return false;
      }

      if (!search) {
        return true;
      }

      return [
        deal.title,
        deal.routeLabel,
        deal.destinationCity,
        deal.destinationAirport,
        formatRelativeBucket(deal.routeBucket),
        deal.airlineSummary ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });

    const priceValue = (deal: ReviewDeal) => deal.dealPrice;
    const nightValue = (deal: ReviewDeal) => deal.tripNights ?? null;
    const freshnessValue = (deal: ReviewDeal) =>
      new Date(deal.verifiedAt ?? deal.createdAt).getTime();

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

      return left.title.localeCompare(right.title);
    });
  }, [airlineFilter, bucketFilter, deals, deferredSearch, maxPriceValue, sortBy, stopsFilter]);

  const editorialSections = useMemo(
    () =>
      buildEditorialSections(filteredDeals, (deal) => ({
        routeBucket: deal.routeBucket,
        tripNights: deal.tripNights,
        dropRatio: deal.dropRatio,
        departureDate: deal.departureDate,
      })),
    [filteredDeals],
  );

  const priceSeriesMap = useMemo(
    () => new Map(priceSeries.map((series) => [series.seriesKey, series])),
    [priceSeries],
  );

  const selectedDeal = useMemo(
    () => deals.find((deal) => deal.id === selectedDealId) ?? null,
    [deals, selectedDealId],
  );

  const selectedSeries = useMemo(() => {
    if (!selectedDeal?.patternKey) {
      return null;
    }

    return priceSeriesMap.get(buildSeriesKey(selectedDeal.routeId, selectedDeal.patternKey)) ?? null;
  }, [priceSeriesMap, selectedDeal]);

  const selectedDisplaySeries = useMemo(() => {
    if (!selectedDeal) {
      return null;
    }

    return selectedSeries ?? buildFallbackSeriesFromDeal(selectedDeal);
  }, [selectedDeal, selectedSeries]);

  const selectedSeriesMonthlyLows = useMemo(() => {
    if (!selectedDisplaySeries) {
      return [];
    }

    return buildMonthlyLows(selectedDisplaySeries);
  }, [selectedDisplaySeries]);

  useEffect(() => {
    const visibleIds = new Set(filteredDeals.map((deal) => deal.id));
    setSelectedDealIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [filteredDeals]);

  const allVisibleSelected =
    filteredDeals.length > 0 && filteredDeals.every((deal) => selectedDealIds.includes(deal.id));

  function toggleDealSelection(id: string) {
    setSelectedDealIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function toggleAllVisibleDeals() {
    if (allVisibleSelected) {
      setSelectedDealIds([]);
      return;
    }

    setSelectedDealIds(filteredDeals.map((deal) => deal.id));
  }

  return (
    <section className="ops-panel ops-panel--wide">
      <div className="ops-panel__header">
        <div>
          <p className="ops-panel__eyebrow">Review queue</p>
          <h2>New deals</h2>
        </div>
        <p>
          {filteredDeals.length} visible now · {totalNewDeals} total new
        </p>
      </div>

      <section className="ops-review-controls">
        <label className="ops-review-control ops-review-control--search">
          <span>Search route</span>
          <input
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Madrid, Ryanair, weekend..."
            type="search"
            value={searchValue}
          />
        </label>

        <label className="ops-review-control">
          <span>Bucket</span>
          <select onChange={(event) => setBucketFilter(event.target.value)} value={bucketFilter}>
            {bucketOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="ops-review-control">
          <span>Routing</span>
          <select onChange={(event) => setStopsFilter(event.target.value)} value={stopsFilter}>
            {stopOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="ops-review-control">
          <span>Airline</span>
          <select onChange={(event) => setAirlineFilter(event.target.value)} value={airlineFilter}>
            {airlineOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="ops-review-control">
          <span>Max deal price</span>
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

        <label className="ops-review-control">
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

      {filteredDeals.length === 0 ? (
        <div className="ops-empty">
          <p>No deals match the current filters.</p>
        </div>
      ) : (
        <div className="ops-deals">
          <section className="ops-review-bulk">
            <div className="ops-review-bulk__summary">
              <strong>{selectedDealIds.length} selected</strong>
              <button
                className="ops-button ops-button--ghost ops-button--compact"
                onClick={toggleAllVisibleDeals}
                type="button"
              >
                {allVisibleSelected ? "Clear visible" : "Select visible"}
              </button>
              {selectedDealIds.length > 0 ? (
                <button
                  className="ops-button ops-button--ghost ops-button--compact"
                  onClick={() => setSelectedDealIds([])}
                  type="button"
                >
                  Clear all
                </button>
              ) : null}
            </div>
            <div className="ops-review-bulk__actions">
              <form action={bulkReviewDealAction}>
                {selectedDealIds.map((id) => (
                  <input key={`reviewed-${id}`} name="id" type="hidden" value={id} />
                ))}
                <input name="status" type="hidden" value="reviewed" />
                <button
                  className="ops-button ops-button--approve"
                  disabled={selectedDealIds.length === 0}
                  type="submit"
                >
                  Mark selected reviewed
                </button>
              </form>
              <form action={bulkReviewDealAction}>
                {selectedDealIds.map((id) => (
                  <input key={`expired-${id}`} name="id" type="hidden" value={id} />
                ))}
                <input name="status" type="hidden" value="expired" />
                <button
                  className="ops-button ops-button--ghost"
                  disabled={selectedDealIds.length === 0}
                  type="submit"
                >
                  Expire selected
                </button>
              </form>
            </div>
          </section>

          {editorialSections.map((section) => (
            <section className="ops-deal-section" key={section.key}>
              <div className="ops-deal-section__header">
                <div>
                  <p className="ops-panel__eyebrow">{section.label}</p>
                  <h3>{section.items.length} deal{section.items.length === 1 ? "" : "s"}</h3>
                </div>
                <p>{section.description}</p>
              </div>
              {section.items.map((deal) => (
                <article className="ops-deal" key={deal.id}>
                  <label className="ops-deal__select">
                    <input
                      checked={selectedDealIds.includes(deal.id)}
                      onChange={() => toggleDealSelection(deal.id)}
                      type="checkbox"
                    />
                    <span>Select</span>
                  </label>
                  <div className="ops-deal__main">
                    <div className="ops-deal__heading">
                      <p className="ops-tag">{formatRelativeBucket(deal.routeBucket)}</p>
                      <h3>{deal.title}</h3>
                    </div>
                    <p className="ops-deal__summary">{deal.summary}</p>
                    <div className="ops-deal__why">
                      <span>Why this looks good</span>
                      <p>{explainDealContext(deal)}</p>
                    </div>
                    <dl className="ops-deal__facts">
                      <div>
                        <dt>Route</dt>
                        <dd>{formatRoutePatternLabel(deal.routeLabel, deal.patternLabel)}</dd>
                      </div>
                      <div>
                        <dt>Travel window</dt>
                        <dd>
                          {formatDateWithWeekday(deal.departureDate)} to{" "}
                          {formatDateWithWeekday(deal.returnDate)}
                        </dd>
                      </div>
                      <div>
                        <dt>Flight times</dt>
                        <dd>
                          {deal.outboundDepartureAt && deal.outboundArrivalAt ? (
                            <>
                              Out {formatFlightWeekdayClock(deal.outboundDepartureAt)} {"->"}{" "}
                              {formatFlightClock(deal.outboundArrivalAt)}
                            </>
                          ) : (
                            "Awaiting timing detail"
                          )}
                          {deal.returnDepartureAt && deal.returnArrivalAt ? (
                            <>
                              <br />
                              Back {formatFlightWeekdayClock(deal.returnDepartureAt)} {"->"}{" "}
                              {formatFlightClock(deal.returnArrivalAt)}
                            </>
                          ) : null}
                        </dd>
                      </div>
                      <div>
                        <dt>Time in destination</dt>
                        <dd>{formatStayDaysAndHours(deal.destinationStayHours)}</dd>
                      </div>
                      <div>
                        <dt>Deal price</dt>
                        <dd>{formatCurrency(deal.dealPrice)}</dd>
                      </div>
                      <div>
                        <dt>Baseline</dt>
                        <dd>
                          {deal.baselinePrice ? (
                            <>
                              {formatCurrency(deal.baselinePrice)}
                              {deal.baselineHistoryDays ? (
                                <>
                                  <br />
                                  <small>{deal.baselineHistoryDays}d history</small>
                                </>
                              ) : null}
                            </>
                          ) : (
                            "Not enough data"
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Drop</dt>
                        <dd>
                          {deal.dropRatio
                            ? `${Math.round((1 - deal.dropRatio) * 100)}% below baseline`
                            : "n/a"}
                        </dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>{formatDealState(deal.status)}</dd>
                      </div>
                      <div>
                        <dt className="ops-help-label">
                          <span>Send type</span>
                          <span className="ops-help-tooltip">
                            <button
                              aria-label="Explain send type thresholds"
                              className="ops-help-tooltip__trigger"
                              type="button"
                            >
                              i
                            </button>
                            <span className="ops-help-tooltip__bubble" role="tooltip">
                              Flash if the price is {FLASH_RATIO_PERCENT}% or less of the baseline.
                              Digest if it is above {FLASH_RATIO_PERCENT}% but still at or below{" "}
                              {REVIEW_RATIO_PERCENT}%. No deal is created if it stays above{" "}
                              {REVIEW_RATIO_PERCENT}% or if there are fewer than{" "}
                              {MIN_BASELINE_POINTS} historical prices.
                            </span>
                          </span>
                        </dt>
                        <dd>{formatSendType(deal.sendType)}</dd>
                      </div>
                      <div>
                        <dt>Trip shape</dt>
                        <dd>
                          {deal.tripNights} nights · {formatStops(deal.maxStops)}
                        </dd>
                      </div>
                      <div>
                        <dt>Airline</dt>
                        <dd>{deal.airlineSummary ?? "Awaiting itinerary detail"}</dd>
                      </div>
                      <div>
                        <dt>Verified</dt>
                        <dd>
                          {formatVerifiedAge(deal.verifiedAt)}
                          <br />
                          <small>{formatDateTime(deal.verifiedAt)}</small>
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="ops-deal__actions">
                    <button
                      className="ops-button ops-button--ghost"
                      onClick={() => setSelectedDealId(deal.id)}
                      type="button"
                    >
                      Open details
                    </button>
                    {deal.bookingUrl ? (
                      <a
                        className="ops-button ops-button--linkout"
                        href={deal.bookingUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <span>Skyscanner</span>
                        <span aria-hidden="true" className="ops-button__icon">
                          ↗
                        </span>
                      </a>
                    ) : null}
                    <form action={reviewDealAction}>
                      <input name="id" type="hidden" value={deal.id} />
                      <input name="status" type="hidden" value="reviewed" />
                      <button className="ops-button ops-button--approve" type="submit">
                        Mark reviewed
                      </button>
                    </form>
                    <form action={reviewDealAction}>
                      <input name="id" type="hidden" value={deal.id} />
                      <input name="status" type="hidden" value="expired" />
                      <button className="ops-button ops-button--ghost" type="submit">
                        Expire
                      </button>
                    </form>
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
      )}

      {selectedDeal ? (
        <div
          aria-hidden={false}
          className="price-modal"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedDealId(null);
            }
          }}
        >
          <section
            aria-labelledby="review-deal-dialog-title"
            aria-modal="true"
            className="price-focus price-modal__panel"
            role="dialog"
          >
            <div className="price-modal__chrome">
              <div className="price-modal__eyebrow-row">
                <p className="ops-panel__eyebrow">Selected route</p>
                <p className="price-modal__latest-scan-line">
                  Latest scan{" "}
                  {selectedDisplaySeries?.latestScannedAt
                    ? formatDateTime(selectedDisplaySeries.latestScannedAt)
                    : selectedDeal.verifiedAt
                      ? formatDateTime(selectedDeal.verifiedAt)
                      : "n/a"}
                </p>
              </div>
              <button
                aria-label="Close deal detail"
                className="price-modal__close"
                onClick={() => setSelectedDealId(null)}
                type="button"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <div className="price-focus__header">
              <div>
                <h2 id="review-deal-dialog-title">
                  {formatRoutePatternLabel(selectedDeal.routeLabel, selectedDeal.patternLabel)}
                </h2>
                <p>
                  {selectedDisplaySeries
                    ? `Scans ${formatSearchRange(selectedDisplaySeries)}`
                    : `Scans ${selectedDeal.patternLabel ?? formatNightsLabel(selectedDeal.tripNights)}`}{" "}
                  ·{" "}
                  {selectedDisplaySeries && selectedDisplaySeries.latestTripNights !== null
                    ? `latest cheapest ${formatNightsLabel(selectedDisplaySeries.latestTripNights)}`
                    : "no winner yet"}{" "}
                  · {formatStops(selectedDeal.maxStops)} ·{" "}
                  {selectedDisplaySeries
                    ? `${selectedDisplaySeries.points.length} cron snapshots`
                    : "No chart history yet"}
                </p>
                <p>
                  Latest airline: {selectedDisplaySeries?.latestAirlineSummary ?? selectedDeal.airlineSummary ?? "Awaiting itinerary detail"}
                </p>
                {(selectedDisplaySeries?.latestOutboundDepartureAt ?? selectedDeal.outboundDepartureAt) &&
                (selectedDisplaySeries?.latestOutboundArrivalAt ?? selectedDeal.outboundArrivalAt) &&
                (selectedDisplaySeries?.latestReturnDepartureAt ?? selectedDeal.returnDepartureAt) &&
                (selectedDisplaySeries?.latestReturnArrivalAt ?? selectedDeal.returnArrivalAt) ? (
                  <p>
                    Latest timing: out{" "}
                    {formatFlightWeekdayClock(selectedDisplaySeries?.latestOutboundDepartureAt ?? selectedDeal.outboundDepartureAt)}{" "}
                    {"->"}{" "}
                    {formatFlightClock(selectedDisplaySeries?.latestOutboundArrivalAt ?? selectedDeal.outboundArrivalAt)} · back{" "}
                    {formatFlightWeekdayClock(selectedDisplaySeries?.latestReturnDepartureAt ?? selectedDeal.returnDepartureAt)} {"->"}{" "}
                    {formatFlightClock(selectedDisplaySeries?.latestReturnArrivalAt ?? selectedDeal.returnArrivalAt)}
                    {(selectedDisplaySeries?.latestDestinationStayHours ?? selectedDeal.destinationStayHours) !== null
                      ? ` · stay ${formatStayDaysAndHoursCompact(selectedDisplaySeries?.latestDestinationStayHours ?? selectedDeal.destinationStayHours)}`
                      : ""}
                  </p>
                ) : null}
                {(selectedDisplaySeries?.latestBookingUrl ?? selectedDeal.bookingUrl) ? (
                  <p>
                    <a href={selectedDisplaySeries?.latestBookingUrl ?? selectedDeal.bookingUrl ?? "#"} rel="noreferrer" target="_blank">
                      Open this search in Skyscanner
                    </a>
                  </p>
                ) : null}
              </div>
              <div className="price-focus__stats">
                <article>
                  <span>Latest</span>
                  <strong>
                    {selectedDisplaySeries?.latestPrice !== null &&
                    selectedDisplaySeries?.latestPrice !== undefined
                      ? formatCurrency(selectedDisplaySeries.latestPrice)
                      : formatCurrency(selectedDeal.dealPrice)}
                  </strong>
                </article>
                <article>
                  <span>Low</span>
                  <strong>
                    {selectedDisplaySeries?.minPrice !== null &&
                    selectedDisplaySeries?.minPrice !== undefined
                      ? formatCurrency(selectedDisplaySeries.minPrice)
                      : "n/a"}
                  </strong>
                </article>
                <article>
                  <span>High</span>
                  <strong>
                    {selectedDisplaySeries?.maxPrice !== null &&
                    selectedDisplaySeries?.maxPrice !== undefined
                      ? formatCurrency(selectedDisplaySeries.maxPrice)
                      : "n/a"}
                  </strong>
                </article>
              </div>
            </div>

            {selectedDisplaySeries ? (
              <>
                <ReviewTrendChart series={selectedDisplaySeries} />

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
                            <p>Out {formatTravelDateWithWeekday(month.point.departureDate)}</p>
                            <p>Back {formatTravelDateWithWeekday(month.point.returnDate)}</p>
                            <p>
                              {month.point.destinationStayHours !== null
                                ? `Stay ${formatStayDaysAndHoursCompact(month.point.destinationStayHours)}`
                                : month.point.tripNights > 0
                                  ? formatNightsLabel(month.point.tripNights)
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
              </>
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}
