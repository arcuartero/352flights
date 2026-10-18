import { formatStayBucketLabel } from "@/lib/stay-buckets";
import type { OpsPriceSeries, OpsPricePoint } from "@/lib/ops/types";
import { formatRouteStayLabel } from "@/lib/route-stay";

export type ReviewDeal = {
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

type SortOption = {
  value: string;
  label: string;
};

export function formatCurrency(value: number, currency: string = "EUR") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDateWithWeekday(value: string | null) {
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

export function formatTravelDateWithWeekday(value: string | null) {
  return formatDateWithWeekday(value);
}

export function formatDateTime(value: string | null) {
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

export function formatChartDate(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

export function formatFlightClock(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatFlightWeekdayClock(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatVerifiedAge(value: string | null, now: Date = new Date()) {
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

export function formatRelativeBucket(bucket: string) {
  return formatStayBucketLabel(bucket);
}

export function formatStops(value: string) {
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

export function formatDealState(status: string) {
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

export function formatSendType(sendType: string) {
  return sendType === "flash" ? "Flash" : "Digest";
}

function formatDropPercent(dropRatio: number | null) {
  if (dropRatio === null) {
    return null;
  }

  return `${Math.round((1 - dropRatio) * 100)}%`;
}

export function formatStayDaysAndHours(value: number | null) {
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

export function formatStayDaysAndHoursCompact(value: number | null) {
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

export function explainDealContext(deal: ReviewDeal) {
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
    sentences.push(
      `You still get ${formatStayDaysAndHours(deal.destinationStayHours)} on the ground.`,
    );
  }

  if (deal.verifiedAt) {
    sentences.push(`${formatVerifiedAge(deal.verifiedAt)}.`);
  }

  return sentences.join(" ");
}

export function formatSearchRange(series: OpsPriceSeries) {
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

export function buildFallbackSeriesFromDeal(deal: ReviewDeal): OpsPriceSeries {
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

export function buildPath(points: Array<{ x: number; y: number }>) {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");
}

export function buildMonthlyLows(series: OpsPriceSeries, now: Date = new Date()) {
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
    const point =
      series.points
        .filter((seriesPoint) => seriesPoint.departureDate?.startsWith(key))
        .sort((left, right) => left.price - right.price)[0] ?? null;

    return {
      key,
      label: formatter.format(value).toUpperCase(),
      point,
    };
  });
}

export function extractAirlineFilterValues(summary: string | null) {
  if (!summary) {
    return [];
  }

  return summary
    .split(",")
    .map((item) => item.replace(/\+\s*\d+\s+more/i, "").trim())
    .filter(Boolean);
}

export const REVIEW_RATIO_PERCENT = 72;

export const FLASH_RATIO_PERCENT = 60;

export const MIN_BASELINE_POINTS = 5;

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

export function applySortCriterion(
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
    return compareNullableNumber(
      helpers.priceValue(left),
      helpers.priceValue(right),
      "asc",
    );
  }

  if (criterion === "price-desc") {
    return compareNullableNumber(
      helpers.priceValue(left),
      helpers.priceValue(right),
      "desc",
    );
  }

  if (criterion === "nights-asc") {
    return compareNullableNumber(
      helpers.nightValue(left),
      helpers.nightValue(right),
      "asc",
    );
  }

  if (criterion === "nights-desc") {
    return compareNullableNumber(
      helpers.nightValue(left),
      helpers.nightValue(right),
      "desc",
    );
  }

  return helpers.freshnessValue(right) - helpers.freshnessValue(left);
}

export const SORT_OPTIONS: SortOption[] = [
  { value: "freshness", label: "Latest scan first" },
  { value: "price-asc", label: "Lowest price first" },
  { value: "price-desc", label: "Highest price first" },
  { value: "nights-asc", label: "Fewest nights first" },
  { value: "nights-desc", label: "Most nights first" },
];
