import "server-only";
import { formatAirlineSummary } from "@/lib/airline-summary";
import { deriveStayBucketFromNights } from "@/lib/stay-buckets";
import {
  buildRouteMap,
  buildSeriesKey,
  buildSkyscannerUrl,
  extractAirlineNames,
  extractDestinationStayHours,
  extractMetadataDateTime,
  extractPatternKey,
  extractPatternLabel,
  extractPrimaryAirlineCode,
  extractStopCount,
  hasShortDestinationStay,
} from "@/lib/ops/shared";
import {
  type DealRow,
  type DealSummary,
  type OpsPricePoint,
  type OpsPriceSeries,
  type SnapshotRow,
  type SnapshotSummary,
} from "@/lib/ops/types";

export function enrichDeals(
  deals: DealRow[],
  routeMap: ReturnType<typeof buildRouteMap>,
  snapshotMap: Map<number, SnapshotRow>,
  baselineSeriesStartMap: Map<string, string>,
) {
  return deals
    .map((deal) => {
      const route = routeMap.get(deal.route_id);
      const snapshot = snapshotMap.get(deal.snapshot_id);
      if (hasShortDestinationStay(snapshot?.metadata)) {
        return null;
      }
      const airlineNames = extractAirlineNames(snapshot?.metadata);
      const patternKey = extractPatternKey(snapshot?.metadata);
      const patternLabel = extractPatternLabel(snapshot?.metadata);
      const baselineSeriesKey = patternKey
        ? buildSeriesKey(deal.route_id, patternKey)
        : null;
      const baselineSeriesStartAt = baselineSeriesKey
        ? (baselineSeriesStartMap.get(baselineSeriesKey) ?? null)
        : null;
      const baselineHistoryDays =
        baselineSeriesStartAt && snapshot?.scanned_at
          ? Math.max(
              1,
              Math.round(
                (new Date(snapshot.scanned_at).getTime() -
                  new Date(baselineSeriesStartAt).getTime()) /
                  86_400_000,
              ),
            )
          : null;
      const bookingUrl = buildSkyscannerUrl({
        originAirport: route?.originAirport,
        destinationAirport: route?.destinationAirport,
        departureDate: snapshot?.departure_date,
        returnDate: snapshot?.return_date,
        maxStops: snapshot?.max_stops ?? route?.maxStops ?? "ANY",
      });

      return {
        id: deal.id,
        routeId: deal.route_id,
        title: deal.title,
        summary: deal.summary,
        status: deal.status,
        sendType: deal.send_type,
        score: deal.score,
        dealPrice: deal.deal_price,
        baselinePrice: deal.baseline_price,
        dropRatio: deal.drop_ratio,
        createdAt: deal.created_at,
        routeLabel: route?.label ?? "Unknown route",
        routeBucket: deriveStayBucketFromNights(
          snapshot?.trip_nights ?? route?.tripNights ?? 0,
        ),
        patternKey,
        patternLabel,
        destinationCity: route?.destinationCity ?? "Unknown city",
        destinationAirport: route?.destinationAirport ?? "UNK",
        tripNights: snapshot?.trip_nights ?? route?.tripNights ?? 0,
        maxStops: snapshot?.max_stops ?? route?.maxStops ?? "ANY",
        airlineNames,
        airlineSummary: formatAirlineSummary(airlineNames),
        primaryAirlineCode: extractPrimaryAirlineCode(snapshot?.metadata),
        outboundStopCount: extractStopCount(
          snapshot?.metadata,
          "outbound_stop_count",
        ),
        returnStopCount: extractStopCount(
          snapshot?.metadata,
          "return_stop_count",
        ),
        bookingUrl,
        departureDate: snapshot?.departure_date ?? null,
        returnDate: snapshot?.return_date ?? null,
        outboundDepartureAt: extractMetadataDateTime(
          snapshot?.metadata,
          "outbound_departure_at",
        ),
        outboundArrivalAt: extractMetadataDateTime(
          snapshot?.metadata,
          "outbound_arrival_at",
        ),
        returnDepartureAt: extractMetadataDateTime(
          snapshot?.metadata,
          "return_departure_at",
        ),
        returnArrivalAt: extractMetadataDateTime(
          snapshot?.metadata,
          "return_arrival_at",
        ),
        destinationStayHours: extractDestinationStayHours(snapshot?.metadata),
        verifiedAt: snapshot?.scanned_at ?? null,
        baselineHistoryDays,
      };
    })
    .filter(Boolean) as DealSummary[];
}

