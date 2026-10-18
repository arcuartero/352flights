import "server-only";
import { formatAirlineSummary } from "@/lib/airline-summary";
import { getPrimaryEditorialSection } from "@/lib/editorial-sections";
import {
  type CampaignPreviewDeal,
  type FarePricePosition,
} from "@/lib/ops-shared";
import { deriveStayBucketFromNights } from "@/lib/stay-buckets";
import { getMatchingLuxSchoolHoliday } from "@/lib/lux-school-holidays";
import {
  PUBLIC_FARES_PER_DESTINATION,
  PUBLIC_FARE_HISTORY_LIMIT,
  PUBLIC_FARE_MIN_HISTORY_POINTS,
  PUBLIC_TYPICAL_PRICE_RATIO,
  buildRouteMap,
  buildSeriesKey,
  buildSkyscannerUrl,
  classifyFarePrice,
  extractAirlineNames,
  extractDestinationStayHours,
  extractMetadataDateTime,
  extractMetadataNumber,
  extractPatternKey,
  extractPatternLabel,
  extractPrimaryAirlineCode,
  extractStopCount,
  formatDisplayRouteLabel,
  hasShortDestinationStay,
  medianPrice,
} from "@/lib/ops/shared";
import { type DealSummary, type SnapshotRow } from "@/lib/ops/types";

export function toRenderableDeal(deal: DealSummary): CampaignPreviewDeal {
  const historyPoints =
    deal.baselinePrice === null ? 0 : PUBLIC_FARE_MIN_HISTORY_POINTS;
  return {
    id: deal.id,
    score: deal.score,
    routeLabel: formatDisplayRouteLabel(deal.routeLabel, deal.patternLabel),
    title: deal.title,
    summary: deal.summary,
    routeBucket: deal.routeBucket,
    editorialSection: getPrimaryEditorialSection({
      routeBucket: deal.routeBucket,
      tripNights: deal.tripNights,
      dropRatio: deal.dropRatio,
      departureDate: deal.departureDate,
    }),
    destinationCity: deal.destinationCity,
    destinationAirport: deal.destinationAirport,
    dealPrice: deal.dealPrice,
    baselinePrice: deal.baselinePrice,
    dropRatio: deal.dropRatio,
    pricePosition: classifyFarePrice(deal.dropRatio, historyPoints),
    historyPoints,
    isEditorialDeal: true,
    departureDate: deal.departureDate,
    returnDate: deal.returnDate,
    tripNights: deal.tripNights,
    maxStops: deal.maxStops,
    airlineSummary: deal.airlineSummary,
    primaryAirlineCode: deal.primaryAirlineCode,
    outboundStopCount: deal.outboundStopCount,
    returnStopCount: deal.returnStopCount,
    outboundDepartureAt: deal.outboundDepartureAt,
    outboundArrivalAt: deal.outboundArrivalAt,
    returnDepartureAt: deal.returnDepartureAt,
    returnArrivalAt: deal.returnArrivalAt,
    destinationStayHours: deal.destinationStayHours,
    verifiedAt: deal.verifiedAt,
    bookingUrl: deal.bookingUrl,
  };
}

export function hasValidPublicDealDate(value: string | null | undefined) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !Number.isNaN(new Date(value).getTime())
  );
}

export function isRenderablePublicDeal(deal: CampaignPreviewDeal) {
  return (
    deal.dealPrice > 0 &&
    hasValidPublicDealDate(deal.departureDate) &&
    hasValidPublicDealDate(deal.returnDate) &&
    hasValidPublicDealDate(deal.outboundDepartureAt) &&
    hasValidPublicDealDate(deal.outboundArrivalAt) &&
    hasValidPublicDealDate(deal.returnDepartureAt) &&
    hasValidPublicDealDate(deal.returnArrivalAt) &&
    typeof deal.bookingUrl === "string" &&
    deal.bookingUrl.length > 0
  );
}

