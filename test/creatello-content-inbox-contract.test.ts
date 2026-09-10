import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  canonicalJson,
  createlloInboxPackageSchema,
  createlloInboxPayloadHash,
} from "../lib/creatello-content-inbox-contract";

const payload = createlloInboxPackageSchema.parse({
  schemaVersion: 1,
  eventId: "123e4567-e89b-42d3-a456-426614174000",
  externalId: "daily:2026-09-10:test",
  revision: 1,
  source: "352flights",
  language: "es",
  createdAt: "2026-09-10T08:00:00.000Z",
  offers: [{
    sourceSnapshotId: "price-snapshot:123",
    itineraryKey: "itin:stable-test-key",
    originAirport: "LUX",
    destinationAirport: "NCE",
    destinationCity: "Niza",
    departureDate: "2026-11-08",
    returnDate: "2026-11-15",
    priceMinor: 5800,
    currency: "EUR",
    tripType: "round_trip",
    adults: 1,
    cabin: "economy",
    stops: 0,
    checkedAt: "2026-09-10T08:00:00.000Z",
    expiresAt: "2026-09-11T08:00:00.000Z",
    sourcePageUrl: "https://www.352flights.com/deals/nice",
  }],
});

test("calculates the same canonical payload hash as Creatello", () => {
  const expected = createHash("sha256").update(canonicalJson(payload)).digest("hex");
  assert.equal(createlloInboxPayloadHash(payload), expected);
});

test("canonical payload hashes do not depend on object key insertion order", () => {
  const reordered = Object.fromEntries(Object.entries(payload).reverse());
  assert.equal(canonicalJson(reordered), canonicalJson(payload));
});
