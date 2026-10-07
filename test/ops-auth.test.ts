import assert from "node:assert/strict";
import test from "node:test";
import { isOpsAuthorized, ensureOpsAuthorized } from "../lib/ops-auth";
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
