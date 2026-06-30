import routes from "@/data/lux-routes.json";
import { deriveSupportedStayBuckets } from "@/lib/stay-buckets";

export type SeedRoute = (typeof routes)[number];

export const sampleDeals = [
  {
    destination: "Lisbon",
    airport: "LIS",
    price: "EUR 118",
    baseline: "EUR 176",
    drop: "33%",
    timing: "May, 5 nights",
    bucket: "Weekend Europe",
  },
  {
    destination: "Rome",
    airport: "FCO",
    price: "EUR 96",
    baseline: "EUR 142",
    drop: "32%",
    timing: "April, long weekend",
    bucket: "City break",
  },
  {
    destination: "New York",
    airport: "JFK",
    price: "EUR 389",
    baseline: "EUR 561",
    drop: "31%",
    timing: "September, 7 nights",
    bucket: "Long stay",
  },
];

export const workflowSteps = [
  {
    title: "Scan flexible dates from LUX",
    body: "The scanner maps live departure dates from Luxembourg, then prices the stay patterns that matter for each route.",
  },
  {
    title: "Score against recent history",
    body: "Every cheapest fare is stored as a snapshot. When the fresh price lands below the recent median, it becomes a pending deal candidate.",
  },
  {
    title: "Ship one clean email",
    body: "Editors approve the strongest fares and turn them into a daily digest or flash alert for Luxembourg subscribers.",
  },
];

export const routeBuckets = [
  {
    key: "weekend",
    label: "Weekend",
    detail: "Trips of 2 to 4 nights built around the weekend from Luxembourg.",
  },
  {
    key: "long_stay",
    label: "Long stay",
    detail: "Trips above 4 nights, usually stretching from one weekend into the next.",
  },
];

export const highlightedRoutes = Array.from(
  routes.reduce((map, route) => {
    const key = `${route.destination_airport}:${route.max_stops}`;
    const supportedBuckets = deriveSupportedStayBuckets({
      tripNights: route.trip_nights,
      minTripNights: route.min_trip_nights ?? null,
      maxTripNights: route.max_trip_nights ?? null,
    });
    const existing = map.get(key);

    if (existing) {
      existing.min_trip_nights =
        existing.min_trip_nights == null || route.min_trip_nights == null
          ? existing.min_trip_nights ?? route.min_trip_nights
          : Math.min(existing.min_trip_nights, route.min_trip_nights);
      existing.max_trip_nights =
        existing.max_trip_nights == null || route.max_trip_nights == null
          ? existing.max_trip_nights ?? route.max_trip_nights
          : Math.max(existing.max_trip_nights, route.max_trip_nights);
      existing.supportedBuckets = Array.from(
        new Set([...existing.supportedBuckets, ...supportedBuckets]),
      );
      return map;
    }

    map.set(key, {
      ...route,
      supportedBuckets,
    });
    return map;
  }, new Map<string, SeedRoute & { supportedBuckets: string[] }>()),
).map(([, route]) => route);
