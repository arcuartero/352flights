import assert from "node:assert/strict";
import test from "node:test";

import {
  DAILY_CREATELLO_TEMPLATES,
  dailyCreatelloCutoff,
  dailyCreatelloPackageSize,
  planDailyCreatelloPackages,
  prepareDailyCreatelloCandidates,
  selectMonthlyCreatelloCandidates,
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
    for (const slot of ["morning", "evening"] as const) {
      const first = dailyCreatelloPackageSize("2026-09-09", template, slot);
      const repeated = dailyCreatelloPackageSize("2026-09-09", template, slot);
      assert.equal(first, repeated);
      assert.ok(first >= 3 && first <= 5);
    }
  }
});

test("uses separate UTC cutoffs for the two daily delivery slots", () => {
  assert.equal(dailyCreatelloCutoff("2026-09-09", "morning").toISOString(), "2026-09-09T07:15:00.000Z");
  assert.equal(dailyCreatelloCutoff("2026-09-09", "evening").toISOString(), "2026-09-09T19:15:00.000Z");
});

test("plans one compatible package per template without repeated offers or destinations", () => {
  const result = planDailyCreatelloPackages({
    offers: Array.from({ length: 20 }, (_, index) => ({ ...offer(index + 1), departureDate: `2027-${["01","03","05"][index % 3]}-01`, returnDate: `2027-${["01","03","05"][index % 3]}-07` })),
    language: "es",
    dateKey: "2026-09-09",
    deliverySlot: "evening",
  });

  assert.equal(result.plans.length, 3);
  assert.equal(result.skipped.length, 0);
  const selected = result.plans.flatMap((plan) => plan.canonicalOffers);
  assert.equal(new Set(selected.map((item) => item.sourceSnapshotId)).size, selected.length);
  assert.equal(new Set(selected.map((item) => item.itineraryKey)).size, selected.length);
  assert.equal(new Set(selected.map((item) => item.destinationCity)).size, selected.length);
  for (const plan of result.plans) {
    if (plan.targetTemplate === "cheap-flights-tiktok") {
      assert.ok(plan.offers.length >= 9 && plan.offers.length <= 15);
      continue;
    }
    assert.equal(
      plan.offers.length,
      dailyCreatelloPackageSize("2026-09-09", plan.targetTemplate, "evening"),
    );
  }
});

test("monthly selection requires three months and produces stable distinct destinations", () => {
  const candidates = prepareDailyCreatelloCandidates(Array.from({ length: 18 }, (_, index) => ({ ...offer(index + 1), departureDate: `2027-${["01","03","05"][index % 3]}-01`, returnDate: `2027-${["01","03","05"][index % 3]}-07` })), "en");
  const result = selectMonthlyCreatelloCandidates(candidates, "2026-09-11:morning");
  assert.deepEqual(result, selectMonthlyCreatelloCandidates(candidates, "2026-09-11:morning"));
  const months = new Map<string, number>();
  for (const item of result.selected) { const month = item.canonical.departureDate.slice(0,7); months.set(month,(months.get(month)||0)+1); }
  assert.deepEqual([...months.keys()], ["2027-01","2027-03","2027-05"]);
  assert.ok([...months.values()].every(count=>count>=3 && count<=5));
  assert.equal(new Set(result.selected.map(item=>item.canonical.destinationCity)).size,result.selected.length);
  assert.equal(selectMonthlyCreatelloCandidates(candidates.filter(item=>!item.canonical.departureDate.startsWith("2027-05")), "seed").selected.length,0);
});

test("monthly matching reallocates a city shared across months instead of starving a later month", () => {
  const candidates = prepareDailyCreatelloCandidates(Array.from({length:12},(_,index)=>offer(index+1)),"en");
  candidates.forEach((item,index)=>{ item.canonical.departureDate=`2027-${["01","03","05"][Math.floor(index/4)]}-01`; });
  candidates[0].canonical.destinationCity=candidates[4].canonical.destinationCity;
  candidates[1].canonical.destinationCity=candidates[8].canonical.destinationCity;
  const result=selectMonthlyCreatelloCandidates(candidates,"seed");
  assert.ok(result.selected.length>=9);
  assert.equal(new Set(result.selected.map(item=>item.canonical.destinationCity)).size,result.selected.length);
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

test("treats different airports in the same city as one destination", () => {
  const offers = Array.from({ length: 8 }, (_, index) => offer(index + 1));
  offers[1] = { ...offers[1], destinationCity: offers[0].destinationCity };
  const result = planDailyCreatelloPackages({
    offers,
    language: "es",
    dateKey: "2026-09-12",
    templates: ["travel-offer"],
  });
  const cities = result.plans[0].canonicalOffers.map((item) => item.destinationCity);
  assert.equal(new Set(cities).size, cities.length);
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
