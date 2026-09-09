import { createHash } from "node:crypto";

import { z } from "zod";

import { getAirportCountryCode } from "@/lib/airport-countries";
import type { CreatelloLanguage, TikTokSourceOffer } from "@/lib/tiktok-carousel";

export const CREATELLO_INBOX_SCHEMA_VERSION = 1 as const;
export const CREATELLO_INBOX_SOURCE = "352flights" as const;
export const CREATELLO_INBOX_MAX_OFFERS = 20;
export const CREATELLO_INBOX_MAX_BYTES = 256 * 1024;
export const CREATELLO_INBOX_FRESHNESS_HOURS = 24;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Debe ser una fecha YYYY-MM-DD válida");
const timestampSchema = z.string().datetime({ offset: true });
const identifierSchema = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

export const createlloInboxOfferSchema = z.object({
  sourceSnapshotId: identifierSchema,
  itineraryKey: identifierSchema,
  originAirport: z.string().regex(/^[A-Z]{3}$/),
  originCity: z.string().trim().min(1).max(120).optional(),
  destinationAirport: z.string().regex(/^[A-Z]{3}$/),
  destinationCity: z.string().trim().min(1).max(120),
  destinationCountry: z.string().trim().min(1).max(120).optional(),
  destinationCountryCode: z.string().regex(/^[A-Z]{2}$/).optional(),
  departureDate: dateSchema,
  returnDate: dateSchema,
  priceMinor: z.number().int().nonnegative().max(100_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  tripType: z.literal("round_trip"),
  adults: z.number().int().min(1).max(20),
  cabin: z.enum(["economy", "premium_economy", "business", "first"]),
  stops: z.number().int().min(0).max(4),
  airline: z.string().trim().min(1).max(120).optional(),
  airlineCode: z.string().trim().min(2).max(3).regex(/^[A-Z0-9]+$/).optional(),
  outboundDepartureTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
  outboundArrivalTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
  returnDepartureTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
  returnArrivalTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
  outboundDurationMinutes: z.number().int().positive().max(3000).optional(),
  returnDurationMinutes: z.number().int().positive().max(3000).optional(),
  checkedAt: timestampSchema,
  expiresAt: timestampSchema,
  sourcePageUrl: z.string().url().max(2048).refine((value) => ["http:", "https:"].includes(new URL(value).protocol)),
}).strict().superRefine((offer, context) => {
  if (offer.returnDate < offer.departureDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["returnDate"],
      message: "Debe ser igual o posterior a departureDate",
    });
  }
  if (new Date(offer.expiresAt).getTime() < new Date(offer.checkedAt).getTime()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["expiresAt"],
      message: "Debe ser igual o posterior a checkedAt",
    });
  }
});

export const createlloInboxPackageSchema = z.object({
  schemaVersion: z.literal(CREATELLO_INBOX_SCHEMA_VERSION),
  eventId: z.string().uuid(),
  externalId: identifierSchema,
  revision: z.number().int().positive().max(2_147_483_647),
  source: z.literal(CREATELLO_INBOX_SOURCE),
  language: z.enum(["es", "en", "fr", "de", "pt"]),
  createdAt: timestampSchema,
  offers: z.array(createlloInboxOfferSchema).min(1).max(CREATELLO_INBOX_MAX_OFFERS),
}).strict();

export type CreatelloInboxPackage = z.infer<typeof createlloInboxPackageSchema>;

