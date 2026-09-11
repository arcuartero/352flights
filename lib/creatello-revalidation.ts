import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  createlloInboxOfferSchema,
  createlloInboxPackageSchema,
  createlloInboxPayloadHash,
} from "@/lib/creatello-content-inbox-contract";
import { getCreatelloRevalidationEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { departureDeadline } from "./creatello-travel-validity";
import { differences, sameFixedOffer, signAcceptedOffer, verifyAcceptedOffer } from "./creatello-offer-comparison";

export const revalidationRequestSchema = z.object({
  source: z.literal("352flights"),
  externalId: z.string().min(1).max(160),
  revision: z.number().int().positive(),
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
  offers: z.array(createlloInboxOfferSchema).min(1).max(20),
  policy: z.literal("public_web_v1").optional(),
  review: z.boolean().optional(),
  acceptedOffers: z.array(z.object({ itineraryKey: z.string(), offer: createlloInboxOfferSchema, signature: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).max(20).optional(),
}).strict();

export type RevalidationRequest = z.infer<typeof revalidationRequestSchema>;
export type RevalidationReason = { itineraryKey: string; reason: "unavailable" | "not_found" | "route_changed" | "dates_changed" | "currency_changed" | "departure_passed" | "not_visible_on_web" | "conditions_changed" | "insufficient_information"; city?: string; differences?: ReturnType<typeof differences> };
export type RevalidationObservation = { itineraryKey: string; reason: "stale" | "price_changed" };
export type PublicQuote = { itineraryKey: string; priceMinor: number; currency: string; fareId: string; url: string; checkedAt: string };
export type Alternative = { fareId: string; offer: RevalidationRequest["offers"][number]; differences: ReturnType<typeof differences>; signature?: string };
export type PublicQuoteResult = ({ quote: PublicQuote } | { reason: RevalidationReason["reason"] }) & { alternatives?: Alternative[]; differences?: ReturnType<typeof differences> };
export type PublicQuoteResolver = (offer: RevalidationRequest["offers"][number], routeId: number, supabase: ReturnType<typeof getSupabaseAdminClient>, now: number) => Promise<PublicQuoteResult>;
const resolvePublicQuote: PublicQuoteResolver = async (...args) => (await import("./creatello-public-quote")).resolvePublicQuote(...args);

export function verifyRevalidationSignature(rawBody: string, timestamp: string | null, signature: string | null, secret: string, now = Date.now()) {
  if (!timestamp || !signature || !/^\d{10,13}$/.test(timestamp)) return false;
  const timestampMs = timestamp.length === 10 ? Number(timestamp) * 1000 : Number(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > 5 * 60_000) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function revalidateCreatelloOffers(input: RevalidationRequest, supabase = getSupabaseAdminClient(), now = Date.now(), quoteResolver = resolvePublicQuote): Promise<{ valid: boolean; reasons: RevalidationReason[]; observations?: RevalidationObservation[]; quotes?: PublicQuote[]; policy?: string; reviews?: { itineraryKey: string; city: string; before: RevalidationRequest["offers"][number]; alternatives: Alternative[] }[] }> {
  const reasons: RevalidationReason[] = [];
  const observations: RevalidationObservation[] = [];
  const quotes: PublicQuote[] = [];
  const reviews: { itineraryKey: string; city: string; before: RevalidationRequest["offers"][number]; alternatives: Alternative[] }[] = [];
  const { data: delivery, error: deliveryError } = await supabase.from("creatello_daily_deliveries")
    .select("payload")
    .eq("payload->>externalId", input.externalId)
    .eq("payload->>revision", String(input.revision))
    .maybeSingle();
  if (deliveryError) throw new Error("Could not read package identity");
  const storedPayload = delivery
    ? createlloInboxPackageSchema.safeParse(delivery.payload)
    : null;
  if (storedPayload && !storedPayload.success) {
    return { valid: false, reasons: input.offers.map((offer) => ({ itineraryKey: offer.itineraryKey, reason: "not_found" as const })) };
  }
  if (storedPayload?.success && createlloInboxPayloadHash(storedPayload.data) !== input.payloadHash) {
    return { valid: false, reasons: input.offers.map((offer) => ({ itineraryKey: offer.itineraryKey, reason: "not_found" as const })) };
  }
  if (storedPayload?.success && JSON.stringify(storedPayload.data.offers) !== JSON.stringify(input.offers)) {
    return { valid: false, reasons: input.offers.map((offer) => ({ itineraryKey: offer.itineraryKey, reason: "not_found" as const })) };
  }

  if (new Set(input.acceptedOffers?.map((value) => value.itineraryKey)).size !== (input.acceptedOffers?.length || 0)
    || input.acceptedOffers?.some((value) => !input.offers.some((offer) => offer.itineraryKey === value.itineraryKey))) throw new Error("Invalid accepted offer keys");
  for (const originalOffer of input.offers) {
    const accepted = input.acceptedOffers?.find((value) => value.itineraryKey === originalOffer.itineraryKey);
    if (accepted && (!sameFixedOffer(originalOffer, accepted.offer)
      || !verifyAcceptedOffer(input.payloadHash, originalOffer.itineraryKey, accepted.offer, accepted.signature, getRevalidationSecret()))) throw new Error("Invalid accepted offer signature");
    const offer = accepted ? { ...accepted.offer, itineraryKey: originalOffer.itineraryKey } : originalOffer;
    if (now >= Date.parse(departureDeadline(offer.departureDate))) {
      reasons.push({ itineraryKey: offer.itineraryKey, reason: "departure_passed" }); continue;
    }
    const match = /^price-snapshot:(\d+)$/.exec(offer.sourceSnapshotId);
    if (!match) { reasons.push({ itineraryKey: offer.itineraryKey, reason: "not_found" }); continue; }
    const { data: original, error: originalError } = await supabase.from("price_snapshots")
      .select("id,route_id,departure_date,return_date,price,currency,scanned_at")
      .eq("id", Number(match[1])).maybeSingle();
    if (originalError) throw new Error("Could not read original offer");
    if (!original) { reasons.push({ itineraryKey: offer.itineraryKey, reason: "not_found" }); continue; }
    const { data: route, error: routeError } = await supabase.from("scanned_routes")
      .select("origin_airport,destination_airport,is_active")
      .eq("id", original.route_id).maybeSingle();
    if (routeError) throw new Error("Could not read route");
    if (!route || route.origin_airport !== offer.originAirport || route.destination_airport !== offer.destinationAirport) {
      reasons.push({ itineraryKey: offer.itineraryKey, reason: "route_changed" }); continue;
    }
    if (route.is_active === false) { reasons.push({ itineraryKey: offer.itineraryKey, reason: "unavailable" }); continue; }
    if (original.departure_date !== offer.departureDate || original.return_date !== offer.returnDate) {
      reasons.push({ itineraryKey: offer.itineraryKey, reason: "dates_changed" }); continue;
    }
    if (input.policy === "public_web_v1") {
      const result = await quoteResolver(offer, original.route_id, supabase, now);
      if ("reason" in result) reasons.push({ itineraryKey: offer.itineraryKey, city: offer.destinationCity, reason: result.reason,
        differences: result.differences || result.alternatives?.[0]?.differences || [] });
      else {
        quotes.push(result.quote);
        if (result.quote.priceMinor !== offer.priceMinor) observations.push({ itineraryKey: offer.itineraryKey, reason: "price_changed" });
      }
      if (input.review) reviews.push({ itineraryKey: offer.itineraryKey, city: offer.destinationCity, before: offer,
        alternatives: (result.alternatives || []).map((alternative) => ({ ...alternative,
          signature: signAcceptedOffer(input.payloadHash, originalOffer.itineraryKey, alternative.offer, getRevalidationSecret()) })) });
      continue;
    }
    const { data: latest, error: latestError } = await supabase.from("price_snapshots")
      .select("price,currency,scanned_at")
      .eq("route_id", original.route_id)
      .eq("departure_date", offer.departureDate)
      .eq("return_date", offer.returnDate)
      .eq("metadata->>public_fare_eligible", "true")
      .order("scanned_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
    if (latestError) throw new Error("Could not read current offer");
    if (!latest) { reasons.push({ itineraryKey: offer.itineraryKey, reason: "unavailable" }); continue; }
    if (now - new Date(latest.scanned_at).getTime() > 24 * 60 * 60_000) { observations.push({ itineraryKey: offer.itineraryKey, reason: "stale" }); }
    if (latest.currency !== offer.currency) { reasons.push({ itineraryKey: offer.itineraryKey, reason: "currency_changed" }); continue; }
    if (Math.round(Number(latest.price) * 100) !== offer.priceMinor) { observations.push({ itineraryKey: offer.itineraryKey, reason: "price_changed" }); }
  }
  return { valid: reasons.length === 0, reasons, observations, ...(input.policy ? { policy: input.policy, quotes } : {}), ...(input.review ? { reviews } : {}) };
}

export function getRevalidationSecret() {
  return getCreatelloRevalidationEnv().CREATELLO_352_REVALIDATION_HMAC_SECRET;
}
