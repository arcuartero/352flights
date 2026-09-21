import { OpsAnalyticsDashboard } from "@/components/ops-analytics-dashboard";
import { OpsSubnav } from "@/components/ops-subnav";

export const dynamic = "force-dynamic";

export default function OpsAnalyticsPage() {
  return <main className="ops-shell"><OpsSubnav /><div className="ops-shell__center-panel"><section className="ops-panel ops-panel--wide"><div className="ops-panel__header"><div><h2>Google Analytics</h2><p>Live visitors, sessions and page activity alongside anonymous cookie-banner decisions.</p></div></div><OpsAnalyticsDashboard /></section></div></main>;
}
