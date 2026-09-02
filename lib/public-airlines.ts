const NON_PASSENGER_AIRLINE_PATTERNS = [
  /\bcargo\b/i,
  /\bfreight\b/i,
  /\bair\s*freight\b/i,
];

const NON_PASSENGER_AIRLINE_NAMES = new Set([
  "cargolux",
  "dhl aviation",
  "european air transport leipzig",
  "fedex express",
  "ups airlines",
]);

export function normalizePublicAirlineName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ");
}

/**
 * Fare providers occasionally return operating or logistics companies next
 * to passenger carriers. Those labels are useful internally but must not be
 * exposed as selectable public-search facets.
 */
export function isPublicPassengerAirline(value: string) {
  const normalized = normalizePublicAirlineName(value);
  return (
    Boolean(normalized) &&
    !NON_PASSENGER_AIRLINE_NAMES.has(normalized) &&
    !NON_PASSENGER_AIRLINE_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

export function getPublicAirlineNames(summary: string | null) {
  return [
    ...new Set(
      (summary ?? "")
        .split(/,|\+/)
        .map((item) => item.trim())
        .filter((item) => item && !/^\d+\s+more$/i.test(item))
        .filter(isPublicPassengerAirline),
    ),
  ];
}
