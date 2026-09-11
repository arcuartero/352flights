import { createHmac, timingSafeEqual } from "node:crypto";
import type { CreatelloInboxPackage } from "./creatello-content-inbox-contract";

export type Offer = CreatelloInboxPackage["offers"][number];
export const fixedKeys = ["originAirport", "destinationAirport", "departureDate", "returnDate", "adults", "cabin", "currency"] as const;
export const conditionKeys = ["adults", "cabin", "stops", "airlineCode", "outboundDepartureTime", "outboundArrivalTime", "returnDepartureTime", "returnArrivalTime", "outboundDurationMinutes", "returnDurationMinutes"] as const;
export function normalized(field: string, value: unknown): string | number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return value;
  const text = String(value).trim();
  if (!text) return null;
  if (/Time$/.test(field) && /^\d{1,2}:\d{2}(?::00)?$/.test(text)) return text.split(":").slice(0, 2).map((v) => v.padStart(2, "0")).join(":");
  if (["adults", "stops"].includes(field) || /Minutes$/.test(field)) return Number.isFinite(Number(text)) ? Number(text) : null;
  return text.replace(/\s+/g, " ").toUpperCase();
}
export function differences(before: Offer, after: Offer) {
  return [...fixedKeys, ...conditionKeys, "priceMinor" as const].filter((field, index, all) => all.indexOf(field) === index)
    .filter((field) => normalized(field, before[field]) !== normalized(field, after[field]))
    .map((field) => ({ field, before: before[field] ?? null, after: after[field] ?? null }));
}
export function sameFixedOffer(before: Offer, after: Offer) {
  return fixedKeys.every((key) => normalized(key, before[key]) !== null && normalized(key, before[key]) === normalized(key, after[key]));
}
export function conditionFingerprint(offer: Offer) {
  return JSON.stringify([...fixedKeys, ...conditionKeys].map((key) => [key, normalized(key, offer[key])]));
}
// Fill missing duration only from observations of the exact same itinerary, never from the package.
export function completeDurations(offer: Offer, observations: Offer[]) {
  const result = { ...offer };
  const identity = [...fixedKeys, ...conditionKeys.filter((key) => !key.endsWith("DurationMinutes"))];
  const matches = observations.filter((other) => identity.every((key) => normalized(key, offer[key]) !== null && normalized(key, offer[key]) === normalized(key, other[key])));
  for (const key of ["outboundDurationMinutes", "returnDurationMinutes"] as const) {
    const values = new Set(matches.map((o) => o[key]).filter((v): v is number => typeof v === "number"));
    if (result[key] === undefined && values.size === 1) result[key] = [...values][0];
  }
  return result;
}
export function signAcceptedOffer(payloadHash: string, itineraryKey: string, offer: Offer, secret: string) {
  const canonical = Object.fromEntries(Object.entries(offer).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)));
  return createHmac("sha256", secret).update(JSON.stringify(["accepted-offer-v1", payloadHash, itineraryKey, canonical])).digest("hex");
}
export function verifyAcceptedOffer(payloadHash: string, itineraryKey: string, offer: Offer, signature: string, secret: string) {
  const expected = signAcceptedOffer(payloadHash, itineraryKey, offer, secret);
  return /^[a-f0-9]{64}$/.test(signature) && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
