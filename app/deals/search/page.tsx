import { PublicDealsExplorer } from "@/components/public-deals-explorer";
import { getDealsSearchMetadata } from "@/lib/deals-seo";
import { getDestinationPhotoUrlMap } from "@/lib/destination-photo-storage";
import { getLocalizedDealsSearchPath } from "@/lib/locales";
import { getPublicSearchDealsPageData } from "@/lib/ops";
import {
  buildPublicDealsSearchResult,
  PUBLIC_DEALS_SEARCH_PAGE_SIZE,
} from "@/lib/public-deals-query";
import { parseDealSearchFilters, parseDealSearchSort } from "@/lib/public-deals-search";
import { getRequestLocale } from "@/lib/request-locale";

export const revalidate = 1800;

export const metadata = getDealsSearchMetadata("en");

type DealsSearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DealsSearchPage({ searchParams }: DealsSearchPageProps) {
  const [fullData, destinationPhotoUrls, resolvedSearchParams, locale] = await Promise.all([
    getPublicSearchDealsPageData(),
    getDestinationPhotoUrlMap(),
    searchParams,
    getRequestLocale(),
  ]);
  const initialFilters = parseDealSearchFilters(resolvedSearchParams);
  const initialSort = parseDealSearchSort(resolvedSearchParams);
  const initialSearchResult = buildPublicDealsSearchResult(
    fullData,
    initialFilters,
    initialSort,
    PUBLIC_DEALS_SEARCH_PAGE_SIZE,
  );
  const data = {
    configured: initialSearchResult.configured,
    schemaReady: initialSearchResult.schemaReady,
    onboardingMessage: initialSearchResult.onboardingMessage,
    deals: initialSearchResult.deals,
    sections: [],
    updatedAt: initialSearchResult.updatedAt,
  };

  return (
    <main className="page-shell page-shell--deals-search">
      <PublicDealsExplorer
        data={data}
        destinationPhotoUrls={destinationPhotoUrls}
        initialFilters={initialFilters}
        initialSearchResult={initialSearchResult}
        initialSort={initialSort}
        mode="results"
        searchPathname={getLocalizedDealsSearchPath(locale)}
      />
    </main>
  );
}
