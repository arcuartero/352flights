import "server-only";

import { hasSupabaseAdminEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase";
import {
  generateCreatelloDocument,
  getTikTokCarouselDateRange,
  proposeTikTokOffers,
  resolveTikTokOrigin,
  type TikTokGenerationOptions,
  type TikTokProposalOptions,
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
  max_stops: string;
  scanned_at: string;
  metadata: Record<string, unknown>;
};

const PAGE_SIZE = 1000;

type TikTokSourceOptions = Pick<
  TikTokGenerationOptions,
  "originAirport" | "startMonth" | "slideCount" | "monthCount" | "now"
>;

async function fetchEligibleSnapshots(fromDate: string, toDateExclusive: string) {
  const supabase = getSupabaseAdminClient();
  const rows: SnapshotRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("price_snapshots")
      .select("id,route_id,price,currency,departure_date,return_date,max_stops,scanned_at,metadata")
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

export async function loadTikTokCarouselSource(options: TikTokSourceOptions) {
  if (!hasSupabaseAdminEnv()) {
    return { configured: false, origins: [], offers: [], photoUrls: {} };
  }

  const supabase = getSupabaseAdminClient();
  const dateRange = getTikTokCarouselDateRange(
    options.startMonth,
    options.monthCount ?? options.slideCount,
    options.now,
  );
  const [routesResult, snapshots] = await Promise.all([
    supabase
      .from("scanned_routes")
      .select("id,origin_airport,destination_airport,destination_city")
      .eq("is_active", true),
    fetchEligibleSnapshots(dateRange.fromDate, dateRange.toDateExclusive),
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
      maxStops: snapshot.max_stops,
      scannedAt: snapshot.scanned_at,
      metadata: snapshot.metadata,
    }];
  });
  const activeOrigins = new Set(routes.map((route) => route.origin_airport.toUpperCase()));
  const origins = [...activeOrigins]
    .map(resolveTikTokOrigin)
    .sort((left, right) => left.city.localeCompare(right.city, "es"));

  return { configured: true, origins, offers };
}

export async function loadTikTokOffersByIds(selectedOfferIds: number[]) {
  if (!hasSupabaseAdminEnv()) {
    throw new Error("Supabase no está configurado.");
  }
  if (selectedOfferIds.length < 1 || selectedOfferIds.length > 20) {
    throw new Error("Selecciona entre 1 y 20 ofertas.");
  }

  const supabase = getSupabaseAdminClient();
  const { data: snapshotData, error: snapshotError } = await supabase
    .from("price_snapshots")
    .select("id,route_id,price,currency,departure_date,return_date,max_stops,scanned_at,metadata")
    .in("id", selectedOfferIds)
    .eq("metadata->>public_fare_eligible", "true");
  if (snapshotError) {
    console.error("[creatello-inbox] snapshot_reload_failed", { code: snapshotError.code });
    throw new Error("No se pudieron recargar las ofertas seleccionadas.");
  }

  const snapshots = (snapshotData ?? []) as SnapshotRow[];
  if (snapshots.length !== selectedOfferIds.length) {
    throw new Error("Alguna oferta seleccionada ya no está disponible o no es publicable.");
  }
  const routeIds = [...new Set(snapshots.map((snapshot) => snapshot.route_id))];
  const { data: routeData, error: routeError } = await supabase
    .from("scanned_routes")
    .select("id,origin_airport,destination_airport,destination_city")
    .in("id", routeIds)
    .eq("is_active", true);
  if (routeError) {
    console.error("[creatello-inbox] route_reload_failed", { code: routeError.code });
    throw new Error("No se pudieron verificar las rutas de las ofertas.");
  }

  const routeMap = new Map(((routeData ?? []) as RouteRow[]).map((route) => [route.id, route]));
  const snapshotMap = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  return selectedOfferIds.map((id) => {
    const snapshot = snapshotMap.get(id);
    const route = snapshot ? routeMap.get(snapshot.route_id) : undefined;
    if (!snapshot || !route || !snapshot.return_date) {
      throw new Error(`La oferta ${id} ya no está disponible o no es publicable.`);
    }
    return {
      id: snapshot.id,
      originAirport: route.origin_airport,
      destinationAirport: route.destination_airport,
      destinationCity: route.destination_city,
      departureDate: snapshot.departure_date,
      returnDate: snapshot.return_date,
      price: Number(snapshot.price),
      currency: snapshot.currency,
      maxStops: snapshot.max_stops,
      scannedAt: snapshot.scanned_at,
      metadata: snapshot.metadata,
    } satisfies TikTokSourceOffer;
  });
}

export async function buildCreatelloDocument(options: TikTokGenerationOptions) {
  const source = await loadTikTokCarouselSource(options);
  if (!source.configured) {
    throw new Error("Supabase no está configurado.");
  }
  return {
    ...generateCreatelloDocument(source.offers, options),
    origins: source.origins,
  };
}

export async function buildTikTokOfferProposal(options: TikTokProposalOptions) {
  const source = await loadTikTokCarouselSource({
    originAirport: options.originAirport,
    startMonth: options.startMonth,
    slideCount: options.monthCount,
    monthCount: options.monthCount,
    now: options.now,
  });
  if (!source.configured) {
    throw new Error("Supabase no está configurado.");
  }
  return {
    offers: proposeTikTokOffers(source.offers, options),
    origins: source.origins,
  };
}
