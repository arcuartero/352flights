import "server-only";

import { getDestinationPhotoUrlMap } from "@/lib/destination-photo-storage";
import { hasSupabaseAdminEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase";
import {
  generateTikTokCarousel,
  getTikTokCarouselDateRange,
  resolveTikTokOrigin,
  type TikTokGenerationOptions,
  type TikTokSourceOffer,
} from "@/lib/tiktok-carousel";

type RouteRow = {
  id: string;
  origin_airport: string;
  destination_airport: string;
  destination_city: string;
};

type SnapshotRow = {
  id: number;
  route_id: string;
  price: number;
  currency: string;
  departure_date: string;
  return_date: string | null;
  scanned_at: string;
};

const PAGE_SIZE = 1000;

async function fetchEligibleSnapshots(fromDate: string, toDateExclusive: string) {
  const supabase = getSupabaseAdminClient();
  const rows: SnapshotRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("price_snapshots")
      .select("id,route_id,price,currency,departure_date,return_date,scanned_at")
      .eq("metadata->>public_fare_eligible", "true")
      .gte("departure_date", fromDate)
      .lt("departure_date", toDateExclusive)
      .order("scanned_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as SnapshotRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function loadTikTokCarouselSource(options: TikTokGenerationOptions) {
  if (!hasSupabaseAdminEnv()) {
    return { configured: false, origins: [], offers: [], photoUrls: {} };
  }

  const supabase = getSupabaseAdminClient();
  const dateRange = getTikTokCarouselDateRange(
    options.startMonth,
    options.slideCount,
    options.now,
  );
  const [routesResult, snapshots, photoUrls] = await Promise.all([
    supabase
      .from("scanned_routes")
      .select("id,origin_airport,destination_airport,destination_city")
      .eq("is_active", true),
    fetchEligibleSnapshots(dateRange.fromDate, dateRange.toDateExclusive),
    getDestinationPhotoUrlMap(),
  ]);
  if (routesResult.error) throw routesResult.error;

  const routes = (routesResult.data ?? []) as RouteRow[];
  const routeMap = new Map(routes.map((route) => [route.id, route]));
  const offers: TikTokSourceOffer[] = snapshots.flatMap((snapshot) => {
    const route = routeMap.get(snapshot.route_id);
    if (!route || !snapshot.return_date) return [];
    return [{
      id: snapshot.id,
      originAirport: route.origin_airport,
      destinationAirport: route.destination_airport,
      destinationCity: route.destination_city,
      departureDate: snapshot.departure_date,
      returnDate: snapshot.return_date,
      price: Number(snapshot.price),
      currency: snapshot.currency,
      scannedAt: snapshot.scanned_at,
    }];
  });
  const activeOrigins = new Set(routes.map((route) => route.origin_airport.toUpperCase()));
  const origins = [...activeOrigins]
    .map(resolveTikTokOrigin)
    .sort((left, right) => left.city.localeCompare(right.city, "es"));

  return { configured: true, origins, offers, photoUrls };
}

export async function buildTikTokCarousel(options: TikTokGenerationOptions) {
  const source = await loadTikTokCarouselSource(options);
  if (!source.configured) {
    throw new Error("Supabase no está configurado.");
  }
  return {
    ...generateTikTokCarousel(source.offers, source.photoUrls, options),
    origins: source.origins,
  };
}
