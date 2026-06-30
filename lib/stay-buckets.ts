export const stayBucketValues = ["weekend", "long_stay"] as const;

export type StayBucketValue = (typeof stayBucketValues)[number];

export const WEEKEND_MAX_NIGHTS = 4;

export function normalizeStayBucket(bucket: string | null | undefined): StayBucketValue | null {
  if (!bucket) {
    return null;
  }

  if (bucket === "sun_breaks" || bucket === "weekend_europe" || bucket === "weekend") {
    return "weekend";
  }

  if (bucket === "long_haul" || bucket === "long_stay") {
    return "long_stay";
  }

  return null;
}

export function deriveStayBucketFromNights(tripNights: number | null | undefined): StayBucketValue {
  return (tripNights ?? 0) > WEEKEND_MAX_NIGHTS ? "long_stay" : "weekend";
}

export function deriveSupportedStayBuckets(input: {
  tripNights?: number | null;
  minTripNights?: number | null;
  maxTripNights?: number | null;
}) {
  const minTripNights = input.minTripNights ?? input.tripNights ?? null;
  const maxTripNights = input.maxTripNights ?? input.tripNights ?? null;
  const buckets: StayBucketValue[] = [];

  if (minTripNights === null && maxTripNights === null) {
    return [deriveStayBucketFromNights(input.tripNights)];
  }

  if ((minTripNights ?? 0) <= WEEKEND_MAX_NIGHTS) {
    buckets.push("weekend");
  }

  if ((maxTripNights ?? 0) > WEEKEND_MAX_NIGHTS) {
    buckets.push("long_stay");
  }

  if (buckets.length === 0) {
    buckets.push(deriveStayBucketFromNights(input.tripNights));
  }

  return buckets;
}

export function formatStayBucketLabel(bucket: string | StayBucketValue | null | undefined) {
  const normalized = normalizeStayBucket(bucket);
  if (normalized === "long_stay") {
    return "Long stay";
  }

  return "Weekend";
}

export function formatStayBucketListLabel(buckets: readonly (string | StayBucketValue)[]) {
  const normalized = Array.from(
    new Set(buckets.map((bucket) => normalizeStayBucket(bucket)).filter(Boolean)),
  ) as StayBucketValue[];

  if (normalized.length === 0) {
    return "Weekend";
  }

  return normalized.map((bucket) => formatStayBucketLabel(bucket)).join(" + ");
}
