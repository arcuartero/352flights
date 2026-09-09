import assert from "node:assert/strict";
import test from "node:test";

import {
  DAILY_CREATELLO_TEMPLATES,
  dailyCreatelloPackageSize,
  planDailyCreatelloPackages,
  prepareDailyCreatelloCandidates,
} from "../lib/creatello-daily-selection";
import type { TikTokSourceOffer } from "../lib/tiktok-carousel";

const DESTINATIONS = [
  "NCE", "BCN", "MAD", "PMI", "AGP", "LIS", "OPO", "FAO", "FCO", "BGY",
  "NAP", "VCE", "BER", "MUC", "VIE", "BRU", "AMS", "DUB", "ZRH", "GVA",
] as const;

function offer(id: number): TikTokSourceOffer {
  const destination = DESTINATIONS[id - 1];
  return {
    id,
    originAirport: "LUX",
    originCity: "Luxemburgo",
    destinationAirport: destination,
    destinationCity: `Destino ${id}`,
    departureDate: `2026-11-${String(1 + (id % 20)).padStart(2, "0")}`,
    returnDate: `2026-11-${String(6 + (id % 20)).padStart(2, "0")}`,
    price: 30 + id,
    currency: "EUR",
    maxStops: "NON_STOP",
    scannedAt: "2026-09-09T06:30:00.000Z",
    metadata: {
      public_fare_eligible: true,
      outbound_stop_count: 0,
      return_stop_count: 0,
      airline_summary: `Airline ${id}`,
      primary_airline_code: "LG",
      outbound_departure_at: "2026-11-01T07:10",
      outbound_arrival_at: "2026-11-01T08:45",
      return_departure_at: "2026-11-06T19:30",
      return_arrival_at: "2026-11-06T21:05",
      outbound_duration_minutes: 95,
      return_duration_minutes: 95,
      skyscanner_url: `https://www.skyscanner.net/transport/flights/lux/${destination.toLowerCase()}/261101/261106/?adultsv2=1&cabinclass=economy`,
    },
  };
}

test("daily package sizes are deterministic and always between three and five", () => {
  for (const template of DAILY_CREATELLO_TEMPLATES) {
    const first = dailyCreatelloPackageSize("2026-09-09", template);
    const repeated = dailyCreatelloPackageSize("2026-09-09", template);
    assert.equal(first, repeated);
    assert.ok(first >= 3 && first <= 5);
  }
});

test("plans one compatible package per template without repeated offers or destinations", () => {
  const result = planDailyCreatelloPackages({
    offers: Array.from({ length: 20 }, (_, index) => offer(index + 1)),
    language: "es",
    dateKey: "2026-09-09",
  });

  assert.equal(result.plans.length, 3);
  assert.equal(result.skipped.length, 0);
  const selected = result.plans.flatMap((plan) => plan.canonicalOffers);
  assert.equal(new Set(selected.map((item) => item.sourceSnapshotId)).size, selected.length);
  assert.equal(new Set(selected.map((item) => item.itineraryKey)).size, selected.length);
  assert.equal(new Set(selected.map((item) => item.destinationAirport)).size, selected.length);
  for (const plan of result.plans) {
    assert.equal(plan.offers.length, dailyCreatelloPackageSize("2026-09-09", plan.targetTemplate));
  }
});

test("never selects an itinerary or snapshot already reserved", () => {
  const offers = Array.from({ length: 20 }, (_, index) => offer(index + 1));
  const canonical = prepareDailyCreatelloCandidates(offers, "es");
  const blocked = canonical[0].canonical;
  const result = planDailyCreatelloPackages({
    offers,
    language: "es",
    dateKey: "2026-09-10",
    usedItineraryKeys: [blocked.itineraryKey],
    usedSourceSnapshotIds: [blocked.sourceSnapshotId],
  });
  const selected = result.plans.flatMap((plan) => plan.canonicalOffers);
  assert.ok(selected.every((item) => item.itineraryKey !== blocked.itineraryKey));
  assert.ok(selected.every((item) => item.sourceSnapshotId !== blocked.sourceSnapshotId));
});

test("skips flight-deals-352 instead of inventing missing durations", () => {
  const offers = Array.from({ length: 8 }, (_, index) => {
    const item = offer(index + 1);
    delete item.metadata?.outbound_duration_minutes;
    delete item.metadata?.return_duration_minutes;
    return item;
  });
  const result = planDailyCreatelloPackages({
    offers,
    language: "es",
    dateKey: "2026-09-11",
    templates: ["flight-deals-352"],
  });
  assert.equal(result.plans.length, 0);
  assert.deepEqual(result.skipped[0], {
    targetTemplate: "flight-deals-352",
    requestedCount: dailyCreatelloPackageSize("2026-09-11", "flight-deals-352"),
    availableCount: 0,
    reason: "insufficient_compatible_offers",
  });
});
