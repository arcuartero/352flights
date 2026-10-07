import "./helpers/server-runtime";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { pathToFileURL } from "node:url";
import { NextRequest } from "next/server";
import ts from "typescript";

/**
 * Every handler under app/api/ops must reject unauthenticated calls on its own,
 * not only through the middleware, so a matcher change cannot expose it.
 */
const root = path.resolve(import.meta.dirname, "..");
const opsApiDir = path.join(root, "app/api/ops");
const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const originalFetch = globalThis.fetch;
const oldEnv = { ...process.env };
let outboundCalls = 0;

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

before(() => {
  process.env.OPS_BASIC_AUTH_USER = "ops-test-user";
  process.env.OPS_BASIC_AUTH_PASSWORD = "ops-test-password";
  process.env.SUPABASE_URL = "https://ops-protection.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
  globalThis.fetch = async () => {
    outboundCalls += 1;
    return Response.json({ message: "blocked in test" }, { status: 500 });
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...oldEnv };
});

const files = routeFiles(opsApiDir);

test("finds the ops API routes", () => {
  assert.ok(files.length >= 20, `only ${files.length} ops routes found`);
});

for (const file of files) {
  const relative = path.relative(root, file);
  test(`${relative} rejects every method without credentials`, async () => {
    const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    const exported = methods.filter((method) => typeof mod[method] === "function");
    assert.ok(exported.length > 0, "route exports no HTTP handler");

    const urlPath = "/" + path.relative(path.join(root, "app"), path.dirname(file)).replaceAll("[id]", "00000000-0000-4000-8000-000000000003");
    for (const method of exported) {
      const before = outboundCalls;
      const handler = mod[method] as (request: Request, context: unknown) => Promise<Response>;
      const request = new NextRequest(`https://example.test${urlPath}`, {
        method,
        headers: {
          authorization: "Basic " + Buffer.from("ops-test-user:wrong").toString("base64"),
          "content-type": "application/json",
        },
        ...(method === "GET" ? {} : { body: "{}" }),
      });
      const response = await handler(request, {
        params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000003" }),
      });
      assert.equal(response.status, 401, `${method} ${urlPath} returned ${response.status}`);
      assert.equal(outboundCalls, before, `${method} ${urlPath} reached storage before authenticating`);
    }
  });
}

test("every ops server action checks access before doing anything", () => {
  const file = path.join(root, "app/ops/actions.ts");
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const isAccessCheck = (statement: ts.Statement | undefined) =>
    !!statement && ts.isExpressionStatement(statement) && statement.expression.getText(source) === "await assertOpsAccess()";
  const actions = source.statements.filter(
    (node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) &&
      !!node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
  );
  assert.ok(actions.length >= 10, `only ${actions.length} actions found`);
  for (const action of actions) {
    const [first] = action.body?.statements ?? [];
    // Allowed: the check is the first statement, or the first statement of a leading try block.
    const guarded = isAccessCheck(first) || (!!first && ts.isTryStatement(first) && isAccessCheck(first.tryBlock.statements[0]));
    assert.ok(guarded, `${action.name?.text} does not start with assertOpsAccess()`);
  }
});
