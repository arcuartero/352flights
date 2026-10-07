import "server-only";
import { cache } from "react";
import { unstable_cache, unstable_noStore as noStore } from "next/cache";
import {
  freshPublicFares,
  publicFareSnapshotIds,
  publicFaresAreCurrent,
} from "@/lib/public-fare-validity";
import { matchesDestinationSlug } from "@/lib/destination-slugs";
import {
  getDestinationFaresCacheTag,
  HOME_FARES_CACHE_TAG,
  SEARCH_FARES_CACHE_TAG,
} from "@/lib/public-fare-cache";
import { getSupabaseAdminClient } from "@/lib/supabase";
import {
  PUBLIC_ALL_FARES_PER_DESTINATION,
  PUBLIC_FARES_PER_DESTINATION,
  PUBLIC_FARE_LOOKBACK_DAYS,
  PUBLIC_FARE_REVALIDATION_ENABLED,
  PUBLIC_SEARCH_FARES_PER_DESTINATION,
  PUBLIC_SNAPSHOT_SOURCE,
  buildRouteMap,
  fetchPagedSnapshots,
  formatError,
  isMissingTableError,
  readSupabaseWithRetry,
} from "@/lib/ops/shared";
import {
  type PublicDealsPageData,
  type RouteRow,
  type SnapshotRow,
} from "@/lib/ops/types";
import {
  buildPublicDealsSections,
  buildPublicFaresFromSnapshots,
  getLuxDateKey,
} from "@/lib/ops/public-fares";

export let lastSuccessfulPublicDealsPageData: PublicDealsPageData | null = null;

export const lastSuccessfulPublicCityDealsPageData = new Map<
  string,
  PublicDealsPageData
>();

export function emptyPublicDealsPageData(input?: {
  configured?: boolean;
  schemaReady?: boolean;
  onboardingMessage?: string | null;
}): PublicDealsPageData {
  return {
    configured: input?.configured ?? true,
    schemaReady: input?.schemaReady ?? false,
    onboardingMessage: input?.onboardingMessage ?? null,
    deals: [],
    sections: [],
    updatedAt: null,
  };
}

export function buildPublicDealsPageData(
  routes: RouteRow[],
  snapshots: SnapshotRow[],
  options?: {
    maxFaresPerDestination?: number | null;
    balanceByMonth?: boolean;
    includeSections?: boolean;
  },
): PublicDealsPageData {
  const deals = buildPublicFaresFromSnapshots(
    snapshots,
    buildRouteMap(routes),
    {
      maxFaresPerDestination: options?.maxFaresPerDestination,
      balanceByMonth: options?.balanceByMonth,
    },
  );
  const updatedAt = deals.reduce<string | null>((latest, deal) => {
    if (!deal.verifiedAt) return latest;
    if (!latest) return deal.verifiedAt;
    return new Date(deal.verifiedAt).getTime() > new Date(latest).getTime()
      ? deal.verifiedAt
      : latest;
  }, null);

  return {
    configured: true,
    schemaReady: true,
    onboardingMessage: null,
    deals,
    sections:
      options?.includeSections === false ? [] : buildPublicDealsSections(deals),
    updatedAt,
  };
}

export async function getPublicDealsPageDataUncached(): Promise<PublicDealsPageData> {
  return getPublicDealsBoardDataUncached({
    maxFaresPerDestination: PUBLIC_FARES_PER_DESTINATION,
  });
}

export async function getPublicSearchDealsPageDataUncached(): Promise<PublicDealsPageData> {
  return getPublicDealsBoardDataUncached({
    maxFaresPerDestination: PUBLIC_SEARCH_FARES_PER_DESTINATION,
    balanceByMonth: true,
    includeSections: false,
  });
}

export async function getPublicDealsBoardDataUncached(options: {
  maxFaresPerDestination: number | null;
  balanceByMonth?: boolean;
  includeSections?: boolean;
}): Promise<PublicDealsPageData> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      configured: false,
      schemaReady: false,
      onboardingMessage:
        "Supabase is not configured yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.",
      deals: [],
      sections: [],
      updatedAt: null,
    };
  }

  const supabase = getSupabaseAdminClient();
  const cutoffIso = new Date(
    Date.now() - PUBLIC_FARE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const todayKey =
    getLuxDateKey(new Date()) ?? new Date().toISOString().slice(0, 10);
  const [routesQuery, publicSnapshotsQuery] = await Promise.all([
    readSupabaseWithRetry<RouteRow[]>(() =>
      supabase
        .from("scanned_routes")
        .select(
          "id,origin_airport,destination_airport,destination_city,bucket,trip_nights,min_trip_nights,max_trip_nights,max_stops,is_active",
        )
        .eq("is_active", true),
    ),
    fetchPagedSnapshots<SnapshotRow>((from, to) =>
      supabase
        .from(PUBLIC_SNAPSHOT_SOURCE)
        .select(
          "id,route_id,price,currency,departure_date,return_date,trip_nights,max_stops,metadata,scanned_at",
        )
        .gte("scanned_at", cutoffIso)
        .gte("departure_date", todayKey)
        .eq("metadata->>public_fare_eligible", "true")
        .order("scanned_at", { ascending: false })
        .range(from, to),
    ),
  ]);

  const errors = [
    routesQuery.error ? formatError(routesQuery.error) : null,
    publicSnapshotsQuery.error ? formatError(publicSnapshotsQuery.error) : null,
  ].filter(Boolean) as string[];

  if (errors.length > 0) {
    const message = errors[0];
    if (!isMissingTableError(message)) {
      throw new Error(`Public fare data could not be loaded: ${message}`);
    }
    return {
      configured: true,
      schemaReady: false,
      onboardingMessage:
        "Supabase is reachable, but the latest tables are not created yet. Re-run supabase/schema.sql and then supabase/seed.sql in the SQL Editor.",
      deals: [],
      sections: [],
      updatedAt: null,
    };
  }

  return buildPublicDealsPageData(
    (routesQuery.data ?? []) as RouteRow[],
    (publicSnapshotsQuery.data ?? []) as SnapshotRow[],
    {
      maxFaresPerDestination: options.maxFaresPerDestination,
      balanceByMonth: options.balanceByMonth,
      includeSections: options.includeSections,
    },
  );
}

