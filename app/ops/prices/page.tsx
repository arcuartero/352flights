import { OpsSubnav } from "@/components/ops-subnav";
import { PriceIntelligenceBoard } from "@/components/price-intelligence-board";
import { getOpsPriceIntelligenceData } from "@/lib/ops";

export const dynamic = "force-dynamic";

export default async function OpsPricesPage() {
  const data = await getOpsPriceIntelligenceData().catch((error) => ({
    configured: true,
    schemaReady: false,
    onboardingMessage:
      error instanceof Error
        ? `Price intelligence failed to load: ${error.name}: ${error.message}`
        : "Price intelligence failed to load due to an unknown server error.",
    scannerNote:
      "The current scanner stores one cheapest itinerary per active route pattern on each cron run. This board shows that tracked history.",
    totals: {
      routesTracked: 0,
      snapshotsLoaded: 0,
      latestSnapshotAt: null,
      liveLowestPrice: null,
      liveLowestRouteLabel: null,
    },
    series: [],
    tableRows: [],
  }));

  return (
    <main className="ops-shell ops-shell--prices">
      <OpsSubnav />
      <PriceIntelligenceBoard data={data} />
    </main>
  );
}