export function buildPublicFaresFromSnapshots(
  snapshots: SnapshotRow[],
  routeMap: ReturnType<typeof buildRouteMap>,
  options?: {
    maxFaresPerDestination?: number | null;
    balanceByMonth?: boolean;
  },
) {
  const snapshotsBySeries = new Map<string, SnapshotRow[]>();

  for (const snapshot of snapshots) {
    if (
      Number(snapshot.price) <= 0 ||
      hasShortDestinationStay(snapshot.metadata)
    ) {
      continue;
    }

    const route = routeMap.get(snapshot.route_id);
    if (!route) {
      continue;
    }

    const patternKey = extractPatternKey(snapshot.metadata);
    const seriesKey = buildSeriesKey(
      snapshot.route_id,
      patternKey ?? `${snapshot.max_stops}:${snapshot.trip_nights}`,
    );
    const series = snapshotsBySeries.get(seriesKey) ?? [];
    series.push(snapshot);
    snapshotsBySeries.set(seriesKey, series);
  }

  const fares: CampaignPreviewDeal[] = [];

  for (const series of snapshotsBySeries.values()) {
    series.sort(
      (left, right) =>
        new Date(right.scanned_at).getTime() -
        new Date(left.scanned_at).getTime(),
    );
    const hasPublicationDecisions = series.some((snapshot) =>
      Object.prototype.hasOwnProperty.call(
        snapshot.metadata ?? {},
        "public_fare_eligible",
      ),
    );
    const selectedSnapshots = hasPublicationDecisions
      ? series.filter((snapshot) => {
          if (snapshot.metadata?.["public_fare_eligible"] === true) {
            return true;
          }

          const monthlyRatio = extractMetadataNumber(
            snapshot.metadata,
            "public_monthly_drop_ratio",
          );
          return (
            monthlyRatio !== null &&
            monthlyRatio <= PUBLIC_TYPICAL_PRICE_RATIO &&
            Boolean(
              getMatchingLuxSchoolHoliday(
                snapshot.departure_date,
                snapshot.return_date,
              ),
            )
          );
        })
      : series.slice(0, 1);

    for (const snapshot of selectedSnapshots) {
      const route = routeMap.get(snapshot.route_id);
      if (!route) {
        continue;
      }

      const historyPrices = series
        .filter((item) => item.id !== snapshot.id)
        .slice(0, PUBLIC_FARE_HISTORY_LIMIT)
        .map((item) => Number(item.price))
        .filter((value) => Number.isFinite(value) && value > 0);
      const metadataHistoryPoints =
        extractMetadataNumber(snapshot.metadata, "public_reference_points") ??
        extractMetadataNumber(snapshot.metadata, "historical_history_points");
      const historyPoints = Math.max(
        0,
        Math.trunc(metadataHistoryPoints ?? historyPrices.length),
      );
      const metadataBaseline =
        extractMetadataNumber(snapshot.metadata, "public_reference_price") ??
        extractMetadataNumber(snapshot.metadata, "historical_baseline_price");
      const baselinePrice =
        metadataBaseline ??
        (historyPrices.length >= PUBLIC_FARE_MIN_HISTORY_POINTS
          ? medianPrice(historyPrices)
          : null);
      const metadataDropRatio =
        extractMetadataNumber(snapshot.metadata, "public_monthly_drop_ratio") ??
        extractMetadataNumber(snapshot.metadata, "historical_drop_ratio");
      const dropRatio =
        metadataDropRatio ??
        (baselinePrice && baselinePrice > 0
          ? Number(snapshot.price) / baselinePrice
          : null);
      const pricePosition = classifyFarePrice(dropRatio, historyPoints);
      const patternLabel = extractPatternLabel(snapshot.metadata);
      const airlineNames = extractAirlineNames(snapshot.metadata);
      const airlineSummary = formatAirlineSummary(airlineNames);
      const bookingUrl = buildSkyscannerUrl({
        originAirport: route.originAirport,
        destinationAirport: route.destinationAirport,
        departureDate: snapshot.departure_date,
        returnDate: snapshot.return_date,
        maxStops: snapshot.max_stops || route.maxStops,
      });
      const price = Number(snapshot.price);
      const positionScore: Record<FarePricePosition, number> = {
        exceptional: 100,
        below_usual: 80,
        typical: 60,
        above_usual: 40,
        new_price: 50,
      };

      fares.push({
        id: `fare-${snapshot.id}`,
        score: positionScore[pricePosition],
        routeLabel: formatDisplayRouteLabel(route.label, patternLabel),
        title: `Luxembourg to ${route.destinationCity} from ${price.toFixed(0)} ${snapshot.currency}`,
        summary: `Live ${snapshot.trip_nights}-night return fare, last verified ${snapshot.scanned_at}.`,
        routeBucket: deriveStayBucketFromNights(snapshot.trip_nights),
        editorialSection: getPrimaryEditorialSection({
          routeBucket: deriveStayBucketFromNights(snapshot.trip_nights),
          tripNights: snapshot.trip_nights,
          dropRatio,
          departureDate: snapshot.departure_date,
        }),
        destinationCity: route.destinationCity,
        destinationAirport: route.destinationAirport,
        dealPrice: price,
        baselinePrice,
        dropRatio,
        pricePosition,
        historyPoints,
        isEditorialDeal:
          snapshot.metadata?.["editorial_deal_candidate"] === true,
        departureDate: snapshot.departure_date,
        returnDate: snapshot.return_date,
        tripNights: snapshot.trip_nights,
        maxStops: snapshot.max_stops || route.maxStops,
        airlineSummary,
        primaryAirlineCode: extractPrimaryAirlineCode(snapshot.metadata),
        outboundStopCount: extractStopCount(
          snapshot.metadata,
          "outbound_stop_count",
        ),
        returnStopCount: extractStopCount(
          snapshot.metadata,
          "return_stop_count",
        ),
        outboundDepartureAt: extractMetadataDateTime(
          snapshot.metadata,
          "outbound_departure_at",
        ),
        outboundArrivalAt: extractMetadataDateTime(
          snapshot.metadata,
          "outbound_arrival_at",
        ),
        returnDepartureAt: extractMetadataDateTime(
          snapshot.metadata,
          "return_departure_at",
        ),
        returnArrivalAt: extractMetadataDateTime(
          snapshot.metadata,
          "return_arrival_at",
        ),
        destinationStayHours: extractDestinationStayHours(snapshot.metadata),
        verifiedAt: snapshot.scanned_at,
        bookingUrl,
      });
    }
  }

  const grouped = new Map<string, CampaignPreviewDeal[]>();
  for (const fare of dedupePublicDealsByItinerary(
    fares.filter(isRenderablePublicDeal),
  )) {
    const destinationKey = fare.destinationCity.trim().toLowerCase();
    const destinationFares = grouped.get(destinationKey) ?? [];
    destinationFares.push(fare);
    grouped.set(destinationKey, destinationFares);
  }

  const maxFaresPerDestination =
    options?.maxFaresPerDestination === undefined
      ? PUBLIC_FARES_PER_DESTINATION
      : options.maxFaresPerDestination;

  return [...grouped.values()]
    .flatMap((destinationFares) => {
      const sortedDestinationFares = destinationFares.sort(
        comparePublicDealsByPrice,
      );
      if (maxFaresPerDestination === null) {
        return sortedDestinationFares;
      }
      if (!options?.balanceByMonth) {
        return sortedDestinationFares.slice(0, maxFaresPerDestination);
      }

      const buckets = new Map<string, CampaignPreviewDeal[]>();
      for (const fare of sortedDestinationFares) {
        const departureMonth = fare.departureDate?.slice(0, 7) ?? "unknown";
        const routing = fare.maxStops === "NON_STOP" ? "direct" : "stops";
        const stay = fare.routeBucket;
        const key = `${departureMonth}:${routing}:${stay}`;
        const bucket = buckets.get(key) ?? [];
        bucket.push(fare);
        buckets.set(key, bucket);
      }

      const balanced: CampaignPreviewDeal[] = [];
      let queues = [...buckets.values()];
      while (balanced.length < maxFaresPerDestination && queues.length > 0) {
        const remainingQueues: CampaignPreviewDeal[][] = [];
        for (const queue of queues) {
          const nextFare = queue.shift();
          if (nextFare) {
            balanced.push(nextFare);
          }
          if (queue.length > 0) {
            remainingQueues.push(queue);
          }
          if (balanced.length >= maxFaresPerDestination) {
            break;
          }
        }
        queues = remainingQueues;
      }
      return balanced;
    })
    .sort(comparePublicDealsByPrice);
}

