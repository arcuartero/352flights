import { ActiveRoutesBoard } from "@/components/active-routes-board";
import { OpsSubnav } from "@/components/ops-subnav";
import { getOpsActiveRoutesData } from "@/lib/active-routes";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OpsActiveRoutesPage() {
  noStore();
  const data = await getOpsActiveRoutesData();

  return (
    <main className="ops-shell">
      {data.onboardingMessage ? (
        <section className="ops-banner" role="status">
          <p>{data.onboardingMessage}</p>
        </section>
      ) : null}

      <OpsSubnav />
      <div className="ops-shell__center-panel">
        <ActiveRoutesBoard data={data} />
      </div>
    </main>
  );
}
