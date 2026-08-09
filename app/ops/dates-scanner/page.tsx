import { DateScanRunHistory } from "@/components/date-scan-run-history";
import { LocalPatternDiscoveryStatusWidget } from "@/components/local-pattern-discovery-status";
import { OpsSubnav } from "@/components/ops-subnav";
import { getDateScanRunHistory } from "@/lib/date-scan-runs";

export const dynamic = "force-dynamic";

export default async function OpsDatesScannerPage() {
  const history = await getDateScanRunHistory(100);

  return (
    <main className="ops-shell ops-shell--scanner-live">
      <OpsSubnav />
      <LocalPatternDiscoveryStatusWidget displayMode="page" />
      <DateScanRunHistory error={history.error} runs={history.runs} />
    </main>
  );
}
