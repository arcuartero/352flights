import { OpsSubnav } from "@/components/ops-subnav";
import { RecentSnapshotsPanel } from "@/components/recent-snapshots-panel";
import { VpsScannerControlPanel } from "@/components/vps-scanner-control-panel";
import { getOpsDashboardData } from "@/lib/ops";

export const dynamic = "force-dynamic";

export default async function OpsScannerLivePage() {
  const dashboard = await getOpsDashboardData();

  return (
    <main className="ops-shell ops-shell--scanner-live">
      <OpsSubnav />
      <VpsScannerControlPanel />
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