function metadataString(offer: TikTokSourceOffer, key: string) {
  const value = offer.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function metadataInteger(offer: TikTokSourceOffer, key: string) {
  const value = offer.metadata?.[key];
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function localTime(value: string | undefined) {
  const match = value?.match(/T(\d{2}:\d{2})(?::\d{2})?/);
  return match?.[1];
}

function canonicalCurrency(value: string) {
  const normalized = value.trim().toUpperCase();
  if (normalized === "€") return "EUR";
  if (normalized === "$") return "USD";
  if (normalized === "£") return "GBP";
  return normalized;
}

function readSearchContext(offer: TikTokSourceOffer) {
  const sourcePageUrl = metadataString(offer, "skyscanner_url");
  if (!sourcePageUrl) {
    throw new Error(`La oferta ${offer.id} no tiene una URL pública de origen.`);
  }

  let url: URL;
  try {
    url = new URL(sourcePageUrl);
  } catch {
    throw new Error(`La oferta ${offer.id} tiene una URL pública no válida.`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`La oferta ${offer.id} tiene una URL pública no válida.`);
  }

  const adults = Number(url.searchParams.get("adultsv2"));
  const rawCabin = url.searchParams.get("cabinclass")?.toLowerCase();
  const cabinAliases: Record<string, CreatelloInboxPackage["offers"][number]["cabin"]> = {
    economy: "economy",
    premiumeconomy: "premium_economy",
    premium_economy: "premium_economy",
    business: "business",
    first: "first",
  };
  const cabin = rawCabin ? cabinAliases[rawCabin] : undefined;
  if (!Number.isInteger(adults) || adults < 1 || adults > 20 || !cabin) {
    throw new Error(`La oferta ${offer.id} no identifica de forma fiable pasajeros y cabina.`);
  }

  return { adults, cabin, sourcePageUrl };
}

function stableUuid(value: string) {
  const bytes = Buffer.from(createHash("sha256").update(value).digest("hex").slice(0, 32), "hex");
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function stableKey(parts: Array<string | number>) {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

function countryName(countryCode: string, language: CreatelloLanguage) {
  return new Intl.DisplayNames([language], { type: "region" }).of(countryCode);
}

function toInboxOffer(offer: TikTokSourceOffer, language: CreatelloLanguage) {
  const outboundStops = metadataInteger(offer, "outbound_stop_count");
  const returnStops = metadataInteger(offer, "return_stop_count");
  if (outboundStops === undefined || returnStops === undefined) {
    throw new Error(`La oferta ${offer.id} no tiene el número real de escalas de ida y vuelta.`);
  }

  const { adults, cabin, sourcePageUrl } = readSearchContext(offer);
  const checkedAtDate = new Date(offer.scannedAt);
  if (!Number.isFinite(checkedAtDate.getTime())) {
    throw new Error(`La oferta ${offer.id} no tiene una fecha de comprobación válida.`);
  }
  const checkedAt = checkedAtDate.toISOString();
  const expiresAt = new Date(
    checkedAtDate.getTime() + CREATELLO_INBOX_FRESHNESS_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const destinationCountryCode = getAirportCountryCode(offer.destinationAirport);
  const destinationCountry = destinationCountryCode
    ? countryName(destinationCountryCode, language)
    : undefined;
  const airline = metadataString(offer, "airline_summary")
    ?? metadataString(offer, "primary_airline");
  const airlineCode = metadataString(offer, "primary_airline_code")?.toUpperCase();
  const outboundDepartureTime = localTime(metadataString(offer, "outbound_departure_at"));
  const outboundArrivalTime = localTime(metadataString(offer, "outbound_arrival_at"));
  const returnDepartureTime = localTime(metadataString(offer, "return_departure_at"));
  const returnArrivalTime = localTime(metadataString(offer, "return_arrival_at"));

  return createlloInboxOfferSchema.parse({
    sourceSnapshotId: `price-snapshot:${offer.id}`,
    itineraryKey: `itin:${stableKey([
      offer.originAirport.toUpperCase(),
      offer.destinationAirport.toUpperCase(),
      offer.departureDate,
      offer.returnDate,
      airlineCode ?? "unknown",
    ])}`,
    originAirport: offer.originAirport.toUpperCase(),
    ...(offer.originCity?.trim() ? { originCity: offer.originCity.trim() } : {}),
    destinationAirport: offer.destinationAirport.toUpperCase(),
    destinationCity: offer.destinationCity.trim(),
    ...(destinationCountry ? { destinationCountry } : {}),
    ...(destinationCountryCode ? { destinationCountryCode } : {}),
    departureDate: offer.departureDate,
    returnDate: offer.returnDate,
    priceMinor: Math.round(offer.price * 100),
    currency: canonicalCurrency(offer.currency),
    tripType: "round_trip",
    adults,
    cabin,
    stops: Math.max(outboundStops, returnStops),
    ...(airline ? { airline } : {}),
    ...(airlineCode ? { airlineCode } : {}),
    ...(outboundDepartureTime ? { outboundDepartureTime } : {}),
    ...(outboundArrivalTime ? { outboundArrivalTime } : {}),
    ...(returnDepartureTime ? { returnDepartureTime } : {}),
    ...(returnArrivalTime ? { returnArrivalTime } : {}),
    checkedAt,
    expiresAt,
    sourcePageUrl,
  });
}

export function buildCreatelloInboxPackage(
  offers: TikTokSourceOffer[],
  language: CreatelloLanguage,
  revision = 1,
) {
  if (offers.length < 1 || offers.length > CREATELLO_INBOX_MAX_OFFERS) {
    throw new Error(`Selecciona entre 1 y ${CREATELLO_INBOX_MAX_OFFERS} ofertas.`);
  }
  if (new Set(offers.map((offer) => offer.id)).size !== offers.length) {
    throw new Error("La selección contiene ofertas duplicadas.");
  }

  const identity = `${language}:${offers.map((offer) => offer.id).join(":")}`;
  const externalId = `editorial:${stableKey([identity])}`;
  const createdAt = new Date(
    Math.max(...offers.map((offer) => new Date(offer.scannedAt).getTime())),
  ).toISOString();

  return createlloInboxPackageSchema.parse({
    schemaVersion: CREATELLO_INBOX_SCHEMA_VERSION,
    eventId: stableUuid(`${externalId}:${revision}`),
    externalId,
    revision,
    source: CREATELLO_INBOX_SOURCE,
    language,
    createdAt,
    offers: offers.map((offer) => toInboxOffer(offer, language)),
  });
}
