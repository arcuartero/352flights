import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { POST } from "../app/api/csp-report/route";

const originalWarn = console.warn;
afterEach(() => {
  console.warn = originalWarn;
});

function capture() {
  const logged: unknown[] = [];
  console.warn = (_label: unknown, payload: unknown) => logged.push(payload);
  return logged;
}

const post = (body: string) =>
  POST(new Request("https://example.test/api/csp-report", { method: "POST", body }));

test("legacy and Reporting API payloads are logged without query strings", async () => {
  const logged = capture();
  assert.equal((await post(JSON.stringify({
    "csp-report": {
      "document-uri": "https://352flights.test/preferences?token=SUBSCRIBER-TOKEN",
      "effective-directive": "img-src",
      "blocked-uri": "https://cdn.example/x.png?sig=abc",
    },
  }))).status, 204);
  assert.equal((await post(JSON.stringify([{
    type: "csp-violation",
    body: {
      documentURL: "https://352flights.test/unsubscribe?token=SUBSCRIBER-TOKEN",
      effectiveDirective: "script-src-elem",
      blockedURL: "inline",
    },
  }]))).status, 204);
  assert.deepEqual(logged, [
    { directive: "img-src", blocked: "https://cdn.example/x.png", page: "https://352flights.test/preferences" },
    { directive: "script-src-elem", blocked: "inline", page: "https://352flights.test/unsubscribe" },
  ]);
  assert.doesNotMatch(JSON.stringify(logged), /SUBSCRIBER-TOKEN|sig=/);
});

test("malformed and oversized bodies are rejected", async () => {
  capture();
  assert.equal((await post("not json")).status, 400);
  assert.equal((await post("x".repeat(20_000))).status, 413);
});
