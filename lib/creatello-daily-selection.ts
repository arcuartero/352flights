import { createHash } from "node:crypto";

import {
  toCreatelloInboxOffer,
  type CreatelloInboxPackage,
  type CreatelloInboxTargetTemplate,
} from "@/lib/creatello-content-inbox-contract";
import type { CreatelloLanguage, TikTokSourceOffer } from "@/lib/tiktok-carousel";

export const DAILY_CREATELLO_TEMPLATES: readonly CreatelloInboxTargetTemplate[] = [
  "flight-deals-352",
  "travel-offer",
  "cheap-flights-tiktok",
];

export const CREATELLO_DELIVERY_SLOTS = ["morning", "evening"] as const;
export type CreatelloDeliverySlot = (typeof CREATELLO_DELIVERY_SLOTS)[number];

export type DailyCreatelloCandidate = {
  source: TikTokSourceOffer;
  canonical: CreatelloInboxPackage["offers"][number];
};

export type DailyCreatelloPlan = {
  targetTemplate: CreatelloInboxTargetTemplate;
  requestedCount: number;
  offers: TikTokSourceOffer[];
  canonicalOffers: CreatelloInboxPackage["offers"];
};

export type DailyCreatelloSkippedPlan = {
  targetTemplate: CreatelloInboxTargetTemplate;
  requestedCount: number;
  availableCount: number;
  reason: "insufficient_compatible_offers";
  monthlyCounts?: Record<string, number>;
};

function stableNumber(value: string) {
  return createHash("sha256").update(value).digest().readUInt32BE(0);
}

export function dailyCreatelloPackageSize(
  dateKey: string,
  template: CreatelloInboxTargetTemplate,
  deliverySlot: CreatelloDeliverySlot = "morning",
) {
  return 3 + (stableNumber(`${dateKey}:${deliverySlot}:${template}:package-size`) % 3);
}

export function dailyCreatelloDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Luxembourg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function dailyCreatelloCutoff(
  dateKey: string,
  deliverySlot: CreatelloDeliverySlot = "morning",
) {
  const time = deliverySlot === "morning" ? "07:15:00.000Z" : "19:15:00.000Z";
  return new Date(`${dateKey}T${time}`);
}

