/** Expiry is checked outside data caches, including fallback results. */
export const PUBLIC_FARE_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000;

export function freshPublicFares<T extends { verifiedAt?: string | null; departureDate?: string | null }>(
  deals: T[], now = new Date(),
): T[] {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Luxembourg" }).format(now);
  return deals.filter((deal) => {
    const checked = Date.parse(deal.verifiedAt ?? "");
    return Number.isFinite(checked) && checked <= now.getTime()
      && checked + PUBLIC_FARE_VALIDITY_MS > now.getTime()
      && Boolean(deal.departureDate && deal.departureDate >= today);
  });
}

export function publicFareSnapshotIds(deals: Array<{ id: string }>): string[] {
  return deals.map((deal) => /^fare-(\d+)$/.exec(deal.id)?.[1]).filter((id): id is string => Boolean(id));
}

export function publicFaresAreCurrent(deals: Array<{ id: string }>, activeIds: Iterable<string>): boolean {
  const ids = new Set(activeIds);
  return deals.every((deal) => {
    const id = /^fare-(\d+)$/.exec(deal.id)?.[1];
    return Boolean(id && ids.has(id));
  });
}
