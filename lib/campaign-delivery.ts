import type { CampaignSendType } from "@/lib/ops-shared";
import type { DeliveryModeValue } from "@/lib/preferences-shared";

export function deliveryModeMatches(
  sendType: CampaignSendType,
  modes: DeliveryModeValue[],
) {
  const required: DeliveryModeValue =
    sendType === "flash"
      ? "flash_only"
      : sendType === "weekly"
        ? "weekly_best_of"
        : "daily_digest";
  return modes.includes(required);
}

/** Monday's local calendar date identifies the entire delivery week, including retries. */
export function weeklyPeriodStart(localDate: string) {
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export function weeklySkipReason(input: {
  enabled: boolean;
  force?: boolean;
  localDate: string;
  localTime: string;
  nowTime: string;
  lastWeeklySentOn: string | null;
}) {
  const week = weeklyPeriodStart(input.localDate);
  if (
    input.lastWeeklySentOn &&
    weeklyPeriodStart(input.lastWeeklySentOn) === week
  )
    return `Weekly roundup already sent for ${week}.`;
  if (input.force) return null;
  if (!input.enabled) return "Weekly roundup automation is disabled in /ops.";
  if (input.localDate === week && input.nowTime < input.localTime)
    return `Weekly roundup is scheduled for Monday ${input.localTime} Europe/Luxembourg.`;
  return null;
}

type WeeklyDeal = {
  id: string;
  score: number;
  dealPrice: number;
  destinationAirport: string;
  createdAt: string;
  departureDate: string | null;
  verifiedAt: string | null;
  status: string;
};
export function eligibleWeeklyDeals<T extends WeeklyDeal>(
  deals: T[],
  now = new Date(),
): T[] {
  const cutoff = now.getTime() - 7 * 86400000;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Luxembourg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return deals.filter(
    (deal) =>
      ["reviewed", "sent"].includes(deal.status) &&
      new Date(deal.createdAt).getTime() >= cutoff &&
      Boolean(deal.verifiedAt) &&
      new Date(deal.verifiedAt!).getTime() >= cutoff &&
      Boolean(deal.departureDate) &&
      deal.departureDate! > today,
  );
}

export function bestWeeklyDeals<T extends WeeklyDeal>(deals: T[]): T[] {
  const destinations = new Set<string>();
  return [...deals]
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.dealPrice - b.dealPrice ||
        a.id.localeCompare(b.id),
    )
    .filter((deal) => {
      if (destinations.has(deal.destinationAirport)) return false;
      destinations.add(deal.destinationAirport);
      return true;
    })
    .slice(0, 6);
}
