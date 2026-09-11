import assert from "node:assert/strict";
import test from "node:test";
import { departureDeadline, assertPackageTravelValidity } from "../lib/creatello-travel-validity";
import { revalidateCreatelloOffers, revalidationRequestSchema } from "../lib/creatello-revalidation";

const now = Date.parse("2026-09-11T06:00:00Z");
const input = revalidationRequestSchema.parse({ source: "352flights", externalId: "editorial:test", revision: 1, payloadHash: "a".repeat(64), offers: [{
  sourceSnapshotId: "price-snapshot:123", itineraryKey: "itin:123", originAirport: "LUX", destinationAirport: "NCE", destinationCity: "Nice",
  departureDate: "2026-11-08", returnDate: "2026-11-15", priceMinor: 5800, currency: "EUR", tripType: "round_trip", adults: 1, cabin: "economy", stops: 0,
  checkedAt: "2026-09-01T00:00:00Z", expiresAt: "2026-09-02T00:00:00Z", sourcePageUrl: "https://www.352flights.com/deals/nice",
}] });
function fakeDb(results: Array<{ data: unknown; error?: unknown }>) {
  const query = { select: () => query, eq: () => query, order: () => query, limit: () => query, maybeSingle: async () => results.shift() };
  return { from: () => query } as unknown as NonNullable<Parameters<typeof revalidateCreatelloOffers>[1]>;
}
const fixtures = () => [
  { data: null },
  { data: { id: 123, route_id: "route", departure_date: "2026-11-08", return_date: "2026-11-15" } },
  { data: { origin_airport: "LUX", destination_airport: "NCE", is_active: true } },
  { data: { price: 99, currency: "EUR", scanned_at: "2026-09-01T00:00:00Z" } },
];
test("midnight Luxembourg is DST-aware, including transition dates", () => {
  for (const [day, utc] of [["2026-01-15", "2026-01-14T23:00:00.000Z"], ["2026-07-15", "2026-07-14T22:00:00.000Z"], ["2026-03-29", "2026-03-28T23:00:00.000Z"], ["2026-10-25", "2026-10-24T22:00:00.000Z"]]) {
    assert.equal(departureDeadline(day), utc);
    const payload = { offers: [{ departureDate: "2027-05-01" }, { departureDate: day }] };
    assert.doesNotThrow(() => assertPackageTravelValidity(payload, Date.parse(utc) - 60000, 0));
    assert.throws(() => assertPackageTravelValidity(payload, utc, 0), { code: "package_travel_period_ended" });
  }
});
test("old snapshots and changed prices are observations, original package stays intact", async () => {
  const before = JSON.stringify(input);
  const result = await revalidateCreatelloOffers(input, fakeDb(fixtures()), now);
  assert.equal(result.valid, true);
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.observations?.map((o) => o.reason), ["stale", "price_changed"]);
  assert.equal(JSON.stringify(input), before);
});
test("missing latest offer still blocks", async () => {
  const rows = fixtures(); rows[3] = { data: null };
  const result = await revalidateCreatelloOffers(input, fakeDb(rows), now);
  assert.equal(result.valid, false);
  assert.equal(result.reasons[0].reason, "unavailable");
});
test("departure day blocks even with an unexpired legacy expiresAt", async () => {
  const result = await revalidateCreatelloOffers(input, fakeDb([{ data: null }]), Date.parse(departureDeadline("2026-11-08")));
  assert.equal(result.reasons[0].reason, "departure_passed");
});
test("database failures are thrown, never reported as available or unavailable", async () => {
  for (let index = 0; index < 4; index++) {
    const rows: Array<{ data: unknown; error?: unknown }> = fixtures();
    rows[index] = { data: null, error: { message: "Database unavailable" } };
    await assert.rejects(revalidateCreatelloOffers(input, fakeDb(rows), now));
  }
});
