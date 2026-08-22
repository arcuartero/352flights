import { EmailCampaignsBoardLoader } from "@/components/email-campaigns-board-loader";
import { OpsSubnav } from "@/components/ops-subnav";

export const dynamic = "force-dynamic";

export default function OpsEmailCampaignsPage() {
  return (
    <main className="ops-shell">
      <OpsSubnav />
      <EmailCampaignsBoardLoader />
    </main>
  );
}
