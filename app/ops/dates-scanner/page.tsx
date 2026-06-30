import { LocalPatternDiscoveryStatusWidget } from "@/components/local-pattern-discovery-status";
import { OpsSubnav } from "@/components/ops-subnav";

export const dynamic = "force-dynamic";

export default function OpsDatesScannerPage() {
  return (
    <main className="ops-shell ops-shell--scanner-live">
      <OpsSubnav />
      <LocalPatternDiscoveryStatusWidget displayMode="page" />
    </main>
  );
}
