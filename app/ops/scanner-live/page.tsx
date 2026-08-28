import { OpsSubnav } from "@/components/ops-subnav";
import { IndicativePriceCoverage } from "@/components/indicative-price-coverage";
import { PriceScanRunHistory } from "@/components/price-scan-run-history";
import { RecentSnapshotsPanel } from "@/components/recent-snapshots-panel";

export const dynamic = "force-dynamic";

export default function OpsScannerLivePage() {
  return (
    <main className="ops-shell ops-shell--scanner-live">
      <OpsSubnav />
      <PriceScanRunHistory error={null} runs={[]} />
      <div className="ops-shell__center-panel">
        <IndicativePriceCoverage />
      </div>
      <div className="ops-shell__center-panel">
        <RecentSnapshotsPanel
          collapsible
          defaultOpen={false}
          refreshEndpoint="/api/ops/recent-price-snapshots"
          snapshots={[]}
          title="Recent snapshots"
        />
      </div>
    </main>
  );
}
