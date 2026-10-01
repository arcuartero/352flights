import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { ensureOpsAuthorized } from "../lib/ops-auth";
import { middleware } from "../middleware";

test("ops pages and API fail closed and require matching credentials", () => {
  const user = process.env.OPS_BASIC_AUTH_USER;
  const password = process.env.OPS_BASIC_AUTH_PASSWORD;
  const request = (value?: string) => new NextRequest("https://352flights.com/ops", {
    headers: value ? { authorization: value } : {},
  });
  const basic = (value: string) => `Basic ${Buffer.from(value).toString("base64")}`;
  try {
    delete process.env.OPS_BASIC_AUTH_USER;
    delete process.env.OPS_BASIC_AUTH_PASSWORD;
    assert.equal(ensureOpsAuthorized(request())?.status, 401);
    assert.equal(middleware(request()).status, 401);
    process.env.OPS_BASIC_AUTH_USER = "test-ops";
    assert.equal(ensureOpsAuthorized(request())?.status, 401);
    process.env.OPS_BASIC_AUTH_PASSWORD = "test:password";
    for (const invalid of [undefined, "Basic %%%", basic("test-ops:wrong"), "Bearer test"]) {
      assert.equal(ensureOpsAuthorized(request(invalid))?.status, 401);
      assert.equal(middleware(request(invalid)).status, 401);
    }
    const valid = request(basic("test-ops:test:password"));
    assert.equal(ensureOpsAuthorized(valid), null);
    assert.equal(middleware(valid).status, 200);
    assert.match(middleware(valid).headers.get("cache-control") ?? "", /no-store/);
    assert.equal(middleware(new NextRequest("https://352flights.com/")).status, 200);
  } finally {
    if (user === undefined) delete process.env.OPS_BASIC_AUTH_USER;
    else process.env.OPS_BASIC_AUTH_USER = user;
    if (password === undefined) delete process.env.OPS_BASIC_AUTH_PASSWORD;
    else process.env.OPS_BASIC_AUTH_PASSWORD = password;
  }
});
