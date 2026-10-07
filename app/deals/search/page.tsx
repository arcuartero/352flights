import { DealsSearchPageContent } from "@/components/deals-search-page-content";
import { getDealsSearchMetadata } from "@/lib/deals-seo";

export const revalidate = 1800;

export const metadata = getDealsSearchMetadata("en");

export default function DealsSearchPage() {
  return <DealsSearchPageContent locale="en" />;
}
