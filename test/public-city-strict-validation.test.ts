import "./helpers/server-runtime";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PublicDealsPageData } from "../lib/ops/types";

// Next supplies the cache at runtime; control that boundary without database calls.
test("strict city fare validation rejects failures while public pages retain their fallback", async (context) => {
  let cached: PublicDealsPageData;
  let cacheError: Error | undefined;
  context.mock.method(require("next/cache"), "unstable_cache", () => async () => {
    if (cacheError) throw cacheError;
    return cached;
  });
  const oldFlag = process.env.PUBLIC_FARE_REVALIDATION_ENABLED;
  process.env.PUBLIC_FARE_REVALIDATION_ENABLED = "false";
  context.mock.method(globalThis, "fetch", async () => {
    throw new Error("External requests are forbidden in this test");
  });
  context.mock.method(console, "error", () => {});
  try {
    const { getPublicCityDealsPageData, lastSuccessfulPublicCityDealsPageData } =
      await import("../lib/ops/public-data");
    const available: PublicDealsPageData = {
      configured: true, schemaReady: true, onboardingMessage: null,
      deals: [], sections: [], updatedAt: null,
    };
    cached = available;
    assert.deepEqual(await getPublicCityDealsPageData("madrid", { strict: true }), available);

    for (const state of [{ configured: false }, { schemaReady: false }]) {
      cached = { ...available, ...state };
      await assert.rejects(
        getPublicCityDealsPageData("madrid", { strict: true }),
        /Public fares are not available for validation/,
      );
      assert.deepEqual(await getPublicCityDealsPageData("madrid"), cached);
    }

    cacheError = new Error("Temporary fare database failure");
    lastSuccessfulPublicCityDealsPageData.set("madrid", available);
    await assert.rejects(getPublicCityDealsPageData("madrid", { strict: true }), cacheError);
    assert.deepEqual(await getPublicCityDealsPageData("madrid"), available);
  } finally {
    if (oldFlag === undefined) delete process.env.PUBLIC_FARE_REVALIDATION_ENABLED;
    else process.env.PUBLIC_FARE_REVALIDATION_ENABLED = oldFlag;
  }
});
