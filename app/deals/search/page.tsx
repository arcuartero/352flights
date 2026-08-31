import { PublicDealsExplorer } from "@/components/public-deals-explorer";
import { getDealsSearchMetadata } from "@/lib/deals-seo";
import { getDestinationPhotoUrlMap } from "@/lib/destination-photo-storage";
import { getLocalizedDealsSearchPath } from "@/lib/locales";
import { getPublicSearchDealsPageData } from "@/lib/ops";
import { parseDealSearchFilters, parseDealSearchSort } from "@/lib/public-deals-search";
import { getRequestLocale } from "@/lib/request-locale";

export const revalidate = 300;

export const metadata = getDealsSearchMetadata("en");

type DealsSearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DealsSearchPage({ searchParams }: DealsSearchPageProps) {
  const [data, destinationPhotoUrls, resolvedSearchParams, locale] = await Promise.all([
    getPublicSearchDealsPageData(),
    getDestinationPhotoUrlMap(),
    searchParams,
    getRequestLocale(),
  ]);

  return (
    <main className="page-shell page-shell--deals-search">
      <PublicDealsExplorer
        data={data}
        destinationPhotoUrls={destinationPhotoUrls}
        initialFilters={parseDealSearchFilters(resolvedSearchParams)}
        initialSort={parseDealSearchSort(resolvedSearchParams)}
        mode="results"
        searchPathname={getLocalizedDealsSearchPath(locale)}
      />
    </main>
  );
}
