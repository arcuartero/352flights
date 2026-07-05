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

function formatCitySlug(citySlug: string) {
  return citySlug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

  const cityName = cityDeals[0]?.destinationCity ?? formatCitySlug(citySlug);

  return (
    <main className="page-shell page-shell--deals-city">
      <PublicDealsExplorer
        data={data}
        initialFilters={parseDealSearchFilters(resolvedSearchParams)}
        initialSort={parseDealSearchSort(resolvedSearchParams)}
        lockedDestinationCity={cityName}
        mode="city"
        searchPathname={`/deals/${encodeURIComponent(citySlug)}`}
      />
    </main>
  );
}
