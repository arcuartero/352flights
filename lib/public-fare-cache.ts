import "server-only";

import { revalidateTag } from "next/cache";

import { toDestinationSlug } from "@/lib/destination-slugs";

export const HOME_FARES_CACHE_TAG = "public-home-fares";
export const SEARCH_FARES_CACHE_TAG = "public-search-fares";

export function getDestinationFaresCacheTag(city: string) {
  return `public-destination-fares:${toDestinationSlug(city)}`;
}

export function revalidateDestinationFares(cities: string[]) {
  const slugs = [...new Set(cities.map(toDestinationSlug).filter(Boolean))];
  for (const slug of slugs) {
    revalidateTag(getDestinationFaresCacheTag(slug));
  }
  return slugs;
}
