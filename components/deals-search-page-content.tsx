import { PublicDealsExplorer } from "@/components/public-deals/explorer";
import { getDestinationPhotoUrlMap } from "@/lib/destination-photo-storage";
import { getLocalizedDealsSearchPath, type Locale } from "@/lib/locales";
import { getPublicSearchDealsPageData } from "@/lib/ops/public-data";
import {
  buildPublicDealsSearchResult,
  PUBLIC_DEALS_SEARCH_PAGE_SIZE,
} from "@/lib/public-deals-query";
import {
  parseDealSearchFilters,
  parseDealSearchSort,
} from "@/lib/public-deals-search";
type DealsSearchPageContentProps = {
  locale: Locale;
};

export async function DealsSearchPageContent({
  locale,
}: DealsSearchPageContentProps) {
  const [fullData, destinationPhotoUrls] = await Promise.all([
    getPublicSearchDealsPageData(),
    getDestinationPhotoUrlMap(),
  ]);
  const initialFilters = parseDealSearchFilters({});
  const initialSort = parseDealSearchSort({});
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
