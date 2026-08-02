import "server-only";

import { matchesDestinationSlug } from "@/lib/destination-slugs";
import type { MonthlyPriceAverageData } from "@/lib/monthly-price-shared";
import type { TripFilter } from "@/lib/public-deals-search";
import { getSupabaseAdminClient } from "@/lib/supabase";

type MonthlyRouteRow = {
  id: string;
  origin_airport: string;
  destination_airport: string;
  destination_city: string;
  is_active: boolean;
};

type MonthlySnapshotRow = {
  route_id: string;
  scanned_at: string;
  departure_date: string;
  return_date: string | null;
  trip_nights: number;
  max_stops: string;
  price: number;
  currency: string;
};

const PAGE_SIZE = 1000;
const MONTH_COUNT = 12;

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function addUtcMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function matchesTripType(nights: number, tripType: TripFilter) {
  switch (tripType) {
    case "weekend":
      return nights <= 4;
    case "weeklong":
      return nights >= 5 && nights <= 7;
    case "long_stay":
      return nights > 4;
    case "any":
    default:
      return true;
  }
}

function roundAverage(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

async function fetchSnapshots(routeIds: string[], fromDate: string, toDate: string) {
  const supabase = getSupabaseAdminClient();
  const rows: MonthlySnapshotRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("price_snapshots")
      .select(
        "route_id,scanned_at,departure_date,return_date,trip_nights,max_stops,price,currency",
      )
      .in("route_id", routeIds)
      .gte("departure_date", fromDate)
      .lt("departure_date", toDate)
      .order("scanned_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const page = (data ?? []) as MonthlySnapshotRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

export async function getMonthlyPriceAverages(input: {
  originAirport: string;
  destinationSlug: string;
  directOnly: boolean;
  tripType: TripFilter;
}): Promise<MonthlyPriceAverageData> {
  const originAirport = input.originAirport.trim().toUpperCase();
  const supabase = getSupabaseAdminClient();
  const { data: routeData, error: routeError } = await supabase
    .from("scanned_routes")
    .select("id,origin_airport,destination_airport,destination_city,is_active")
    .eq("origin_airport", originAirport)
    .eq("is_active", true);

  if (routeError) {
    throw new Error(routeError.message);
  }

  const routes = ((routeData ?? []) as MonthlyRouteRow[]).filter((route) =>
    matchesDestinationSlug(route.destination_city, input.destinationSlug),
  );
  const destinationCity = routes[0]?.destination_city ?? input.destinationSlug;
  const start = new Date();
  const firstMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const endMonth = addUtcMonths(firstMonth, MONTH_COUNT);
  const monthKeys = Array.from({ length: MONTH_COUNT }, (_, index) =>
    monthKey(addUtcMonths(firstMonth, index)),
  );

  if (routes.length === 0) {
    return {
      originAirport,
      destinationCity,
      directOnly: input.directOnly,
      tripType: input.tripType,
      currency: "EUR",
      annualAverage: null,
      cheapestMonth: null,
      totalSamples: 0,
      months: monthKeys.map((month) => ({ month, averagePrice: null, sampleCount: 0 })),
    };
  }

  const routeById = new Map(routes.map((route) => [route.id, route]));
  const snapshots = await fetchSnapshots(
    routes.map((route) => route.id),
    firstMonth.toISOString().slice(0, 10),
    endMonth.toISOString().slice(0, 10),
  );
  const latestByItinerary = new Map<string, MonthlySnapshotRow>();

  for (const snapshot of snapshots) {
    if (
      snapshot.price <= 0 ||
      (input.directOnly && snapshot.max_stops !== "NON_STOP") ||
      !matchesTripType(snapshot.trip_nights, input.tripType)
    ) {
      continue;
    }

    const route = routeById.get(snapshot.route_id);
    if (!route) {
      continue;
    }

    const itineraryKey = [
      route.destination_airport,
      snapshot.departure_date,
      snapshot.return_date ?? "",
      snapshot.trip_nights,
      snapshot.max_stops,
    ].join(":");

    if (!latestByItinerary.has(itineraryKey)) {
      latestByItinerary.set(itineraryKey, snapshot);
    }
  }

  const pricesByMonth = new Map<string, number[]>();
  for (const snapshot of latestByItinerary.values()) {
    const key = snapshot.departure_date.slice(0, 7);
    const prices = pricesByMonth.get(key) ?? [];
    prices.push(Number(snapshot.price));
    pricesByMonth.set(key, prices);
  }

  const months = monthKeys.map((month) => {
    const prices = pricesByMonth.get(month) ?? [];
    return {
      month,
      averagePrice: roundAverage(prices),
      sampleCount: prices.length,
    };
  });
  const populatedMonths = months.filter(
    (item): item is typeof item & { averagePrice: number } => item.averagePrice !== null,
  );
  const cheapestMonth = populatedMonths.reduce<(typeof populatedMonths)[number] | null>(
    (cheapest, item) =>
      cheapest === null || item.averagePrice < cheapest.averagePrice ? item : cheapest,
    null,
  );
  const allPrices = [...latestByItinerary.values()].map((snapshot) => Number(snapshot.price));

  return {
    originAirport,
    destinationCity,
    directOnly: input.directOnly,
    tripType: input.tripType,
    currency: snapshots[0]?.currency ?? "EUR",
    annualAverage: roundAverage(allPrices),
    cheapestMonth: cheapestMonth?.month ?? null,
    totalSamples: allPrices.length,
    months,
  };
}
