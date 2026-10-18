import assert from "node:assert/strict";
import test from "node:test";
import {
  deliveryModeMatches,
  weeklyPeriodStart,
  weeklySkipReason,
  eligibleWeeklyDeals,
  bestWeeklyDeals,
} from "../lib/campaign-delivery";
const now = new Date("2026-09-28T07:00:00Z");
const deal = {
  id: "1",
  score: 80,
  dealPrice: 60,
  destinationAirport: "LIS",
  createdAt: "2026-09-25T12:00:00Z",
  verifiedAt: "2026-09-25T12:00:00Z",
  departureDate: "2026-10-10",
  status: "sent",
};

test("weekly-only subscribers receive weekly best-of, excluding daily and flash", () => {
  assert.equal(deliveryModeMatches("weekly", ["weekly_best_of"]), true);
  assert.equal(deliveryModeMatches("digest", ["weekly_best_of"]), false);
  assert.equal(deliveryModeMatches("flash", ["weekly_best_of"]), false);
  assert.equal(deliveryModeMatches("weekly", ["daily_digest"]), false);
});
test("week keys survive year boundaries and DST changes", () => {
  for (const [date, start] of [
    ["2027-01-03", "2026-12-28"],
    ["2027-01-04", "2027-01-04"],
    ["2026-10-25", "2026-10-19"],
    ["2026-10-26", "2026-10-26"],
  ])
    assert.equal(weeklyPeriodStart(date), start);
});
test("weekly schedule respects pause, Monday time, catch-up and permanent weekly guard", () => {
  const input = {
    enabled: true,
    localDate: "2026-09-28",
    localTime: "09:05",
    nowTime: "09:00",
    lastWeeklySentOn: null,
  };
  assert.match(weeklySkipReason(input)!, /scheduled/);
  assert.equal(weeklySkipReason({ ...input, nowTime: "09:17" }), null);
  assert.equal(weeklySkipReason({ ...input, localDate: "2026-09-29" }), null);
  assert.match(weeklySkipReason({ ...input, enabled: false })!, /disabled/);
  assert.match(
    weeklySkipReason({
      ...input,
      force: true,
      lastWeeklySentOn: "2026-09-28",
    })!,
    /already sent/,
  );
});
test("weekly includes sent offers but excludes unreviewed, stale, expired and past flights", () => {
  const invalid = [
    { status: "new" },
    { status: "expired" },
    { departureDate: "2026-09-28" },
    { verifiedAt: "2026-09-01T00:00:00Z" },
    { createdAt: "2026-09-01T00:00:00Z" },
    { verifiedAt: null },
  ];
  assert.deepEqual(
    eligibleWeeklyDeals(
      [
        deal,
        ...invalid.map((change, i) => ({ ...deal, id: `bad-${i}`, ...change })),
      ],
      now,
    ),
    [deal],
  );
});
test("best-of chooses at most six destinations after preference matching", () => {
  const fares = Array.from({ length: 10 }, (_, i) => ({
    ...deal,
    id: String(i),
    destinationAirport: `X${i}`,
    score: i,
  }));
  fares.push({ ...fares[9], id: "cheaper", dealPrice: 40 });
  const selected = bestWeeklyDeals(fares);
  assert.equal(selected.length, 6);
  assert.equal(selected[0].id, "cheaper");
  assert.equal(new Set(selected.map((d) => d.destinationAirport)).size, 6);
});
