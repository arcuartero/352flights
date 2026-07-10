import type { EditorialSection, EditorialSectionKey } from "@/lib/editorial-sections";

export const campaignSendTypes = ["digest", "flash"] as const;
export const dealLifecycleStates = ["new", "reviewed", "sent", "expired"] as const;

export type CampaignSendType = (typeof campaignSendTypes)[number];
export type DealLifecycleState = (typeof dealLifecycleStates)[number];
export type FarePricePosition =
  | "exceptional"
  | "below_usual"
  | "typical"
  | "above_usual"
  | "new_price";

export type CampaignPreviewDeal = {
  id: string;
  score: number;
  routeLabel: string;
  title: string;
  summary: string;
  routeBucket: string;
  editorialSection: EditorialSectionKey;
  destinationCity: string;
  destinationAirport: string;
  dealPrice: number;
  baselinePrice: number | null;
  dropRatio: number | null;
  pricePosition: FarePricePosition;
  historyPoints: number;
  isEditorialDeal: boolean;
  departureDate: string | null;
  returnDate: string | null;
  tripNights: number;
  maxStops: string;
  airlineSummary: string | null;
  outboundDepartureAt: string | null;
  outboundArrivalAt: string | null;
  returnDepartureAt: string | null;
  returnArrivalAt: string | null;
  destinationStayHours: number | null;
  verifiedAt: string | null;
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
  previewSections: EditorialSection<CampaignPreviewDeal>[];
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