export async function getPublicCityDealsPageDataUncached(
  citySlug: string,
): Promise<PublicDealsPageData> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return emptyPublicDealsPageData({
      configured: false,
      onboardingMessage:
        "Supabase is not configured yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.",
    });
  }

  const supabase = getSupabaseAdminClient();
  const routesQuery = await readSupabaseWithRetry<RouteRow[]>(() =>
    supabase
      .from("scanned_routes")
      .select(
        "id,origin_airport,destination_airport,destination_city,bucket,trip_nights,min_trip_nights,max_trip_nights,max_stops,is_active",
      )
      .eq("is_active", true),
  );

  if (routesQuery.error) {
    const message = formatError(routesQuery.error);
    if (!isMissingTableError(message)) {
      throw new Error(`City fare routes could not be loaded: ${message}`);
    }
    return emptyPublicDealsPageData({
      schemaReady: false,
      onboardingMessage:
        "Supabase is reachable, but the latest tables are not created yet. Re-run supabase/schema.sql and then supabase/seed.sql in the SQL Editor.",
    });
  }

  const routes = ((routesQuery.data ?? []) as RouteRow[]).filter((route) =>
    matchesDestinationSlug(route.destination_city, citySlug),
  );
  if (routes.length === 0) {
    return buildPublicDealsPageData([], [], {
      maxFaresPerDestination: PUBLIC_ALL_FARES_PER_DESTINATION,
    });
  }

  const cutoffIso = new Date(
    Date.now() - PUBLIC_FARE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const todayKey =
    getLuxDateKey(new Date()) ?? new Date().toISOString().slice(0, 10);
  const routeIds = routes.map((route) => route.id);
  const snapshotsQuery = await fetchPagedSnapshots<SnapshotRow>((from, to) =>
    supabase
      .from(PUBLIC_SNAPSHOT_SOURCE)
      .select(
        "id,route_id,price,currency,departure_date,return_date,trip_nights,max_stops,metadata,scanned_at",
      )
      .in("route_id", routeIds)
      .gte("scanned_at", cutoffIso)
      .gte("departure_date", todayKey)
      .eq("metadata->>public_fare_eligible", "true")
      .order("scanned_at", { ascending: false })
      .range(from, to),
  );

  if (snapshotsQuery.error) {
    throw new Error(
      `City fare snapshots could not be loaded: ${formatError(snapshotsQuery.error)}`,
    );
  }

  return buildPublicDealsPageData(
    routes,
    (snapshotsQuery.data ?? []) as SnapshotRow[],
    {
      maxFaresPerDestination: PUBLIC_ALL_FARES_PER_DESTINATION,
      includeSections: false,
    },
  );
}

export function pruneExpiredPublicFares(
  data: PublicDealsPageData,
): PublicDealsPageData {
  const deals = freshPublicFares(data.deals);
  return {
    ...data,
    deals,
    sections: data.sections.length ? buildPublicDealsSections(deals) : [],
    updatedAt: deals.reduce<string | null>(
      (latest, deal) =>
        deal.verifiedAt && (!latest || deal.verifiedAt > latest)
          ? deal.verifiedAt
          : latest,
      null,
    ),
  };
}

