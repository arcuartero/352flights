import { PublicDealsExplorer } from "@/components/public-deals-explorer";
import { getPublicDealsPageData } from "@/lib/ops";
import { parseDealSearchFilters, parseDealSearchSort } from "@/lib/public-deals-search";

type DealsSearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DealsSearchPage({ searchParams }: DealsSearchPageProps) {
  const [data, resolvedSearchParams] = await Promise.all([
    getPublicDealsPageData(),
    searchParams,
  ]);

  return (
    <main className="page-shell page-shell--deals-search">
      <PublicDealsExplorer
        data={data}
        initialFilters={parseDealSearchFilters(resolvedSearchParams)}
        initialSort={parseDealSearchSort(resolvedSearchParams)}
        mode="results"
      />
    </main>
  );
}
