export const campaignSendTypes = ["digest", "flash"] as const;
export const dealLifecycleStates = ["new", "reviewed", "sent", "expired"] as const;

export type CampaignSendType = (typeof campaignSendTypes)[number];
export type DealLifecycleState = (typeof dealLifecycleStates)[number];

export type CampaignPreviewDeal = {
  id: string;
  routeLabel: string;
  title: string;
  dealPrice: number;
  departureDate: string | null;
  returnDate: string | null;
  airlineSummary: string | null;
  bookingUrl: string | null;
};

export type CampaignPreview = {
  sendType: CampaignSendType;
  label: string;
  description: string;
  reviewedDeals: number;
  matchingSubscribers: number;
  topRoutes: string[];
  isReady: boolean;
  blockedReason: string | null;
  subject: string;
  previewText: string;
  previewHtml: string;
  previewDeals: CampaignPreviewDeal[];
  suggestedTestEmail: string | null;
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

export type DigestAutomationSummary = {
  enabled: boolean;
  localTime: string;
  testEmail: string | null;
  lastDigestSentOn: string | null;
  endpointReady: boolean;
  blockedReason: string | null;
};

export const initialOpsActionState: OpsActionState = {
  tone: "idle",
  message: "",
};
