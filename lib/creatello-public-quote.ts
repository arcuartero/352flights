import { getPublicCityDealsPageData } from "./ops";
import { toDestinationSlug, matchesDestinationSlug } from "./destination-slugs";
import { getLocalizedDestinationPath } from "./locales";
import { toCreatelloInboxOffer } from "./creatello-content-inbox-contract";
import type { PublicQuoteResolver, RevalidationRequest } from "./creatello-revalidation";
import { completeDurations, conditionKeys, differences, normalized, sameFixedOffer } from "./creatello-offer-comparison";

type Offer = RevalidationRequest["offers"][number];

// Use the exact destination-page cache and selected fares, not a latest-row approximation.
// Strict mode deliberately does not turn a database failure into an empty successful page.
export const resolvePublicQuote: PublicQuoteResolver = async (offer, routeId, supabase, now) => {
  const slug = toDestinationSlug(offer.destinationCity);
  const page = await getPublicCityDealsPageData(slug, { strict: true });
  const candidates = page.deals.filter((fare) => matchesDestinationSlug(fare.destinationCity, slug)
    && fare.destinationAirport === offer.destinationAirport
    && fare.departureDate === offer.departureDate && fare.returnDate === offer.returnDate);
  if (!candidates.length) return { reason: "not_visible_on_web" };
  const alternatives: { fareId: string; offer: Offer; differences: ReturnType<typeof differences> }[] = [];
  let incomplete = false;
  let incompleteDifferences: ReturnType<typeof differences> = [];
  let fixedDifferences: ReturnType<typeof differences> = [];
  let matched: { quote: { itineraryKey: string; priceMinor: number; currency: string; fareId: string; url: string; checkedAt: string } } | undefined;
  for (const fare of candidates) {
    const id = /^fare-(\d+)$/.exec(fare.id)?.[1];
    if (!id) throw new Error("Unrecognized public fare identity");
    const { data: row, error } = await supabase.from("price_snapshots")
      .select("id,route_id,departure_date,return_date,price,currency,scanned_at,max_stops,metadata")
      .eq("id", Number(id)).maybeSingle();
    if (error) throw new Error("Could not verify public fare conditions");
    if (!row) throw new Error("Public fare snapshot unavailable");
    if (row.route_id !== routeId) continue;
    let current: Offer;
    try {
      current = toCreatelloInboxOffer({ id: row.id, originAirport: offer.originAirport,
        destinationAirport: fare.destinationAirport, destinationCity: fare.destinationCity,
        departureDate: row.departure_date, returnDate: row.return_date,
        price: Number(row.price), currency: row.currency, maxStops: row.max_stops,
        scannedAt: row.scanned_at, metadata: row.metadata }, "en");
    } catch { incomplete = true; continue; }
    if (!current.outboundDurationMinutes || !current.returnDurationMinutes) {
      const { data: observations, error: observationError } = await supabase.from("price_snapshots").select("id,departure_date,return_date,price,currency,scanned_at,max_stops,metadata")
        .eq("route_id", routeId).eq("departure_date", offer.departureDate).eq("return_date", offer.returnDate)
        .gte("scanned_at", new Date(now - 7 * 86400000).toISOString()).order("scanned_at", { ascending: false }).limit(100);
      if (observationError) throw new Error("Could not verify missing fare duration");
      const matchingTimes = (observations || []).filter((other) => ["outbound_departure_at", "outbound_arrival_at", "return_departure_at", "return_arrival_at"].every((key) => row.metadata?.[key] && row.metadata[key] === other.metadata?.[key]));
      const known = matchingTimes.flatMap((other) => { try { return [toCreatelloInboxOffer({ id: other.id, originAirport: offer.originAirport,
        destinationAirport: fare.destinationAirport, destinationCity: fare.destinationCity, departureDate: other.departure_date, returnDate: other.return_date,
        price: Number(other.price), currency: other.currency, maxStops: other.max_stops, scannedAt: other.scanned_at, metadata: other.metadata }, "en")]; } catch { return []; } });
      current = completeDurations(current, known);
    }
    // A cache/snapshot inconsistency is transient, never permission to send stale content.
    if (Math.round(fare.dealPrice * 100) !== current.priceMinor) throw new Error("Public fare cache changed during validation");
    const changes = differences(offer, current);
    if (!sameFixedOffer(offer, current)) { fixedDifferences = changes; continue; }
    if (conditionKeys.some((key) => normalized(key, current[key]) === null)) { incomplete = true; incompleteDifferences = changes; continue; }
    alternatives.push({ fareId: fare.id, offer: current, differences: changes });
    if (conditionKeys.some((key) => normalized(key, offer[key]) !== normalized(key, current[key]))) continue;
    matched = { quote: { itineraryKey: offer.itineraryKey, priceMinor: current.priceMinor,
      currency: current.currency, fareId: fare.id,
      url: `https://www.352flights.com${getLocalizedDestinationPath("en", slug)}?fare=${encodeURIComponent(fare.id)}`,
      checkedAt: new Date(now).toISOString() } };
  }
  return matched ? { ...matched, alternatives } : { reason: incomplete && !alternatives.length ? "insufficient_information" : "conditions_changed", alternatives, differences: alternatives[0]?.differences || (incompleteDifferences.length ? incompleteDifferences : fixedDifferences) };
};
