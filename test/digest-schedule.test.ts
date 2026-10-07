import assert from "node:assert/strict";
import test from "node:test";
import { digestSkipReason } from "../lib/digest-schedule";
const due = { enabled: true, localTime: "09:05", nowTime: "09:17", localDate: "2026-09-10", lastDigestSentOn: null };
test("manual and scheduled retries cannot bypass last_digest_sent_on", () => {
  for (const force of [false, true]) assert.match(digestSkipReason({ ...due, lastDigestSentOn: due.localDate, force })!, /already sent/);
});
test("hourly checks honor arbitrary configured minutes and allow later retries", () => {
  assert.equal(digestSkipReason(due), null);
  assert.equal(digestSkipReason({ ...due, nowTime: "10:17" }), null);
  assert.match(digestSkipReason({ ...due, nowTime: "08:17" })!, /before/);
  assert.match(digestSkipReason({ ...due, enabled: false })!, /disabled/);
  assert.equal(digestSkipReason({ ...due, enabled: false, nowTime: "08:17", force: true }), null);
});
