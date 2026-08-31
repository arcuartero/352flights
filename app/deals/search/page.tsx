import type { Metadata } from "next";

import { PublicDealsExplorer } from "@/components/public-deals-explorer";
import { getDestinationPhotoUrlMap } from "@/lib/destination-photo-storage";
import { getPublicSearchDealsPageData } from "@/lib/ops";
import { parseDealSearchFilters, parseDealSearchSort } from "@/lib/public-deals-search";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Search results",
  description:
    "A live shortlist balancing price, timing, directness, and travel shape.",
  alternates: {
    canonical: "/deals/search",
  },
  robots: {
    index: false,
    follow: true,
  },
};

type DealsSearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DealsSearchPage({ searchParams }: DealsSearchPageProps) {
  const [data, destinationPhotoUrls, resolvedSearchParams] = await Promise.all([
    getPublicSearchDealsPageData(),
    getDestinationPhotoUrlMap(),
    searchParams,
  ]);

  return (
    <main className="page-shell page-shell--deals-search">
      <PublicDealsExplorer
        data={data}
        destinationPhotoUrls={destinationPhotoUrls}
        initialFilters={parseDealSearchFilters(resolvedSearchParams)}
        initialSort={parseDealSearchSort(resolvedSearchParams)}
        mode="results"
      />
    </main>
  );
}
