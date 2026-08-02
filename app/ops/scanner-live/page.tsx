import { OpsSubnav } from "@/components/ops-subnav";
import { PriceScanRunHistory } from "@/components/price-scan-run-history";
import { RecentSnapshotsPanel } from "@/components/recent-snapshots-panel";
import { getOpsDashboardData } from "@/lib/ops";
import { getPriceScanRunHistory } from "@/lib/price-scan-runs";
import { recoverLatestVpsPriceScanRun } from "@/lib/price-scan-run-recovery";
import {
  callVpsScannerAgent,
  hasVpsScannerAgentConfig,
  type VpsScannerAgentStatus,
} from "@/lib/vps-scanner-agent";

export const dynamic = "force-dynamic";

export default async function OpsScannerLivePage() {
  const dashboardPromise = getOpsDashboardData();

  if (hasVpsScannerAgentConfig()) {
    try {
      const status = await callVpsScannerAgent<VpsScannerAgentStatus>("status");
      await recoverLatestVpsPriceScanRun(status);
    } catch {
      // History remains available when the remote agent cannot be reached.
    }
  }

  const [dashboard, history] = await Promise.all([dashboardPromise, getPriceScanRunHistory(100)]);

  return (
    <main className="ops-shell ops-shell--scanner-live">
      <OpsSubnav />
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
