import { getPublicCityDealsPageData } from "./ops";
import { toDestinationSlug, matchesDestinationSlug } from "./destination-slugs";
import { getLocalizedDestinationPath } from "./locales";
import { toCreatelloInboxOffer } from "./creatello-content-inbox-contract";
import type { PublicQuoteResolver, RevalidationRequest } from "./creatello-revalidation";

type Offer = RevalidationRequest["offers"][number];
const conditionKeys = ["adults", "cabin", "stops", "airlineCode", "outboundDepartureTime", "outboundArrivalTime", "returnDepartureTime", "returnArrivalTime", "outboundDurationMinutes", "returnDurationMinutes"] as const;

// Use the exact destination-page cache and selected fares, not a latest-row approximation.
// Strict mode deliberately does not turn a database failure into an empty successful page.
export const resolvePublicQuote: PublicQuoteResolver = async (offer, routeId, supabase, now) => {
  const slug = toDestinationSlug(offer.destinationCity);
  const page = await getPublicCityDealsPageData(slug, { strict: true });
  const candidates = page.deals.filter((fare) => matchesDestinationSlug(fare.destinationCity, slug)
    && fare.destinationAirport === offer.destinationAirport
    && fare.departureDate === offer.departureDate && fare.returnDate === offer.returnDate);
  if (!candidates.length) return { reason: "not_visible_on_web" };
  for (const fare of candidates) {
    const id = /^fare-(\d+)$/.exec(fare.id)?.[1];
    if (!id) continue;
    const { data: row, error } = await supabase.from("price_snapshots")
      .select("id,route_id,departure_date,return_date,price,currency,scanned_at,max_stops,metadata")
      .eq("id", Number(id)).maybeSingle();
    if (error) throw new Error("Could not verify public fare conditions");
    if (!row || row.route_id !== routeId) continue;
    let current: Offer;
    try {
      current = toCreatelloInboxOffer({ id: row.id, originAirport: offer.originAirport,
        destinationAirport: fare.destinationAirport, destinationCity: fare.destinationCity,
        departureDate: row.departure_date, returnDate: row.return_date,
        price: Number(row.price), currency: row.currency, maxStops: row.max_stops,
        scannedAt: row.scanned_at, metadata: row.metadata }, "en");
    } catch { continue; } // Missing conditions are not evidence of an identical itinerary.
    if (conditionKeys.some((key) => offer[key] !== current[key])) continue;
    if (current.currency !== offer.currency) return { reason: "currency_changed" };
    // A cache/snapshot inconsistency is transient, never permission to send stale content.
    if (Math.round(fare.dealPrice * 100) !== current.priceMinor) throw new Error("Public fare cache changed during validation");
    return { quote: { itineraryKey: offer.itineraryKey, priceMinor: current.priceMinor,
      currency: current.currency, fareId: fare.id,
      url: `https://www.352flights.com${getLocalizedDestinationPath("en", slug)}?fare=${encodeURIComponent(fare.id)}`,
      checkedAt: new Date(now).toISOString() } };
  }
  return { reason: "conditions_changed" };
};
