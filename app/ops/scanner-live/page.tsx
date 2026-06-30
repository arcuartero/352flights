import { LocalScannerStatusWidget } from "@/components/local-scanner-status";
import { OpsSubnav } from "@/components/ops-subnav";
import { RecentSnapshotsPanel } from "@/components/recent-snapshots-panel";
import { getOpsDashboardData } from "@/lib/ops";

export const dynamic = "force-dynamic";

export default async function OpsScannerLivePage() {
  const dashboard = await getOpsDashboardData();

  return (
    <main className="ops-shell ops-shell--scanner-live">
      <OpsSubnav />
      <LocalScannerStatusWidget displayMode="page" />
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
