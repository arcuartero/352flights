import { redirect } from "next/navigation";

import { PublicDealsExplorer } from "@/components/public-deals-explorer";
import { matchesDestinationSlug } from "@/lib/destination-slugs";
import { getPublicDealsPageData } from "@/lib/ops";
import { parseDealSearchFilters, parseDealSearchSort } from "@/lib/public-deals-search";

type DealsCityPageProps = {
  params: Promise<{
    city: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function buildSearchRedirectHref(
  citySlug: string,
  searchParams: Record<string, string | string[] | undefined>,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
      continue;
    }

    if (typeof value === "string") {
      params.set(key, value);
    }
  }

  params.set("destination", citySlug);
  return `/deals/search?${params.toString()}`;
}

export default async function DealsCityPage({ params, searchParams }: DealsCityPageProps) {
  const [data, resolvedParams, resolvedSearchParams] = await Promise.all([
    getPublicDealsPageData(),
    params,
    searchParams,
  ]);
  const citySlug = decodeURIComponent(resolvedParams.city);
  const cityDeals = data.deals
    .filter((deal) => matchesDestinationSlug(deal.destinationCity, citySlug))
    .sort((left, right) => {
      if (left.dealPrice !== right.dealPrice) {
        return left.dealPrice - right.dealPrice;
      }

      return right.score - left.score;
  });

  if (cityDeals.length === 0) {
    redirect(buildSearchRedirectHref(citySlug, resolvedSearchParams));
  }

  return (
    <main className="page-shell page-shell--deals-city">
      <PublicDealsExplorer
        data={data}
        initialFilters={parseDealSearchFilters(resolvedSearchParams)}
        initialSort={parseDealSearchSort(resolvedSearchParams)}
        lockedDestinationCity={cityDeals[0]?.destinationCity ?? "Destination"}
        mode="city"
        searchPathname={`/deals/${encodeURIComponent(citySlug)}`}
      />
    </main>
  );
}
