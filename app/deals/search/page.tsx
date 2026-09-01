import { DealsSearchPageContent } from "@/components/deals-search-page-content";
import { getDealsSearchMetadata } from "@/lib/deals-seo";

export const revalidate = 1800;

export const metadata = getDealsSearchMetadata("en");

type DealsSearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function DealsSearchPage({ searchParams }: DealsSearchPageProps) {
  return <DealsSearchPageContent locale="en" searchParams={searchParams} />;
}