export function getLuxDateKey(
  value: string | Date,
  timeZone = "Europe/Luxembourg",
) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

export function getDealFreshnessKey(deal: CampaignPreviewDeal) {
  return deal.verifiedAt ?? null;
}

export function comparePublicDealsByPrice(
  left: CampaignPreviewDeal,
  right: CampaignPreviewDeal,
) {
  if (left.dealPrice !== right.dealPrice) {
    return left.dealPrice - right.dealPrice;
  }

  const leftDrop = left.dropRatio ?? Number.POSITIVE_INFINITY;
  const rightDrop = right.dropRatio ?? Number.POSITIVE_INFINITY;
  if (leftDrop !== rightDrop) {
    return leftDrop - rightDrop;
  }

  const leftVerified = left.verifiedAt
    ? new Date(left.verifiedAt).getTime()
    : 0;
  const rightVerified = right.verifiedAt
    ? new Date(right.verifiedAt).getTime()
    : 0;
  if (rightVerified !== leftVerified) {
    return rightVerified - leftVerified;
  }

  return left.routeLabel.localeCompare(right.routeLabel);
}

export function getPublicDealItineraryKey(deal: CampaignPreviewDeal) {
  return [
    deal.destinationAirport.trim().toUpperCase(),
    deal.destinationCity.trim().toLowerCase(),
    deal.routeBucket.trim().toLowerCase(),
    deal.maxStops.trim().toUpperCase(),
    deal.airlineSummary?.trim().toLowerCase() ?? "",
    deal.outboundDepartureAt ?? "",
    deal.outboundArrivalAt ?? "",
    deal.returnDepartureAt ?? "",
    deal.returnArrivalAt ?? "",
  ].join("|");
}