export function dailyCreatelloDestinationKey(city: string) {
  return city.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export function prepareDailyCreatelloCandidates(
  offers: TikTokSourceOffer[],
  language: CreatelloLanguage,
) {
  const candidates: DailyCreatelloCandidate[] = [];
  for (const source of offers) {
    try {
      candidates.push({ source, canonical: toCreatelloInboxOffer(source, language) });
    } catch {
      // Candidate-level validation is expected to reject incomplete scanner rows.
    }
  }
  return candidates;
}

function isCompatible(candidate: DailyCreatelloCandidate, template: CreatelloInboxTargetTemplate) {
  const offer = candidate.canonical;
  if (template === "cheap-flights-tiktok") return true;
  if (!offer.destinationCountryCode) return false;
  if (template === "travel-offer") return true;
  return offer.stops === 0
    && Boolean(offer.airline)
    && Boolean(offer.airlineCode)
    && Boolean(offer.outboundDepartureTime)
    && Boolean(offer.outboundArrivalTime)
    && Boolean(offer.returnDepartureTime)
    && Boolean(offer.returnArrivalTime)
    && Boolean(offer.outboundDurationMinutes)
    && Boolean(offer.returnDurationMinutes);
}

export function selectMonthlyCreatelloCandidates(eligible: DailyCreatelloCandidate[], seed: string) {
  const grouped = new Map<string, Map<string, DailyCreatelloCandidate>>();
  for (const candidate of eligible) {
    const month = candidate.canonical.departureDate.slice(0, 7);
    const cities = grouped.get(month) || new Map<string, DailyCreatelloCandidate>();
    const city = dailyCreatelloDestinationKey(candidate.canonical.destinationCity);
    if (!cities.has(city)) cities.set(city, candidate);
    grouped.set(month, cities);
  }
  const monthlyCounts = Object.fromEntries([...grouped].map(([month, cities]) => [month, cities.size]));
  const months = [...grouped.keys()].filter((month) => grouped.get(month)!.size >= 3).sort();
  // Match month slots to distinct destinations; a destination available in several
  // months must not be consumed greedily and prevent another month reaching three.
  const assign = (chosen: string[], counts: number[]) => {
    const slots = chosen.flatMap((month, index) => Array.from({ length: counts[index] }, () => month));
    const owners = new Map<string, number>();
    const visit = (slot: number, seen: Set<string>): boolean => {
      for (const city of grouped.get(slots[slot])!.keys()) {
        if (seen.has(city)) continue;
        seen.add(city);
        const previous = owners.get(city);
        if (previous === undefined || visit(previous, seen)) { owners.set(city, slot); return true; }
      }
      return false;
    };
    if (!slots.every((_, slot) => visit(slot, new Set()))) return null;
    return [...owners].map(([city, slot]) => grouped.get(slots[slot])!.get(city)!);
  };
  for (let a = 0; a < months.length - 2; a++) for (let b = a + 1; b < months.length - 1; b++) for (let c = b + 1; c < months.length; c++) {
    const chosen = [months[a], months[b], months[c]];
    const counts = [3, 3, 3];
    let selected = assign(chosen, counts);
    if (!selected) continue;
    for (let index = 0; index < 3; index++) {
      const desired = 3 + stableNumber(`${seed}:${chosen[index]}:monthly-size`) % 3;
      while (counts[index] < desired) {
        counts[index]++;
        const next = assign(chosen, counts);
        if (!next) { counts[index]--; break; }
        selected = next;
      }
    }
    return { selected: selected.sort((a, b) => a.canonical.departureDate.localeCompare(b.canonical.departureDate)), monthlyCounts };
  }
  return { selected: [] as DailyCreatelloCandidate[], monthlyCounts };
}

function candidateOrder(
  dateKey: string,
  template: CreatelloInboxTargetTemplate,
  deliverySlot: CreatelloDeliverySlot,
) {
  return (left: DailyCreatelloCandidate, right: DailyCreatelloCandidate) => {
    if (left.canonical.priceMinor !== right.canonical.priceMinor) {
      return left.canonical.priceMinor - right.canonical.priceMinor;
    }
    if (left.canonical.checkedAt !== right.canonical.checkedAt) {
      return right.canonical.checkedAt.localeCompare(left.canonical.checkedAt);
    }
    return stableNumber(`${dateKey}:${deliverySlot}:${template}:${left.canonical.itineraryKey}`)
      - stableNumber(`${dateKey}:${deliverySlot}:${template}:${right.canonical.itineraryKey}`);
  };
}

export function planDailyCreatelloPackages(input: {
  offers: TikTokSourceOffer[];
  language: CreatelloLanguage;
  dateKey: string;
  deliverySlot?: CreatelloDeliverySlot;
  usedItineraryKeys?: Iterable<string>;
  usedSourceSnapshotIds?: Iterable<string>;
  reservedTodayDestinationKeys?: Iterable<string>;
  templates?: readonly CreatelloInboxTargetTemplate[];
}) {
  const templates = input.templates ?? DAILY_CREATELLO_TEMPLATES;
  const deliverySlot = input.deliverySlot ?? "morning";
  const candidates = prepareDailyCreatelloCandidates(input.offers, input.language);
  const usedItineraries = new Set(input.usedItineraryKeys ?? []);
  const usedSnapshots = new Set(input.usedSourceSnapshotIds ?? []);
  const usedDestinations = new Set(input.reservedTodayDestinationKeys ?? []);
  const plans: DailyCreatelloPlan[] = [];
  const skipped: DailyCreatelloSkippedPlan[] = [];

  for (const targetTemplate of templates) {
    let requestedCount = dailyCreatelloPackageSize(input.dateKey, targetTemplate, deliverySlot);
    const eligible = candidates
      .filter((candidate) => isCompatible(candidate, targetTemplate))
      .filter((candidate) => !usedItineraries.has(candidate.canonical.itineraryKey))
      .filter((candidate) => !usedSnapshots.has(candidate.canonical.sourceSnapshotId))
      .filter((candidate) => !usedDestinations.has(dailyCreatelloDestinationKey(candidate.canonical.destinationCity)))
      .sort(candidateOrder(input.dateKey, targetTemplate, deliverySlot));

    const uniqueDestinations = new Map<string, DailyCreatelloCandidate>();
    for (const candidate of eligible) {
      const destinationKey = dailyCreatelloDestinationKey(candidate.canonical.destinationCity);
      if (!uniqueDestinations.has(destinationKey)) {
        uniqueDestinations.set(destinationKey, candidate);
      }
    }
    const monthly = targetTemplate === "cheap-flights-tiktok" ? selectMonthlyCreatelloCandidates(eligible, `${input.dateKey}:${deliverySlot}:${targetTemplate}`) : null;
    const selected = monthly ? monthly.selected : [...uniqueDestinations.values()].slice(0, requestedCount);
    if (monthly) requestedCount = selected.length || 9;
    if (selected.length < requestedCount) {
      skipped.push({
        targetTemplate,
        requestedCount,
        availableCount: selected.length,
        reason: "insufficient_compatible_offers",
        ...(monthly ? { monthlyCounts: monthly.monthlyCounts } : {}),
      });
      continue;
    }

    for (const candidate of selected) {
      usedItineraries.add(candidate.canonical.itineraryKey);
      usedSnapshots.add(candidate.canonical.sourceSnapshotId);
      usedDestinations.add(dailyCreatelloDestinationKey(candidate.canonical.destinationCity));
    }
    plans.push({
      targetTemplate,
      requestedCount,
      offers: selected.map((candidate) => candidate.source),
      canonicalOffers: selected.map((candidate) => candidate.canonical),
    });
  }

  return { plans, skipped, validCandidateCount: candidates.length };
}
