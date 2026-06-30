import { EmailCampaignsBoard } from "@/components/email-campaigns-board";
import { OpsSubnav } from "@/components/ops-subnav";
import { getOpsDashboardData } from "@/lib/ops";

export const dynamic = "force-dynamic";

export default async function OpsEmailCampaignsPage() {
  const dashboard = await getOpsDashboardData();

  return (
    <main className="ops-shell">
      {dashboard.onboardingMessage ? (
        <section className="ops-banner" role="status">
          <p>{dashboard.onboardingMessage}</p>
        </section>
      ) : null}

      <OpsSubnav />
      <EmailCampaignsBoard
        data={{
          digestAutomation: dashboard.digestAutomation,
          sendQueue: dashboard.sendQueue,
          subscribers: dashboard.subscribers,
          recentCampaigns: dashboard.recentCampaigns,
        }}
      />
    </main>
  );
}
