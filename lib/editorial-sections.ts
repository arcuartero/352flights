import { formatStayBucketLabel } from "@/lib/stay-buckets";

export const editorialSectionOrder = [
  "fresh_price_drops",
  "good_options_next_30_days",
  "best_weekend_escapes",
  "best_long_stays",
] as const;

export type EditorialSectionKey = (typeof editorialSectionOrder)[number];

export type EditorialSectionMeta = {
  key: EditorialSectionKey;
  label: string;
  description: string;
};

export type EditorialSection<T> = EditorialSectionMeta & {
  items: T[];
};

export type EditorialSectionInput = {
  routeBucket: string;
  tripNights: number;
  dropRatio: number | null;
  departureDate: string | null;
};

const editorialSectionMetaMap: Record<EditorialSectionKey, EditorialSectionMeta> = {
  fresh_price_drops: {
    key: "fresh_price_drops",
    label: "Fresh price drops",
    description: "The sharpest newly verified fares sitting well below their recent baseline.",
  },
  good_options_next_30_days: {
    key: "good_options_next_30_days",
    label: "Good options for next 30 days",
    description: "Trips leaving soon enough to book now without waiting for a future season.",
  },
  best_weekend_escapes: {
    key: "best_weekend_escapes",
    label: "Best weekend escapes",
    description: "Shorter Luxembourg trips of 2 to 4 nights built around the weekend.",
  },
  best_long_stays: {
    key: "best_long_stays",
    label: "Best long stays",
    description: "Longer trips above 4 nights that stretch into a more substantial break.",
  },
};

export function getEditorialSectionMeta(key: EditorialSectionKey) {
  return editorialSectionMetaMap[key];
}

function daysUntilDeparture(value: string | null, now: Date = new Date()) {
  if (!value) {
    return null;
  }

  const departure = new Date(`${value}T00:00:00Z`);
  const departureTime = departure.getTime();
  if (!Number.isFinite(departureTime)) {
    return null;
  }

  const diffMs = departureTime - now.getTime();
  return diffMs / (24 * 60 * 60 * 1000);
}

export function getPrimaryEditorialSection(
  input: EditorialSectionInput,
  now: Date = new Date(),
): EditorialSectionKey {
  if (input.dropRatio !== null && input.dropRatio <= 0.85) {
    return "fresh_price_drops";
  }

  const departureLeadDays = daysUntilDeparture(input.departureDate, now);
  if (departureLeadDays !== null && departureLeadDays >= 0 && departureLeadDays <= 30) {
    return "good_options_next_30_days";
  }

  if (input.routeBucket === "long_stay" || input.tripNights > 4) {
    return "best_long_stays";
  }

  return "best_weekend_escapes";
}

export function buildEditorialSections<T>(
  items: T[],
  getInput: (item: T) => EditorialSectionInput,
  now: Date = new Date(),
): EditorialSection<T>[] {
  const grouped = new Map<EditorialSectionKey, T[]>();

  for (const item of items) {
    const key = getPrimaryEditorialSection(getInput(item), now);
    const bucket = grouped.get(key) ?? [];
    bucket.push(item);
    grouped.set(key, bucket);
  }

  return editorialSectionOrder
    .map((key) => {
      const bucket = grouped.get(key) ?? [];
      if (bucket.length === 0) {
        return null;
      }

      return {
        ...getEditorialSectionMeta(key),
        items: bucket,
      };
    })
    .filter(Boolean) as EditorialSection<T>[];
}

export function describeSimpleBucketPreference(bucket: "weekend" | "long_stay") {
  return `Only ${formatStayBucketLabel(bucket).toLowerCase()}`;
}
