export const campaignSendTypes = ["digest", "flash"] as const;

export type CampaignSendType = (typeof campaignSendTypes)[number];

export type CampaignPreview = {
  sendType: CampaignSendType;
  label: string;
  description: string;
  approvedDeals: number;
  matchingSubscribers: number;
  topRoutes: string[];
  isReady: boolean;
  blockedReason: string | null;
};

export type RecentCampaignSummary = {
  id: string;
  sendType: CampaignSendType;
  status: string;
  subject: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  sentAt: string | null;
  routeLabels: string[];
};

export type OpsActionState = {
  tone: "idle" | "success" | "error";
  message: string;
};

export const initialOpsActionState: OpsActionState = {
  tone: "idle",
  message: "",
};