export function enrichSnapshots(
  snapshots: SnapshotRow[],
  routeMap: ReturnType<typeof buildRouteMap>,
): SnapshotSummary[] {
  return snapshots
    .map((snapshot) => {
      if (hasShortDestinationStay(snapshot.metadata)) {
        return null;
      }

      const route = routeMap.get(snapshot.route_id);
      const airlineNames = extractAirlineNames(snapshot.metadata);
      const patternKey = extractPatternKey(snapshot.metadata);
      const patternLabel = extractPatternLabel(snapshot.metadata);
      const bookingUrl = buildSkyscannerUrl({
        originAirport: route?.originAirport,
        destinationAirport: route?.destinationAirport,
        departureDate: snapshot.departure_date,
        returnDate: snapshot.return_date,
        maxStops: snapshot.max_stops || route?.maxStops || "ANY",
      });

      return {
        id: snapshot.id,
        routeLabel: route?.label ?? "Unknown route",
        routeBucket: deriveStayBucketFromNights(snapshot.trip_nights),
        patternKey,
        patternLabel,
        destinationCity: route?.destinationCity ?? "Unknown city",
        destinationAirport: route?.destinationAirport ?? "UNK",
        tripNights: snapshot.trip_nights,
        maxStops: snapshot.max_stops || route?.maxStops || "ANY",
        airlineNames,
        airlineSummary: formatAirlineSummary(airlineNames),
        bookingUrl,
        price: snapshot.price,
        currency: snapshot.currency,
        departureDate: snapshot.departure_date,
        returnDate: snapshot.return_date,
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
        scannedAt: snapshot.scanned_at,
      };
    })
    .filter(Boolean) as SnapshotSummary[];
}

export function toOpsPricePoint(
  snapshot: SnapshotSummary,
  routeId: string,
  route: {
    tripNights: number;
    minTripNights: number | null;
    maxTripNights: number | null;
  },
): OpsPricePoint {
  const seriesKey = buildSeriesKey(routeId, snapshot.patternKey);
  return {
    id: snapshot.id,
    seriesKey,
    routeId,
    routeLabel: snapshot.routeLabel,
    routeBucket: snapshot.routeBucket,
    patternKey: snapshot.patternKey,
    patternLabel: snapshot.patternLabel,
    destinationCity: snapshot.destinationCity,
    destinationAirport: snapshot.destinationAirport,
    tripNights: snapshot.tripNights,
    routeTripNights: route.tripNights,
    routeMinTripNights: route.minTripNights,
    routeMaxTripNights: route.maxTripNights,
    maxStops: snapshot.maxStops,
    airlineNames: snapshot.airlineNames,
    airlineSummary: snapshot.airlineSummary,
    bookingUrl: snapshot.bookingUrl,
    price: snapshot.price,
    currency: snapshot.currency,
    departureDate: snapshot.departureDate,
    returnDate: snapshot.returnDate,
    outboundDepartureAt: snapshot.outboundDepartureAt,
    outboundArrivalAt: snapshot.outboundArrivalAt,
    returnDepartureAt: snapshot.returnDepartureAt,
    returnArrivalAt: snapshot.returnArrivalAt,
    destinationStayHours: snapshot.destinationStayHours,
    scannedAt: snapshot.scannedAt,
  };
}

