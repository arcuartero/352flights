import { OpsSubnav } from "@/components/ops-subnav";
import { PriceScanRunHistory } from "@/components/price-scan-run-history";
import { RecentSnapshotsPanel } from "@/components/recent-snapshots-panel";
import { VpsScannerControlPanel } from "@/components/vps-scanner-control-panel";
import { getOpsDashboardData } from "@/lib/ops";
import { getPriceScanRunHistory } from "@/lib/price-scan-runs";

export const dynamic = "force-dynamic";

export default async function OpsScannerLivePage() {
  const [dashboard, history] = await Promise.all([
    getOpsDashboardData(),
    getPriceScanRunHistory(100),
  ]);

  return (
    <main className="ops-shell ops-shell--scanner-live">
      <OpsSubnav />
      <VpsScannerControlPanel />
      <PriceScanRunHistory error={history.error} runs={history.runs} />
      <div className="ops-shell__center-panel">
        <RecentSnapshotsPanel
          collapsible
          defaultOpen={false}
          snapshots={dashboard.recentSnapshots}
          title="Recent snapshots"
        />
      </div>
    </main>
  );
}
