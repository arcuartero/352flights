import { OpsCookieBannerEditor } from "@/components/ops-cookie-banner-editor";
import { OpsSubnav } from "@/components/ops-subnav";

export const dynamic = "force-dynamic";

export default function OpsCookieBannerPage() {
  return <main className="ops-shell"><OpsSubnav /><div className="ops-shell__center-panel"><section className="ops-panel ops-panel--wide"><div className="ops-panel__header"><div><h2>Cookie Banner</h2><p>Control consent, content, layout and colours across the site.</p></div></div><OpsCookieBannerEditor /></section></div></main>;
}
