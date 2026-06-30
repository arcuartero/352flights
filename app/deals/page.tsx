import { PublicDealsExplorer } from "@/components/public-deals-explorer";
import { getPublicDealsPageData } from "@/lib/ops";

export default async function DealsPage() {
  const data = await getPublicDealsPageData();

  return (
    <main className="page-shell page-shell--deals">
      <PublicDealsExplorer data={data} />
    </main>
  );
}
