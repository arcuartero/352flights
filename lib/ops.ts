import "server-only";

import { createHash } from "node:crypto";

import { formatAirlineSummary, normalizeAirlineNames } from "@/lib/airline-summary";
import { getSiteUrl, hasResendEnv } from "@/lib/env";
import {
  buildCampaignPreviewText,
  buildCampaignSubject,
  renderCampaignEmail,
  sendResendEmail,
} from "@/lib/email";
import {
  campaignSendTypes,
  type CampaignPreview,
  type CampaignSendType,
  type RecentCampaignSummary,
} from "@/lib/ops-shared";
import { defaultPreferenceValues } from "@/lib/preferences-shared";
import { getSupabaseAdminClient } from "@/lib/supabase";

type CountResult = {
  count: number;
  error: string | null;
};

type SubscriberRow = {
  id: string;
  email: string;
  source: string;
  status: string;
  created_at: string;
  home_airport: string;
  onboarding_completed: boolean;
  preference_token: string;
};

type SubscriberPreferenceRow = {
  subscriber_id: string;
  preferred_buckets: string[] | null;
  max_stops_preference: string | null;
  min_trip_nights: number | null;
  max_trip_nights: number | null;
  budget_ceiling_eur: number | null;
  delivery_mode: string | null;
};

type SubscriberRoutePreferenceRow = {
  subscriber_id: string;
  destination_airport: string;
  destination_city: string;
  bucket: string;
  is_enabled: boolean;
};

type RouteRow = {
  id: string;
  origin_airport: string;
  destination_airport: string;
  destination_city: string;
  bucket: string;
  trip_nights: number;
  min_trip_nights: number | null;
  max_trip_nights: number | null;
  max_stops: string;
  is_active: boolean;
};

type SnapshotRow = {
  id: number;
  route_id: string;
  price: number;
  currency: string;
  departure_date: string;
  return_date: string | null;
  trip_nights: number;
  max_stops: string;
  metadata: Record<string, unknown> | null;
  scanned_at: string;
};

type DealRow = {
  id: string;
  route_id: string;
  snapshot_id: number;
  title: string;
  summary: string;
  deal_price: number;
  baseline_price: number | null;
  drop_ratio: number | null;
  score: number;
  send_type: CampaignSendType;
  status: string;
  created_at: string;
};

type EmailCampaignRow = {
  id: string;
  send_type: CampaignSendType;
  subject: string;
  status: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  route_labels: string[] | null;
  created_at: string;
  sent_at: string | null;
};

type RouteSummary = {
  id: string;
  label: string;
  bucket: string;
  tripNights: number;
  minTripNights: number | null;
  maxTripNights: number | null;
  maxStops: string;
  isActive: boolean;
};

type DealSummary = {
  id: string;
  title: string;
  summary: string;
  status: string;
  sendType: CampaignSendType;
  score: number;
  dealPrice: number;
  baselinePrice: number | null;
  dropRatio: number | null;
  createdAt: string;
  routeLabel: string;
  routeBucket: string;
  destinationCity: string;
  destinationAirport: string;
  tripNights: number;
  maxStops: string;
  airlineNames: string[];
  airlineSummary: string | null;
  bookingUrl: string | null;
  departureDate: string | null;
  returnDate: string | null;
};

type SnapshotSummary = {
  id: number;
  routeLabel: string;
  routeBucket: string;
  destinationCity: string;
  destinationAirport: string;
  tripNights: number;
  maxStops: string;
  airlineNames: string[];
  airlineSummary: string | null;
  bookingUrl: string | null;
  price: number;
  currency: string;
  departureDate: string;
  returnDate: string | null;
  scannedAt: string;
};

type SubscriberSummary = {
  id: string;
  email: string;
  source: string;
  status: string;
  createdAt: string;
  homeAirport: string;
  onboardingCompleted: boolean;
  deliveryMode: string;
  maxStopsPreference: string;
  minTripNights: number | null;
  maxTripNights: number | null;
  budgetCeilingEur: number | null;
  preferredBuckets: string[];
  selectedRouteLabels: string[];
};

type AudienceMember = SubscriberSummary & {
  preferenceToken: string;
  selectedRouteKeys: Set<string>;
};

type MatchedRecipient = {
  subscriber: AudienceMember;
  deals: DealSummary[];
};

export type OpsDashboardData = {
  configured: boolean;
  schemaReady: boolean;
  onboardingMessage: string | null;
  metrics: {
    subscribers: number;
    activeRoutes: number;
    pendingDeals: number;
    snapshots24h: number;
  };
  subscribers: SubscriberSummary[];
  routes: RouteSummary[];
  pendingDeals: DealSummary[];
  recentSnapshots: SnapshotSummary[];
  sendQueue: CampaignPreview[];
  recentCampaigns: RecentCampaignSummary[];
};

export type OpsPricePoint = {
  id: number;
  routeId: string;
  routeLabel: string;
  routeBucket: string;
  destinationCity: string;
  destinationAirport: string;
  tripNights: number;
  routeTripNights: number;
  routeMinTripNights: number | null;
  routeMaxTripNights: number | null;
  maxStops: string;
  airlineNames: string[];
  airlineSummary: string | null;
  bookingUrl: string | null;
  price: number;
  currency: string;
  departureDate: string;
  returnDate: string | null;
  scannedAt: string;
};

