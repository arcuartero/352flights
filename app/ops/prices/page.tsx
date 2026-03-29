import { OpsSubnav } from "@/components/ops-subnav";
import { PriceIntelligenceBoard } from "@/components/price-intelligence-board";
import { getOpsPriceIntelligenceData } from "@/lib/ops";

export const dynamic = "force-dynamic";

export default async function OpsPricesPage() {
  const data = await getOpsPriceIntelligenceData();

  return (
    <main className="ops-shell ops-shell--prices">
      <section className="ops-hero">
        <div>
          <p className="ops-eyebrow">Lux Flight Deals Ops</p>
          <h1>Historical price intelligence across every route the cron is tracking.</h1>
          <p>
            Use this view to inspect recent snapshots, compare routes, and see how the cron output
            is evolving over time.
          </p>
        </div>
        <div className="ops-auth-note">
          <span>Protected route</span>
          <strong>/ops/prices</strong>
        </div>
      </section>

      <OpsSubnav />
      <PriceIntelligenceBoard data={data} />
    </main>
  );
}
