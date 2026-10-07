import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicDealsSearchResult } from "../lib/public-deals-query";
import { DEFAULT_DEAL_SEARCH_FILTERS } from "../lib/public-deals-search";
import type { CampaignPreviewDeal } from "../lib/ops-shared";
import type { PublicDealsPageData } from "../lib/ops/types";
const now = new Date("2026-09-25T12:00:00Z");
const deals = Array.from(
  { length: 280 },
  (_, i) =>
    ({
      id: String(i).padStart(3, "0"),
      dealPrice: 50,
      score: 100,
      destinationAirport: "LIS",
      destinationCity: "Lisbon",
      departureDate: "2026-10-15",
      returnDate: "2026-10-19",
      tripNights: 4,
      maxStops: "NON_STOP",
      routeLabel: "LUX → LIS",
      airlineSummary: "Luxair",
      primaryAirlineCode: "LG",
      verifiedAt: now.toISOString(),
      routeBucket: "weekend_europe",
      destinationStayHours: 96,
      outboundStopCount: 0,
      returnStopCount: 0,
    }) as CampaignPreviewDeal,
);
const data: PublicDealsPageData = {
  configured: true,
  schemaReady: true,
  onboardingMessage: null,
  deals: [...deals].reverse(),
  sections: [],
  updatedAt: now.toISOString(),
};

test("all 280 fares can be loaded in bounded pages without omissions or duplicates", () => {
  const ids: string[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const page = buildPublicDealsSearchResult(
      data,
      DEFAULT_DEAL_SEARCH_FILTERS,
      "price_asc",
      50,
      now,
      offset,
    );
    assert.equal(page.total, 280);
    assert.ok(page.deals.length <= 50);
    ids.push(...page.deals.map((d) => d.id));
    offset = page.nextOffset;
  }
  assert.deepEqual(
    ids,
    deals.map((d) => d.id),
  );
  assert.equal(new Set(ids).size, 280);
});
test("the 200 limit applies per request, with a final page of 80", () => {
  const first = buildPublicDealsSearchResult(
    data,
    DEFAULT_DEAL_SEARCH_FILTERS,
    "price_asc",
    9999,
    now,
  );
  const second = buildPublicDealsSearchResult(
    data,
    DEFAULT_DEAL_SEARCH_FILTERS,
    "price_asc",
    200,
    now,
    first.nextOffset!,
  );
  assert.equal(first.deals.length, 200);
  assert.equal(second.deals.length, 80);
  assert.equal(second.nextOffset, null);
});
test("empty, past-end and filtered searches terminate and carry distinct query keys", () => {
  const page = buildPublicDealsSearchResult(
    data,
    DEFAULT_DEAL_SEARCH_FILTERS,
    "best",
    10,
    now,
    999,
  );
  const filtered = buildPublicDealsSearchResult(
    data,
    { ...DEFAULT_DEAL_SEARCH_FILTERS, priceMax: 20 },
    "best",
    10,
    now,
  );
  assert.equal(page.deals.length, 0);
  assert.equal(page.nextOffset, null);
  assert.equal(filtered.total, 0);
  assert.equal(filtered.nextOffset, null);
  assert.notEqual(filtered.queryKey, page.queryKey);
});