export function dedupePublicDealsByItinerary(deals: CampaignPreviewDeal[]) {
  const bestByItinerary = new Map<string, CampaignPreviewDeal>();

  for (const deal of deals) {
    const key = getPublicDealItineraryKey(deal);
    const existing = bestByItinerary.get(key);

    if (
      !existing ||
      Date.parse(deal.verifiedAt ?? "") >
        Date.parse(existing.verifiedAt ?? "") ||
      (deal.verifiedAt === existing.verifiedAt &&
        Number(deal.id.replace("fare-", "")) >
          Number(existing.id.replace("fare-", "")))
    ) {
      bestByItinerary.set(key, deal);
    }
  }

  return [...bestByItinerary.values()];
}

export function takeSectionDeals(
  candidates: CampaignPreviewDeal[],
  limit: number,
  maxPerDestination: number = 2,
) {
  const destinationCounts = new Map<string, number>();
  const items: CampaignPreviewDeal[] = [];

  for (const deal of [...candidates].sort(comparePublicDealsByPrice)) {
    const destinationKey =
      deal.destinationAirport?.trim().toUpperCase() ||
      deal.destinationCity?.trim().toLowerCase() ||
      deal.routeLabel;
    const seenForDestination = destinationCounts.get(destinationKey) ?? 0;

    if (seenForDestination >= maxPerDestination) {
      continue;
    }

    items.push(deal);
    destinationCounts.set(destinationKey, seenForDestination + 1);

    if (items.length >= limit) {
      break;
    }
  }

  return items;
}

export function buildPublicDealsSections(
  deals: CampaignPreviewDeal[],
  now: Date = new Date(),
) {
  const validDeals = deals.filter((deal) => deal.dealPrice > 0);
  const todayKey = getLuxDateKey(now);
  const weekStart = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const weekStartKey = getLuxDateKey(weekStart);
  const sortedDeals = [...validDeals].sort(comparePublicDealsByPrice);

  const weeklyCandidates = sortedDeals.filter((deal) => {
    const freshnessKey = getDealFreshnessKey(deal);
    if (!freshnessKey || !todayKey || !weekStartKey) {
      return false;
    }

    const dealKey = getLuxDateKey(freshnessKey);
    return dealKey !== null && dealKey >= weekStartKey && dealKey <= todayKey;
  });

  const shortTripCandidates = weeklyCandidates.filter(
    (deal) => deal.tripNights <= 4,
  );
  const longTripCandidates = weeklyCandidates.filter(
    (deal) => deal.tripNights >= 5,
  );

  const holidayCandidates = sortedDeals.filter((deal) =>
    Boolean(getMatchingLuxSchoolHoliday(deal.departureDate, deal.returnDate)),
  );

  const sections = [
    {
      key: "best_short_trips_this_week" as const,
      label: "Best finds this week for short trips",
      description:
        "The strongest fares verified in the last 7 days for quick trips up to 4 nights.",
      items: takeSectionDeals(shortTripCandidates, 6),
    },
    {
      key: "best_long_trips_this_week" as const,
      label: "Best finds this week for long trips",
      description:
        "The lowest fares verified during the last 7 days for trips of 5 nights or more.",
      items: takeSectionDeals(longTripCandidates, 6),
    },
    {
      key: "lux_school_holidays" as const,
      label: "Best for Luxembourg school holidays",
      description:
        "The cheapest options whose dates overlap official Luxembourg school holiday periods.",
      items: takeSectionDeals(holidayCandidates, 6),
    },
  ];

  return sections;
}
