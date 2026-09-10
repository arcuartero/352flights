import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  createlloInboxOfferSchema,
  createlloInboxPackageSchema,
  createlloInboxPayloadHash,
} from "@/lib/creatello-content-inbox-contract";
import { getCreatelloRevalidationEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase";

export const revalidationRequestSchema = z.object({
  source: z.literal("352flights"),
  externalId: z.string().min(1).max(160),
  revision: z.number().int().positive(),
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
  offers: z.array(createlloInboxOfferSchema).min(1).max(20),
}).strict();

export type RevalidationRequest = z.infer<typeof revalidationRequestSchema>;
export type RevalidationReason = { itineraryKey: string; reason: "price_changed" | "unavailable" | "not_found" | "stale" | "route_changed" | "dates_changed" | "currency_changed" };

export function verifyRevalidationSignature(rawBody: string, timestamp: string | null, signature: string | null, secret: string, now = Date.now()) {
  if (!timestamp || !signature || !/^\d{10,13}$/.test(timestamp)) return false;
  const timestampMs = timestamp.length === 10 ? Number(timestamp) * 1000 : Number(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > 5 * 60_000) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function revalidateCreatelloOffers(input: RevalidationRequest): Promise<{ valid: boolean; reasons: RevalidationReason[] }> {
  const supabase = getSupabaseAdminClient();
  const reasons: RevalidationReason[] = [];
  const { data: delivery } = await supabase.from("creatello_daily_deliveries")
    .select("payload")
    .eq("payload->>externalId", input.externalId)
    .eq("payload->>revision", String(input.revision))
    .maybeSingle();
  const storedPayload = delivery
    ? createlloInboxPackageSchema.safeParse(delivery.payload)
    : null;
  if (storedPayload && !storedPayload.success) {
    return { valid: false, reasons: input.offers.map((offer) => ({ itineraryKey: offer.itineraryKey, reason: "not_found" as const })) };
  }
  if (storedPayload?.success && createlloInboxPayloadHash(storedPayload.data) !== input.payloadHash) {
    return { valid: false, reasons: input.offers.map((offer) => ({ itineraryKey: offer.itineraryKey, reason: "not_found" as const })) };
  }

  for (const offer of input.offers) {
    const match = /^price-snapshot:(\d+)$/.exec(offer.sourceSnapshotId);
    if (!match) { reasons.push({ itineraryKey: offer.itineraryKey, reason: "not_found" }); continue; }
    const { data: original } = await supabase.from("price_snapshots")
      .select("id,route_id,departure_date,return_date,price,currency,scanned_at")
      .eq("id", Number(match[1])).maybeSingle();
    if (!original) { reasons.push({ itineraryKey: offer.itineraryKey, reason: "not_found" }); continue; }
    const { data: route } = await supabase.from("scanned_routes")
      .select("origin_airport,destination_airport")
      .eq("id", original.route_id).maybeSingle();
    if (!route || route.origin_airport !== offer.originAirport || route.destination_airport !== offer.destinationAirport) {
      reasons.push({ itineraryKey: offer.itineraryKey, reason: "route_changed" }); continue;
    }
    if (original.departure_date !== offer.departureDate || original.return_date !== offer.returnDate) {
      reasons.push({ itineraryKey: offer.itineraryKey, reason: "dates_changed" }); continue;
    }
    const { data: latest } = await supabase.from("price_snapshots")
      .select("price,currency,scanned_at")
      .eq("route_id", original.route_id)
      .eq("departure_date", offer.departureDate)
      .eq("return_date", offer.returnDate)
      .eq("metadata->>public_fare_eligible", "true")
      .order("scanned_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
    if (!latest) { reasons.push({ itineraryKey: offer.itineraryKey, reason: "unavailable" }); continue; }
    if (Date.now() - new Date(latest.scanned_at).getTime() > 24 * 60 * 60_000) { reasons.push({ itineraryKey: offer.itineraryKey, reason: "stale" }); continue; }
    if (latest.currency !== offer.currency) { reasons.push({ itineraryKey: offer.itineraryKey, reason: "currency_changed" }); continue; }
    if (Math.round(Number(latest.price) * 100) !== offer.priceMinor) { reasons.push({ itineraryKey: offer.itineraryKey, reason: "price_changed" }); }
  }
  return { valid: reasons.length === 0, reasons };
}

export function getRevalidationSecret() {
  return getCreatelloRevalidationEnv().CREATELLO_352_REVALIDATION_HMAC_SECRET;
}
