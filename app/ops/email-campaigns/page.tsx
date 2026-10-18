import { assertOpsAccess } from "@/lib/ops-access";
import { EmailCampaignsBoardLoader } from "@/components/email-campaigns-board-loader";
import { OpsSubnav } from "@/components/ops-subnav";

export const dynamic = "force-dynamic";

export default async function OpsEmailCampaignsPage() {
  await assertOpsAccess();
  return (
    <main className="ops-shell">
      <OpsSubnav />
      <EmailCampaignsBoardLoader />
    </main>
  );
}
