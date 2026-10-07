import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { isOpsAuthorized, ensureOpsAuthorized } from "../lib/ops-auth";
import { middleware } from "../middleware";
const credentials = { user: "opérateur", password: "páss:with:colons" };
const basic = (value: string) =>
  `Basic ${Buffer.from(value).toString("base64")}`;

test("ops fails closed when either credential is missing", () => {
  for (const config of [
    { user: undefined, password: undefined },
    { user: "user", password: "" },
    { user: "", password: "pass" },
  ]) {
    assert.equal(isOpsAuthorized(basic("user:pass"), config), false);
  }
});
test("ops rejects missing, malformed and incorrect authentication", () => {
  for (const header of [
    null,
    "Bearer token",
    "Basic !!!",
    "Basic YQ=",
    basic("wrong:pass"),
    basic("opérateur:wrong"),
    basic("opérateur"),
  ]) {
    assert.equal(isOpsAuthorized(header, credentials), false);
  }
});
test("ops supports UTF-8, colon-containing passwords and case-insensitive scheme", () => {
  const header = basic(`${credentials.user}:${credentials.password}`);
  assert.equal(isOpsAuthorized(header, credentials), true);
  assert.equal(
    isOpsAuthorized(header.replace("Basic", "basic"), credentials),
    true,
  );
});
test("unauthorized responses are private and request Basic authentication", () => {
  const result = ensureOpsAuthorized(
    new Request("https://example.test/api/ops/scanner-status"),
  );
  assert.equal(result?.status, 401);
  assert.match(result!.headers.get("Cache-Control")!, /no-store/);
  assert.match(result!.headers.get("WWW-Authenticate")!, /Basic/);
});

test("ops pages and API fail closed and require matching credentials", () => {
  const user = process.env.OPS_BASIC_AUTH_USER;
  const password = process.env.OPS_BASIC_AUTH_PASSWORD;
  try {
    for (const pathname of ["/ops", "/ops/analytics", "/api/ops/analytics", "/api/ops/cookie-banner"]) {
      const request = (value?: string) => new NextRequest(`https://example.test${pathname}`, {
        headers: value ? { authorization: value } : {},
      });
      delete process.env.OPS_BASIC_AUTH_USER;
      delete process.env.OPS_BASIC_AUTH_PASSWORD;
      assert.equal(ensureOpsAuthorized(request())?.status, 401);
      assert.equal(middleware(request()).status, 401);
      process.env.OPS_BASIC_AUTH_USER = "test-ops";
      assert.equal(ensureOpsAuthorized(request())?.status, 401);
      assert.equal(middleware(request()).status, 401);
      process.env.OPS_BASIC_AUTH_PASSWORD = "test:password";
      for (const invalid of [undefined, "Basic %%%", basic("test-ops:wrong"), "Bearer test"]) {
        assert.equal(ensureOpsAuthorized(request(invalid))?.status, 401);
        assert.equal(middleware(request(invalid)).status, 401);
      }
      const valid = request(basic("test-ops:test:password"));
      assert.equal(ensureOpsAuthorized(valid), null);
      assert.equal(middleware(valid).status, 200);
      assert.match(middleware(valid).headers.get("cache-control") ?? "", /no-store/);
    }
    assert.equal(middleware(new NextRequest("https://example.test/")).status, 200);
  } finally {
    if (user === undefined) delete process.env.OPS_BASIC_AUTH_USER;
    else process.env.OPS_BASIC_AUTH_USER = user;
    if (password === undefined) delete process.env.OPS_BASIC_AUTH_PASSWORD;
    else process.env.OPS_BASIC_AUTH_PASSWORD = password;
  }
});