export function buildPriceSeries(
  snapshots: SnapshotRow[],
  routeMap: ReturnType<typeof buildRouteMap>,
): OpsPriceSeries[] {
  const enriched = snapshots
    .map((snapshot) => {
      const route = routeMap.get(snapshot.route_id);
      if (!route) {
        return null;
      }

      if (hasShortDestinationStay(snapshot.metadata)) {
        return null;
      }

      const airlineNames = extractAirlineNames(snapshot.metadata);
      const patternKey = extractPatternKey(snapshot.metadata);
      const patternLabel = extractPatternLabel(snapshot.metadata);

      // Legacy snapshots from the pre-pattern scanner should never appear in
      // Price Intelligence. This board is now reserved for exact rule-based
      // series only.
      if (patternKey === null) {
        return null;
      }

      return {
        seriesKey: buildSeriesKey(snapshot.route_id, patternKey),
        point: toOpsPricePoint(
          {
            id: snapshot.id,
            routeLabel: route.label,
            routeBucket: deriveStayBucketFromNights(snapshot.trip_nights),
            patternKey,
            patternLabel,
            destinationCity: route.destinationCity,
            destinationAirport: route.destinationAirport,
            tripNights: snapshot.trip_nights,
            maxStops: snapshot.max_stops || route.maxStops,
            airlineNames,
            airlineSummary: formatAirlineSummary(airlineNames),
            bookingUrl: buildSkyscannerUrl({
              originAirport: route.originAirport,
              destinationAirport: route.destinationAirport,
              departureDate: snapshot.departure_date,
              returnDate: snapshot.return_date,
              maxStops: snapshot.max_stops || route.maxStops,
            }),
            price: snapshot.price,
            currency: snapshot.currency,
            departureDate: snapshot.departure_date,
            returnDate: snapshot.return_date,
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
            destinationStayHours: extractDestinationStayHours(
              snapshot.metadata,
            ),
            scannedAt: snapshot.scanned_at,
          },
          snapshot.route_id,
          route,
        ),
      };
    })
    .filter(Boolean) as Array<{ seriesKey: string; point: OpsPricePoint }>;

  const grouped = new Map<string, OpsPricePoint[]>();
  for (const item of enriched) {
    const bucket = grouped.get(item.seriesKey) ?? [];
    bucket.push(item.point);
    grouped.set(item.seriesKey, bucket);
  }

  return Array.from(grouped.entries())
    .map(([seriesKey, points]) => {
      const orderedPoints = [...points].sort(
        (left, right) =>
          new Date(left.scannedAt).getTime() -
          new Date(right.scannedAt).getTime(),
      );
      const latestPoint = orderedPoints.at(-1) ?? null;
      const previousPoint = orderedPoints.at(-2) ?? null;
      const prices = orderedPoints.map((point) => point.price);

      return {
        seriesKey,
        routeId: latestPoint?.routeId ?? "unknown",
        routeLabel: latestPoint?.routeLabel ?? "Unknown route",
        routeBucket: latestPoint?.routeBucket ?? "unknown",
        patternKey: latestPoint?.patternKey ?? null,
        patternLabel: latestPoint?.patternLabel ?? null,
        destinationCity: latestPoint?.destinationCity ?? "Unknown city",
        destinationAirport: latestPoint?.destinationAirport ?? "UNK",
        routeTripNights: latestPoint?.routeTripNights ?? 0,
        routeMinTripNights: latestPoint?.routeMinTripNights ?? null,
        routeMaxTripNights: latestPoint?.routeMaxTripNights ?? null,
        latestTripNights: latestPoint?.tripNights ?? null,
        maxStops: latestPoint?.maxStops ?? "ANY",
        latestAirlineSummary: latestPoint?.airlineSummary ?? null,
        latestBookingUrl: latestPoint?.bookingUrl ?? null,
        latestPrice: latestPoint?.price ?? null,
        previousPrice: previousPoint?.price ?? null,
        minPrice: prices.length > 0 ? Math.min(...prices) : null,
        maxPrice: prices.length > 0 ? Math.max(...prices) : null,
        latestDepartureDate: latestPoint?.departureDate ?? null,
        latestReturnDate: latestPoint?.returnDate ?? null,
        latestOutboundDepartureAt: latestPoint?.outboundDepartureAt ?? null,
        latestOutboundArrivalAt: latestPoint?.outboundArrivalAt ?? null,
        latestReturnDepartureAt: latestPoint?.returnDepartureAt ?? null,
        latestReturnArrivalAt: latestPoint?.returnArrivalAt ?? null,
        latestDestinationStayHours: latestPoint?.destinationStayHours ?? null,
        latestScannedAt: latestPoint?.scannedAt ?? null,
        points: orderedPoints,
      };
    })
    .sort((left, right) => {
      const leftTime = left.latestScannedAt
        ? new Date(left.latestScannedAt).getTime()
        : 0;
      const rightTime = right.latestScannedAt
        ? new Date(right.latestScannedAt).getTime()
        : 0;
      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }

      return left.routeLabel.localeCompare(right.routeLabel);
    });
}