export type OpsPriceSeries = {
  routeId: string;
  routeLabel: string;
  routeBucket: string;
  destinationCity: string;
  destinationAirport: string;
  routeTripNights: number;
  routeMinTripNights: number | null;
  routeMaxTripNights: number | null;
  latestTripNights: number | null;
  maxStops: string;
  latestAirlineSummary: string | null;
  latestBookingUrl: string | null;
  latestPrice: number | null;
  previousPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  latestDepartureDate: string | null;
  latestReturnDate: string | null;
  latestScannedAt: string | null;
  points: OpsPricePoint[];
};

export type OpsPriceIntelligenceData = {
  configured: boolean;
  schemaReady: boolean;
  onboardingMessage: string | null;
  scannerNote: string;
  totals: {
    routesTracked: number;
    snapshotsLoaded: number;
    latestSnapshotAt: string | null;
    liveLowestPrice: number | null;
    liveLowestRouteLabel: string | null;
  };
  series: OpsPriceSeries[];
  tableRows: OpsPricePoint[];
};

function formatError(error: unknown) {
  if (!error || typeof error !== "object") {
    return "Unknown error";
  }

  if ("message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "Unknown error";
}

function isMissingTableError(message: string) {
  return message.includes("schema cache") || message.includes("does not exist");
}

function makeRouteKey(destinationAirport: string, bucket: string) {
  return `${destinationAirport}:${bucket}`;
}

function normalizeDeliveryMode(value: string | null | undefined) {
  return value ?? defaultPreferenceValues.deliveryMode;
}

function normalizeMaxStopsPreference(value: string | null | undefined) {
  return value ?? defaultPreferenceValues.maxStopsPreference;
}

function unique<T>(values: T[]) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function extractAirlineNames(metadata: Record<string, unknown> | null | undefined) {
  return normalizeAirlineNames(metadata?.["airline_names"]);
}

function formatSkyscannerDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${year.slice(2)}${month}${day}`;
}

function toSkyscannerPlace(code: string) {
  const cityOverrides: Record<string, string> = {
    LHR: "lond",
    LGW: "lond",
  };

  return cityOverrides[code.toUpperCase()] ?? code.toLowerCase();
}

function buildSkyscannerUrl(input: {
  originAirport: string | null | undefined;
  destinationAirport: string | null | undefined;
  departureDate: string | null | undefined;
  returnDate: string | null | undefined;
  maxStops: string;
}) {
  if (!input.originAirport || !input.destinationAirport || !input.departureDate || !input.returnDate) {
    return null;
  }

  const params = new URLSearchParams({
    adultsv2: "1",
    cabinclass: "economy",
    childrenv2: "",
    ref: "home",
    rtn: "1",
    outboundaltsenabled: "false",
    inboundaltsenabled: "false",
    preferdirects: String(input.maxStops === "NON_STOP"),
  });

  if (input.maxStops === "NON_STOP") {
    params.set("stops", "!oneStop,!twoPlusStops");
  } else if (input.maxStops === "ONE_STOP_OR_FEWER") {
    params.set("stops", "!twoPlusStops");
  }

  return [
    "https://www.skyscanner.net/transport/vols",
    toSkyscannerPlace(input.originAirport),
    toSkyscannerPlace(input.destinationAirport),
    formatSkyscannerDate(input.departureDate),
    formatSkyscannerDate(input.returnDate),
  ].join("/") + `/?${params.toString()}`;
}

async function countTable(
  table:
    | "newsletter_subscribers"
    | "scanned_routes"
    | "deal_candidates"
    | "price_snapshots",
  filter?: { column: string; value: string | boolean },
): Promise<CountResult> {
  const supabase = getSupabaseAdminClient();
  let query = supabase.from(table).select("*", { count: "exact", head: true });

  if (filter) {
    query = query.eq(filter.column, filter.value);
  }

  const { count, error } = await query;
  return {
    count: count ?? 0,
    error: error ? formatError(error) : null,
  };
}

function buildRouteMap(routes: RouteRow[]) {
  return new Map(
    routes.map((route) => [
      route.id,
      {
        label: `${route.origin_airport} -> ${route.destination_airport} (${route.destination_city})`,
        originAirport: route.origin_airport,
        bucket: route.bucket,
        destinationCity: route.destination_city,
        destinationAirport: route.destination_airport,
        tripNights: route.trip_nights,
        minTripNights: route.min_trip_nights,
        maxTripNights: route.max_trip_nights,
        maxStops: route.max_stops,
      },
    ]),
  );
}

function buildSubscriberSummaries(
  subscribers: SubscriberRow[],
  preferences: SubscriberPreferenceRow[],
  routePreferences: SubscriberRoutePreferenceRow[],
) {
  const preferenceMap = new Map(preferences.map((item) => [item.subscriber_id, item]));
  const routeMap = new Map<string, SubscriberRoutePreferenceRow[]>();

  for (const routePreference of routePreferences) {
    if (!routePreference.is_enabled) {
      continue;
    }

    const bucket = routeMap.get(routePreference.subscriber_id) ?? [];
    bucket.push(routePreference);
    routeMap.set(routePreference.subscriber_id, bucket);
  }

  return subscribers.map((subscriber) => {
    const preference = preferenceMap.get(subscriber.id);
    const selectedRoutes = (routeMap.get(subscriber.id) ?? []).sort((left, right) =>
      left.destination_city.localeCompare(right.destination_city),
    );

    const preferredBuckets =
      preference?.preferred_buckets && preference.preferred_buckets.length > 0
        ? preference.preferred_buckets
        : defaultPreferenceValues.preferredBuckets;

    return {
      id: subscriber.id,
      email: subscriber.email,
      source: subscriber.source,
      status: subscriber.status,
      createdAt: subscriber.created_at,
      homeAirport: subscriber.home_airport,
      onboardingCompleted: subscriber.onboarding_completed,
      preferenceToken: subscriber.preference_token,
      deliveryMode: normalizeDeliveryMode(preference?.delivery_mode),
      maxStopsPreference: normalizeMaxStopsPreference(preference?.max_stops_preference),
      minTripNights: preference?.min_trip_nights ?? defaultPreferenceValues.minTripNights,
      maxTripNights: preference?.max_trip_nights ?? defaultPreferenceValues.maxTripNights,
      budgetCeilingEur: preference?.budget_ceiling_eur ?? defaultPreferenceValues.budgetCeilingEur,
      preferredBuckets,
      selectedRouteLabels: selectedRoutes.map(
        (item) => `${item.destination_city} (${item.destination_airport})`,
      ),
      selectedRouteKeys: new Set(
        selectedRoutes.map((item) => makeRouteKey(item.destination_airport, item.bucket)),
      ),
    };
  });
}

function enrichDeals(
  deals: DealRow[],
  routeMap: ReturnType<typeof buildRouteMap>,
  snapshotMap: Map<number, SnapshotRow>,
) {
  return deals.map((deal) => {
    const route = routeMap.get(deal.route_id);
    const snapshot = snapshotMap.get(deal.snapshot_id);
    const airlineNames = extractAirlineNames(snapshot?.metadata);
    const bookingUrl = buildSkyscannerUrl({
      originAirport: route?.originAirport,
      destinationAirport: route?.destinationAirport,
      departureDate: snapshot?.departure_date,
      returnDate: snapshot?.return_date,
      maxStops: snapshot?.max_stops ?? route?.maxStops ?? "ANY",
    });

    return {
      id: deal.id,
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
      routeBucket: route?.bucket ?? "unknown",
      destinationCity: route?.destinationCity ?? "Unknown city",
      destinationAirport: route?.destinationAirport ?? "UNK",
      tripNights: snapshot?.trip_nights ?? route?.tripNights ?? 0,
      maxStops: snapshot?.max_stops ?? route?.maxStops ?? "ANY",
      airlineNames,
      airlineSummary: formatAirlineSummary(airlineNames),
      bookingUrl,
      departureDate: snapshot?.departure_date ?? null,
      returnDate: snapshot?.return_date ?? null,
    };
  });
}

function enrichSnapshots(
  snapshots: SnapshotRow[],
  routeMap: ReturnType<typeof buildRouteMap>,
): SnapshotSummary[] {
  return snapshots.map((snapshot) => {
    const route = routeMap.get(snapshot.route_id);
    const airlineNames = extractAirlineNames(snapshot.metadata);
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
      routeBucket: route?.bucket ?? "unknown",
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
      scannedAt: snapshot.scanned_at,
    };
  });
}

function toOpsPricePoint(
  snapshot: SnapshotSummary,
  routeId: string,
  route: {
    tripNights: number;
    minTripNights: number | null;
    maxTripNights: number | null;
  },
): OpsPricePoint {
  return {
    id: snapshot.id,
    routeId,
    routeLabel: snapshot.routeLabel,
    routeBucket: snapshot.routeBucket,
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
    scannedAt: snapshot.scannedAt,
  };
}

function buildPriceSeries(
  snapshots: SnapshotRow[],
  routeMap: ReturnType<typeof buildRouteMap>,
): OpsPriceSeries[] {
  const enriched = snapshots
    .map((snapshot) => {
      const route = routeMap.get(snapshot.route_id);
      if (!route) {
        return null;
      }

      const airlineNames = extractAirlineNames(snapshot.metadata);
      return {
        routeId: snapshot.route_id,
        point: toOpsPricePoint(
          {
            id: snapshot.id,
            routeLabel: route.label,
            routeBucket: route.bucket,
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
            scannedAt: snapshot.scanned_at,
          },
          snapshot.route_id,
          route,
        ),
      };
    })
    .filter(Boolean) as Array<{ routeId: string; point: OpsPricePoint }>;

  const grouped = new Map<string, OpsPricePoint[]>();
  for (const item of enriched) {
    const bucket = grouped.get(item.routeId) ?? [];
    bucket.push(item.point);
    grouped.set(item.routeId, bucket);
  }

  return Array.from(grouped.entries())
    .map(([routeId, points]) => {
      const orderedPoints = [...points].sort(
        (left, right) =>
          new Date(left.scannedAt).getTime() - new Date(right.scannedAt).getTime(),
      );
      const latestPoint = orderedPoints.at(-1) ?? null;
      const previousPoint = orderedPoints.at(-2) ?? null;
      const prices = orderedPoints.map((point) => point.price);

      return {
        routeId,
        routeLabel: latestPoint?.routeLabel ?? "Unknown route",
        routeBucket: latestPoint?.routeBucket ?? "unknown",
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
        latestScannedAt: latestPoint?.scannedAt ?? null,
        points: orderedPoints,
      };
    })
    .sort((left, right) => {
      const leftTime = left.latestScannedAt ? new Date(left.latestScannedAt).getTime() : 0;
      const rightTime = right.latestScannedAt ? new Date(right.latestScannedAt).getTime() : 0;
      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }

      return left.routeLabel.localeCompare(right.routeLabel);
    });
}

function deliveryModeMatches(sendType: CampaignSendType, deliveryMode: string) {
  if (sendType === "flash") {
    return deliveryMode === "daily_digest" || deliveryMode === "flash_only";
  }

  return deliveryMode === "daily_digest";
}

function stopsMatch(preference: string, routeMaxStops: string) {
  if (preference === "ANY") {
    return true;
  }

  if (preference === "NON_STOP") {
    return routeMaxStops === "NON_STOP";
  }

  return routeMaxStops === "NON_STOP" || routeMaxStops === "ONE_STOP_OR_FEWER";
}

function dealMatchesSubscriber(subscriber: AudienceMember, deal: DealSummary, sendType: CampaignSendType) {
  if (!deliveryModeMatches(sendType, subscriber.deliveryMode)) {
    return false;
  }

  if (!subscriber.preferredBuckets.includes(deal.routeBucket)) {
    return false;
  }

  if (
    subscriber.selectedRouteKeys.size > 0 &&
    !subscriber.selectedRouteKeys.has(makeRouteKey(deal.destinationAirport, deal.routeBucket))
  ) {
    return false;
  }

  if (!stopsMatch(subscriber.maxStopsPreference, deal.maxStops)) {
    return false;
  }

  if (subscriber.minTripNights !== null && deal.tripNights < subscriber.minTripNights) {
    return false;
  }

  if (subscriber.maxTripNights !== null && deal.tripNights > subscriber.maxTripNights) {
    return false;
  }

  if (subscriber.budgetCeilingEur !== null && deal.dealPrice > subscriber.budgetCeilingEur) {
    return false;
  }

  return true;
}

function matchRecipients(sendType: CampaignSendType, subscribers: AudienceMember[], deals: DealSummary[]) {
  const matched: MatchedRecipient[] = [];

  for (const subscriber of subscribers) {
    const matchingDeals = deals.filter((deal) => dealMatchesSubscriber(subscriber, deal, sendType));
    if (matchingDeals.length === 0) {
      continue;
    }

    matched.push({
      subscriber,
      deals: matchingDeals.sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.dealPrice - right.dealPrice;
      }),
    });
  }

  return matched;
}

function buildCampaignPreview(
  sendType: CampaignSendType,
  deals: DealSummary[],
  subscribers: AudienceMember[],
): CampaignPreview {
  const matchedRecipients = matchRecipients(sendType, subscribers, deals);
  const topRoutes = unique(deals.map((deal) => deal.routeLabel)).slice(0, 3);

  let blockedReason: string | null = null;
  if (!hasResendEnv()) {
    blockedReason = "Add RESEND_API_KEY and RESEND_FROM_EMAIL before sending live emails.";
  } else if (deals.length === 0) {
    blockedReason =
      sendType === "flash"
        ? "Approve at least one flash deal to unlock this send."
        : "Approve at least one digest deal to unlock this send.";
  } else if (matchedRecipients.length === 0) {
    blockedReason = "No active subscribers match the current routes and filters.";
  }

  return {
    sendType,
    label: sendType === "flash" ? "Flash alerts" : "Daily digest",
    description:
      sendType === "flash"
        ? "Immediate sends for the strongest drops. Weekly-only subscribers stay excluded."
        : "One operational digest to everyone whose route profile matches approved daily deals.",
    approvedDeals: deals.length,
    matchingSubscribers: matchedRecipients.length,
    topRoutes,
    isReady: blockedReason === null,
    blockedReason,
  };
}

function buildIdempotencyKey(sendType: CampaignSendType, subscriberId: string, dealIds: string[]) {
  const digest = createHash("sha1")
    .update(`${sendType}:${subscriberId}:${[...dealIds].sort().join(",")}`)
    .digest("hex");

  return `lux-${sendType}-${digest}`;
}

async function loadApprovedCampaignModel(sendType: CampaignSendType) {
  const supabase = getSupabaseAdminClient();
  const [subscribersQuery, preferencesQuery, routePreferencesQuery, routesQuery, dealsQuery] =
    await Promise.all([
      supabase
        .from("newsletter_subscribers")
        .select(
          "id,email,source,status,created_at,home_airport,onboarding_completed,preference_token",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("subscriber_preferences")
        .select(
          "subscriber_id,preferred_buckets,max_stops_preference,min_trip_nights,max_trip_nights,budget_ceiling_eur,delivery_mode",
        ),
      supabase
        .from("subscriber_route_preferences")
        .select("subscriber_id,destination_airport,destination_city,bucket,is_enabled"),
      supabase
        .from("scanned_routes")
        .select(
          "id,origin_airport,destination_airport,destination_city,bucket,trip_nights,min_trip_nights,max_trip_nights,max_stops,is_active",
        ),
      supabase
        .from("deal_candidates")
        .select(
          "id,route_id,snapshot_id,title,summary,deal_price,baseline_price,drop_ratio,score,send_type,status,created_at",
        )
        .eq("status", "approved")
        .eq("send_type", sendType)
        .order("score", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

  const errors = [
    subscribersQuery.error ? formatError(subscribersQuery.error) : null,
    preferencesQuery.error ? formatError(preferencesQuery.error) : null,
    routePreferencesQuery.error ? formatError(routePreferencesQuery.error) : null,
    routesQuery.error ? formatError(routesQuery.error) : null,
    dealsQuery.error ? formatError(dealsQuery.error) : null,
  ].filter(Boolean) as string[];

  if (errors.length > 0) {
    throw new Error(errors[0]);
  }

  const dealRows = (dealsQuery.data ?? []) as DealRow[];
  const snapshotIds = unique(dealRows.map((deal) => deal.snapshot_id));
  const snapshotsQuery =
    snapshotIds.length === 0
      ? { data: [] as SnapshotRow[], error: null }
      : await supabase
          .from("price_snapshots")
          .select("id,route_id,price,currency,departure_date,return_date,trip_nights,max_stops,metadata,scanned_at")
          .in("id", snapshotIds);

  if (snapshotsQuery.error) {
    throw new Error(formatError(snapshotsQuery.error));
  }

  const subscribers = buildSubscriberSummaries(
    (subscribersQuery.data ?? []) as SubscriberRow[],
    (preferencesQuery.data ?? []) as SubscriberPreferenceRow[],
    (routePreferencesQuery.data ?? []) as SubscriberRoutePreferenceRow[],
  );

  const activeAudience = subscribers.filter(
    (subscriber) => subscriber.status === "active" && subscriber.onboardingCompleted,
  );
  const routeMap = buildRouteMap((routesQuery.data ?? []) as RouteRow[]);
  const snapshotMap = new Map(
    ((snapshotsQuery.data ?? []) as SnapshotRow[]).map((snapshot) => [snapshot.id, snapshot]),
  );
  const deals = enrichDeals(dealRows, routeMap, snapshotMap);

  return {
    subscribers: activeAudience,
    deals,
  };
}

export async function getOpsDashboardData(): Promise<OpsDashboardData> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      configured: false,
      schemaReady: false,
      onboardingMessage:
        "Supabase is not configured yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.",
      metrics: {
        subscribers: 0,
        activeRoutes: 0,
        pendingDeals: 0,
        snapshots24h: 0,
      },
      subscribers: [],
      routes: [],
      pendingDeals: [],
      recentSnapshots: [],
      sendQueue: [],
      recentCampaigns: [],
    };
  }

  const supabase = getSupabaseAdminClient();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    subscriberCount,
    routeCount,
    pendingDealCount,
    snapshotCountQuery,
    subscribersQuery,
    preferencesQuery,
    routePreferencesQuery,
    routesQuery,
    pendingDealsQuery,
    approvedDealsQuery,
    recentSnapshotsQuery,
    recentCampaignsQuery,
  ] = await Promise.all([
    countTable("newsletter_subscribers"),
    countTable("scanned_routes", { column: "is_active", value: true }),
    countTable("deal_candidates", { column: "status", value: "pending_review" }),
    supabase
      .from("price_snapshots")
      .select("*", { count: "exact", head: true })
      .gte("scanned_at", twentyFourHoursAgo),
    supabase
      .from("newsletter_subscribers")
      .select(
        "id,email,source,status,created_at,home_airport,onboarding_completed,preference_token",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("subscriber_preferences")
      .select(
        "subscriber_id,preferred_buckets,max_stops_preference,min_trip_nights,max_trip_nights,budget_ceiling_eur,delivery_mode",
      ),
    supabase
      .from("subscriber_route_preferences")
      .select("subscriber_id,destination_airport,destination_city,bucket,is_enabled"),
    supabase
      .from("scanned_routes")
      .select(
        "id,origin_airport,destination_airport,destination_city,bucket,trip_nights,min_trip_nights,max_trip_nights,max_stops,is_active",
      )
      .order("bucket")
      .order("destination_city"),
    supabase
      .from("deal_candidates")
      .select(
        "id,route_id,snapshot_id,title,summary,deal_price,baseline_price,drop_ratio,score,send_type,status,created_at",
      )
      .eq("status", "pending_review")
      .order("score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("deal_candidates")
      .select(
        "id,route_id,snapshot_id,title,summary,deal_price,baseline_price,drop_ratio,score,send_type,status,created_at",
      )
      .eq("status", "approved")
      .order("score", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("price_snapshots")
      .select("id,route_id,price,currency,departure_date,return_date,trip_nights,max_stops,metadata,scanned_at")
      .order("scanned_at", { ascending: false })
      .limit(10),
    supabase
      .from("email_campaigns")
      .select(
        "id,send_type,subject,status,recipient_count,sent_count,failed_count,route_labels,created_at,sent_at",
      )
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const errors = [
    subscriberCount.error,
    routeCount.error,
    pendingDealCount.error,
    snapshotCountQuery.error ? formatError(snapshotCountQuery.error) : null,
    subscribersQuery.error ? formatError(subscribersQuery.error) : null,
    preferencesQuery.error ? formatError(preferencesQuery.error) : null,
    routePreferencesQuery.error ? formatError(routePreferencesQuery.error) : null,
    routesQuery.error ? formatError(routesQuery.error) : null,
    pendingDealsQuery.error ? formatError(pendingDealsQuery.error) : null,
    approvedDealsQuery.error ? formatError(approvedDealsQuery.error) : null,
    recentSnapshotsQuery.error ? formatError(recentSnapshotsQuery.error) : null,
    recentCampaignsQuery.error ? formatError(recentCampaignsQuery.error) : null,
  ].filter(Boolean) as string[];

  if (errors.length > 0) {
    const message = errors[0];
    return {
      configured: true,
      schemaReady: false,
      onboardingMessage: isMissingTableError(message)
        ? "Supabase is reachable, but the latest tables are not created yet. Re-run supabase/schema.sql and then supabase/seed.sql in the SQL Editor."
        : `Supabase responded with an error: ${message}`,
      metrics: {
        subscribers: 0,
        activeRoutes: 0,
        pendingDeals: 0,
        snapshots24h: 0,
      },
      subscribers: [],
      routes: [],
      pendingDeals: [],
      recentSnapshots: [],
      sendQueue: [],
      recentCampaigns: [],
    };
  }

  const pendingDealRows = (pendingDealsQuery.data ?? []) as DealRow[];
  const approvedDealRows = (approvedDealsQuery.data ?? []) as DealRow[];
  const snapshotIds = unique(
    [...pendingDealRows, ...approvedDealRows].map((deal) => deal.snapshot_id),
  );

  const dealSnapshotsQuery =
    snapshotIds.length === 0
      ? { data: [] as SnapshotRow[], error: null }
      : await supabase
          .from("price_snapshots")
          .select("id,route_id,price,currency,departure_date,return_date,trip_nights,max_stops,metadata,scanned_at")
          .in("id", snapshotIds);

  if (dealSnapshotsQuery.error) {
    const message = formatError(dealSnapshotsQuery.error);
    return {
      configured: true,
      schemaReady: false,
      onboardingMessage: isMissingTableError(message)
        ? "Supabase is reachable, but the latest tables are not created yet. Re-run supabase/schema.sql and then supabase/seed.sql in the SQL Editor."
        : `Supabase responded with an error: ${message}`,
      metrics: {
        subscribers: 0,
        activeRoutes: 0,
        pendingDeals: 0,
        snapshots24h: 0,
      },
      subscribers: [],
      routes: [],
      pendingDeals: [],
      recentSnapshots: [],
      sendQueue: [],
      recentCampaigns: [],
    };
  }

  const routes = (routesQuery.data ?? []) as RouteRow[];
  const routeMap = buildRouteMap(routes);
  const dealSnapshotMap = new Map(
    ((dealSnapshotsQuery.data ?? []) as SnapshotRow[]).map((snapshot) => [snapshot.id, snapshot]),
  );
  const subscriberSummaries = buildSubscriberSummaries(
    (subscribersQuery.data ?? []) as SubscriberRow[],
    (preferencesQuery.data ?? []) as SubscriberPreferenceRow[],
    (routePreferencesQuery.data ?? []) as SubscriberRoutePreferenceRow[],
  );

  const pendingDeals = enrichDeals(pendingDealRows, routeMap, dealSnapshotMap);
  const approvedDeals = enrichDeals(approvedDealRows, routeMap, dealSnapshotMap);

  const activeAudience = subscriberSummaries.filter(
    (subscriber) => subscriber.status === "active" && subscriber.onboardingCompleted,
  );

  const sendQueue = campaignSendTypes.map((sendType) =>
    buildCampaignPreview(
      sendType,
      approvedDeals.filter((deal) => deal.sendType === sendType),
      activeAudience,
    ),
  );

  const recentSnapshots = ((recentSnapshotsQuery.data ?? []) as SnapshotRow[]).map((snapshot) => {
    return enrichSnapshots([snapshot], routeMap)[0];
  });

  const recentCampaigns = ((recentCampaignsQuery.data ?? []) as EmailCampaignRow[]).map(
    (campaign) => ({
      id: campaign.id,
      sendType: campaign.send_type,
      status: campaign.status,
      subject: campaign.subject,
      recipientCount: campaign.recipient_count,
      sentCount: campaign.sent_count,
      failedCount: campaign.failed_count,
      createdAt: campaign.created_at,
      sentAt: campaign.sent_at,
      routeLabels: campaign.route_labels ?? [],
    }),
  );

  return {
    configured: true,
    schemaReady: true,
    onboardingMessage: null,
    metrics: {
      subscribers: subscriberCount.count,
      activeRoutes: routeCount.count,
      pendingDeals: pendingDealCount.count,
      snapshots24h: snapshotCountQuery.count ?? 0,
    },
    subscribers: subscriberSummaries.slice(0, 10).map((subscriber) => ({
      id: subscriber.id,
      email: subscriber.email,
      source: subscriber.source,
      status: subscriber.status,
      createdAt: subscriber.createdAt,
      homeAirport: subscriber.homeAirport,
      onboardingCompleted: subscriber.onboardingCompleted,
      deliveryMode: subscriber.deliveryMode,
      maxStopsPreference: subscriber.maxStopsPreference,
      minTripNights: subscriber.minTripNights,
      maxTripNights: subscriber.maxTripNights,
      budgetCeilingEur: subscriber.budgetCeilingEur,
      preferredBuckets: subscriber.preferredBuckets,
      selectedRouteLabels: subscriber.selectedRouteLabels,
    })),
    routes: routes.map((route) => ({
      id: route.id,
      label: `${route.origin_airport} -> ${route.destination_airport} (${route.destination_city})`,
      bucket: route.bucket,
      tripNights: route.trip_nights,
      minTripNights: route.min_trip_nights,
      maxTripNights: route.max_trip_nights,
      maxStops: route.max_stops,
      isActive: route.is_active,
    })),
    pendingDeals,
    recentSnapshots,
    sendQueue,
    recentCampaigns,
  };
}

export async function getOpsPriceIntelligenceData(): Promise<OpsPriceIntelligenceData> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      configured: false,
      schemaReady: false,
      onboardingMessage:
        "Supabase is not configured yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.",
      scannerNote:
        "The current scanner stores one cheapest itinerary per route and cron run. This board shows that tracked history.",
      totals: {
        routesTracked: 0,
        snapshotsLoaded: 0,
        latestSnapshotAt: null,
        liveLowestPrice: null,
        liveLowestRouteLabel: null,
      },
      series: [],
      tableRows: [],
    };
  }

  const supabase = getSupabaseAdminClient();
  const [routesQuery, snapshotsQuery] = await Promise.all([
    supabase
      .from("scanned_routes")
      .select(
        "id,origin_airport,destination_airport,destination_city,bucket,trip_nights,min_trip_nights,max_trip_nights,max_stops,is_active",
      )
      .eq("is_active", true)
      .order("bucket")
      .order("destination_city"),
    supabase
      .from("price_snapshots")
      .select("id,route_id,price,currency,departure_date,return_date,trip_nights,max_stops,metadata,scanned_at")
      .order("scanned_at", { ascending: false })
      .limit(2000),
  ]);

  const errors = [
    routesQuery.error ? formatError(routesQuery.error) : null,
    snapshotsQuery.error ? formatError(snapshotsQuery.error) : null,
  ].filter(Boolean) as string[];

  if (errors.length > 0) {
    const message = errors[0];
    return {
      configured: true,
      schemaReady: false,
      onboardingMessage: isMissingTableError(message)
        ? "Supabase is reachable, but the latest tables are not created yet. Re-run supabase/schema.sql and then supabase/seed.sql in the SQL Editor."
        : `Supabase responded with an error: ${message}`,
      scannerNote:
        "The current scanner stores one cheapest itinerary per route and cron run. This board shows that tracked history.",
      totals: {
        routesTracked: 0,
        snapshotsLoaded: 0,
        latestSnapshotAt: null,
        liveLowestPrice: null,
        liveLowestRouteLabel: null,
      },
      series: [],
      tableRows: [],
    };
  }

  const routes = (routesQuery.data ?? []) as RouteRow[];
  const routeMap = buildRouteMap(routes);
  const snapshotRows = (snapshotsQuery.data ?? []) as SnapshotRow[];
  const series = buildPriceSeries(snapshotRows, routeMap);
  const tableRows = series
    .flatMap((routeSeries) => routeSeries.points)
    .sort(
      (left, right) =>
        new Date(right.scannedAt).getTime() - new Date(left.scannedAt).getTime(),
    );

  const latestPerRoute = series.filter((routeSeries) => routeSeries.latestPrice !== null);
  const liveLowest = [...latestPerRoute].sort((left, right) => {
    const leftValue = left.latestPrice ?? Number.POSITIVE_INFINITY;
    const rightValue = right.latestPrice ?? Number.POSITIVE_INFINITY;
    return leftValue - rightValue;
  })[0];

  return {
    configured: true,
    schemaReady: true,
    onboardingMessage: null,
    scannerNote:
      "The current scanner stores one cheapest itinerary per active route on each cron run. To see every itinerary option returned by Google Flights, the scanner would need a wider capture mode.",
    totals: {
      routesTracked: series.length,
      snapshotsLoaded: tableRows.length,
      latestSnapshotAt: tableRows[0]?.scannedAt ?? null,
      liveLowestPrice: liveLowest?.latestPrice ?? null,
      liveLowestRouteLabel: liveLowest?.routeLabel ?? null,
    },
    series,
    tableRows,
  };
}

export async function updateDealStatus(input: {
  id: string;
  status: "approved" | "rejected";
}) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("deal_candidates")
    .update({
      status: input.status,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.id);

  if (error) {
    throw new Error(formatError(error));
  }
}

export async function sendApprovedDealCampaign(input: { sendType: CampaignSendType }) {
  if (!hasResendEnv()) {
    throw new Error("Add RESEND_API_KEY and RESEND_FROM_EMAIL before sending live emails.");
  }

  const supabase = getSupabaseAdminClient();
  const { subscribers, deals } = await loadApprovedCampaignModel(input.sendType);

  if (deals.length === 0) {
    throw new Error(
      input.sendType === "flash"
        ? "There are no approved flash deals ready to send."
        : "There are no approved digest deals ready to send.",
    );
  }

  const matchedRecipients = matchRecipients(input.sendType, subscribers, deals);
  if (matchedRecipients.length === 0) {
    throw new Error("No active subscribers match the approved deals and saved route filters.");
  }

  const nowIso = new Date().toISOString();
  const routeLabels = unique(deals.map((deal) => deal.routeLabel)).slice(0, 8);
  const genericSubject =
    input.sendType === "flash" ? "Lux Flight Deals flash alert" : "Lux Flight Deals daily digest";
  const previewText = buildCampaignPreviewText(input.sendType, deals);

  const campaignInsert = await supabase
    .from("email_campaigns")
    .insert({
      send_type: input.sendType,
      subject: genericSubject,
      preview_text: previewText,
      from_email: process.env.RESEND_FROM_EMAIL ?? "",
      reply_to_email: process.env.RESEND_REPLY_TO_EMAIL ?? null,
      recipient_count: matchedRecipients.length,
      sent_count: 0,
      failed_count: 0,
      status: "sending",
      provider: "resend",
      deal_candidate_ids: deals.map((deal) => deal.id),
      route_labels: routeLabels,
      created_at: nowIso,
    })
    .select("id")
    .single();

  if (campaignInsert.error) {
    throw new Error(formatError(campaignInsert.error));
  }

  const campaignId = campaignInsert.data.id;
  const siteUrl = getSiteUrl();
  const results: Array<{
    subscriberId: string;
    email: string;
    subject: string;
    dealIds: string[];
    status: "sent" | "failed";
    providerMessageId: string | null;
    errorMessage: string | null;
    sentAt: string | null;
  }> = [];

  try {
    for (let index = 0; index < matchedRecipients.length; index += 5) {
      const chunk = matchedRecipients.slice(index, index + 5);
      const chunkResults = await Promise.all(
        chunk.map(async ({ subscriber, deals: matchedDeals }) => {
          const subject = buildCampaignSubject(input.sendType, matchedDeals);
          const preview = buildCampaignPreviewText(input.sendType, matchedDeals);
          const rendered = renderCampaignEmail({
            sendType: input.sendType,
            subject,
            previewText: preview,
            managePreferencesUrl: `${siteUrl}/preferences?token=${subscriber.preferenceToken}`,
            deals: matchedDeals.map((deal) => ({
              id: deal.id,
              title: deal.title,
              summary: deal.summary,
              routeLabel: deal.routeLabel,
              destinationCity: deal.destinationCity,
              destinationAirport: deal.destinationAirport,
              dealPrice: deal.dealPrice,
              baselinePrice: deal.baselinePrice,
              dropRatio: deal.dropRatio,
              departureDate: deal.departureDate,
              returnDate: deal.returnDate,
              tripNights: deal.tripNights,
              maxStops: deal.maxStops,
              airlineSummary: deal.airlineSummary,
              bookingUrl: deal.bookingUrl,
            })),
          });

          try {
            const providerMessageId = await sendResendEmail({
              to: subscriber.email,
              subject,
              html: rendered.html,
              text: rendered.text,
              sendType: input.sendType,
              idempotencyKey: buildIdempotencyKey(
                input.sendType,
                subscriber.id,
                matchedDeals.map((deal) => deal.id),
              ),
            });

            return {
              subscriberId: subscriber.id,
              email: subscriber.email,
              subject,
              dealIds: matchedDeals.map((deal) => deal.id),
              status: "sent" as const,
              providerMessageId,
              errorMessage: null,
              sentAt: new Date().toISOString(),
            };
          } catch (error) {
            return {
              subscriberId: subscriber.id,
              email: subscriber.email,
              subject,
              dealIds: matchedDeals.map((deal) => deal.id),
              status: "failed" as const,
              providerMessageId: null,
              errorMessage: error instanceof Error ? error.message : "Email provider request failed.",
              sentAt: null,
            };
          }
        }),
      );

      const deliveryInsert = await supabase.from("email_deliveries").insert(
        chunkResults.map((result) => ({
          campaign_id: campaignId,
          subscriber_id: result.subscriberId,
          email: result.email,
          subject: result.subject,
          deal_candidate_ids: result.dealIds,
          status: result.status,
          provider_message_id: result.providerMessageId,
          error_message: result.errorMessage,
          sent_at: result.sentAt,
        })),
      );

      if (deliveryInsert.error) {
        throw new Error(formatError(deliveryInsert.error));
      }

      results.push(...chunkResults);
    }
  } catch (error) {
    await supabase
      .from("email_campaigns")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Campaign send failed.",
      })
      .eq("id", campaignId);

    throw error;
  }

  const sentCount = results.filter((result) => result.status === "sent").length;
  const failedCount = results.length - sentCount;
  const status =
    sentCount === 0 ? "failed" : failedCount === 0 ? "sent" : "partial";

  const campaignUpdate = await supabase
    .from("email_campaigns")
    .update({
      sent_count: sentCount,
      failed_count: failedCount,
      status,
      sent_at: sentCount > 0 ? new Date().toISOString() : null,
      error_message: failedCount > 0 ? `${failedCount} deliveries failed.` : null,
    })
    .eq("id", campaignId);

  if (campaignUpdate.error) {
    throw new Error(formatError(campaignUpdate.error));
  }

  if (sentCount > 0) {
    const dealUpdate = await supabase
      .from("deal_candidates")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .in(
        "id",
        unique(results.flatMap((result) => (result.status === "sent" ? result.dealIds : []))),
      );

    if (dealUpdate.error) {
      throw new Error(formatError(dealUpdate.error));
    }
  }

  return {
    campaignId,
    recipientCount: matchedRecipients.length,
    sentCount,
    failedCount,
    sendType: input.sendType,
  };
}