export async function validatePublicFareCache(
  cached: PublicDealsPageData,
  reload: () => Promise<PublicDealsPageData>,
): Promise<PublicDealsPageData> {
  const data = pruneExpiredPublicFares(cached);
  if (
    !PUBLIC_FARE_REVALIDATION_ENABLED ||
    !data.configured ||
    !data.schemaReady
  )
    return data;
  const ids = publicFareSnapshotIds(data.deals);
  const activeIds: string[] = [];
  const supabase = getSupabaseAdminClient();
  // These reads intentionally sit outside unstable_cache. Never return old prices
  // when the authoritative state cannot be read.
  for (let index = 0; index < ids.length; index += 200) {
    const { data: rows, error } = await supabase
      .from("public_current_fare_snapshots")
      .select("id")
      .in("id", ids.slice(index, index + 200));
    if (error)
      throw new Error(`Public fare validity could not be read: ${error.code}`);
    activeIds.push(...(rows ?? []).map((row) => String(row.id)));
  }
  if (
    !publicFaresAreCurrent(data.deals, activeIds) ||
    data.deals.length !== cached.deals.length
  ) {
    return pruneExpiredPublicFares(await reload());
  }
  return data;
}

export const getCachedPublicDealsPageData = unstable_cache(
  getPublicDealsPageDataUncached,
  ["public-deals-page-data-v4", PUBLIC_SNAPSHOT_SOURCE],
  {
    revalidate: 3600,
    tags: [HOME_FARES_CACHE_TAG],
  },
);

export const getCachedPublicSearchDealsPageData = unstable_cache(
  getPublicSearchDealsPageDataUncached,
  ["public-search-deals-page-data-v4", PUBLIC_SNAPSHOT_SOURCE],
  {
    revalidate: 1800,
    tags: [SEARCH_FARES_CACHE_TAG],
  },
);

export const getPublicDealsPageData = cache(
  async function getPublicDealsPageData(): Promise<PublicDealsPageData> {
    if (PUBLIC_FARE_REVALIDATION_ENABLED) noStore();
    try {
      const data = await validatePublicFareCache(
        await getCachedPublicDealsPageData(),
        getPublicDealsPageDataUncached,
      );
      if (data.configured && data.schemaReady) {
        lastSuccessfulPublicDealsPageData = data;
      }
      return data;
    } catch (error) {
      console.error(
        "[public-fares] Supabase read failed after retries.",
        error,
      );
      if (
        !PUBLIC_FARE_REVALIDATION_ENABLED &&
        lastSuccessfulPublicDealsPageData
      ) {
        return pruneExpiredPublicFares(lastSuccessfulPublicDealsPageData);
      }

      return {
        configured: true,
        schemaReady: false,
        onboardingMessage: null,
        deals: [],
        sections: [],
        updatedAt: null,
      };
    }
  },
);

export let lastSuccessfulPublicSearchDealsPageData: PublicDealsPageData | null =
  null;

export const getPublicSearchDealsPageData = cache(
  async function getPublicSearchDealsPageData(): Promise<PublicDealsPageData> {
    if (PUBLIC_FARE_REVALIDATION_ENABLED) noStore();
    try {
      const data = await validatePublicFareCache(
        await getCachedPublicSearchDealsPageData(),
        getPublicSearchDealsPageDataUncached,
      );
      if (data.configured && data.schemaReady) {
        lastSuccessfulPublicSearchDealsPageData = data;
      }
      return data;
    } catch (error) {
      console.error(
        "[public-search-fares] Supabase read failed after retries.",
        error,
      );
      if (
        !PUBLIC_FARE_REVALIDATION_ENABLED &&
        lastSuccessfulPublicSearchDealsPageData
      ) {
        return pruneExpiredPublicFares(lastSuccessfulPublicSearchDealsPageData);
      }

      return {
        configured: true,
        schemaReady: false,
        onboardingMessage: null,
        deals: [],
        sections: [],
        updatedAt: null,
      };
    }
  },
);

export const getPublicCityDealsPageData = cache(
  async function getPublicCityDealsPageData(
    citySlug: string,
    options?: { strict?: boolean },
  ): Promise<PublicDealsPageData> {
    if (PUBLIC_FARE_REVALIDATION_ENABLED) noStore();
    const normalizedSlug = citySlug.trim().toLowerCase();
    const getCachedCityData = unstable_cache(
      () => getPublicCityDealsPageDataUncached(normalizedSlug),
      [
        "public-city-deals-page-data-v4",
        PUBLIC_SNAPSHOT_SOURCE,
        normalizedSlug,
      ],
      {
        revalidate: 1800,
        tags: [getDestinationFaresCacheTag(normalizedSlug)],
      },
    );

    try {
      const data = await validatePublicFareCache(
        await getCachedCityData(),
        () => getPublicCityDealsPageDataUncached(normalizedSlug),
      );
      if (options?.strict && (!data.configured || !data.schemaReady)) {
        throw new Error("Public fares are not available for validation");
      }
      if (data.configured && data.schemaReady) {
        lastSuccessfulPublicCityDealsPageData.set(normalizedSlug, data);
      }
      return data;
    } catch (error) {
      if (options?.strict) throw error;
      console.error(
        `[public-city-fares:${normalizedSlug}] Supabase read failed after retries.`,
        error,
      );
      return pruneExpiredPublicFares(
        (!PUBLIC_FARE_REVALIDATION_ENABLED &&
          lastSuccessfulPublicCityDealsPageData.get(normalizedSlug)) ||
          emptyPublicDealsPageData(),
      );
    }
  },
);
