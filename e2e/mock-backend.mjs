// In-memory stand-in for Supabase (PostgREST subset) and Resend, used only by the e2e suite.
// Nothing here talks to the network; the app is pointed at it through env vars.
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.env.E2E_MOCK_PORT ?? 54329);
let tables = {};
let emails = [];

const defaults = {
  newsletter_subscribers: () => ({
    id: randomUUID(),
    status: "pending",
    email_confirmed: false,
    onboarding_completed: false,
    preference_token: randomUUID(),
    confirmation_token: randomUUID(),
    unsubscribe_token: randomUUID(),
    travel_email_consent: false,
    welcome_email_sent_at: null,
    created_at: new Date().toISOString(),
  }),
};

function rowsOf(table) {
  return (tables[table] ??= []);
}

function matches(row, params) {
  for (const [column, raw] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(column)) continue;
    const [operator, ...rest] = raw.split(".");
    const value = rest.join(".");
    const cell = row[column];
    if (operator === "eq" && String(cell) !== value) return false;
    if (operator === "neq" && String(cell) === value) return false;
    if (operator === "is" && !(value === "null" ? cell == null : String(cell) === value)) return false;
    if (operator === "in") {
      const list = value.replace(/^\(|\)$/g, "").split(",").map((item) => item.replace(/^"|"$/g, ""));
      if (!list.includes(String(cell))) return false;
    }
  }
  return true;
}

function respond(res, status, body, request) {
  const wantsObject = (request.headers.accept ?? "").includes("vnd.pgrst.object");
  if (wantsObject && Array.isArray(body)) {
    if (body.length !== 1) {
      res.writeHead(406, { "content-type": "application/json" });
      res.end(JSON.stringify({ code: "PGRST116", message: `${body.length} rows` }));
      return;
    }
    body = body[0];
  }
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const params = [...url.searchParams.entries()];
  const representation = (req.headers.prefer ?? "").includes("return=representation");

  // Test control endpoints
  if (url.pathname === "/__emails") return respond(res, 200, emails, req);
  if (url.pathname === "/__tables") return respond(res, 200, tables, req);
  if (url.pathname === "/__reset") {
    tables = {};
    emails = [];
    return respond(res, 204, undefined, req);
  }

  // Resend
  if (url.pathname === "/emails" && req.method === "POST") {
    const body = await readJson(req);
    const id = randomUUID();
    emails.push({ id, ...body });
    return respond(res, 200, { id }, req);
  }

  // Supabase Storage: no destination photos uploaded.
  if (url.pathname.startsWith("/storage/v1/object/list/")) {
    await readJson(req);
    return respond(res, 200, [], req);
  }

  // PostgREST RPC: every limiter allows; anything else returns no rows.
  const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
  if (rpc) {
    await readJson(req);
    return respond(res, 200, ["consume_rate_limit", "check_failed_attempts"].includes(rpc[1]) ? true : [], req);
  }

  const table = url.pathname.match(/^\/rest\/v1\/(\w+)$/)?.[1];
  if (!table) return respond(res, 404, { message: "unknown path" }, req);
  const rows = rowsOf(table);

  if (req.method === "GET" || req.method === "HEAD") {
    let found = rows.filter((row) => matches(row, params));
    const limit = url.searchParams.get("limit");
    if (limit) found = found.slice(0, Number(limit));
    return respond(res, 200, found, req);
  }

  if (req.method === "POST") {
    const body = await readJson(req);
    const incoming = Array.isArray(body) ? body : [body];
    const conflictColumns = (url.searchParams.get("on_conflict") ?? "").split(",").filter(Boolean);
    const merge = (req.headers.prefer ?? "").includes("resolution=merge-duplicates");
    const written = incoming.map((values) => {
      const existing = merge && conflictColumns.length
        ? rows.find((row) => conflictColumns.every((column) => String(row[column]) === String(values[column])))
        : null;
      if (existing) return Object.assign(existing, values);
      const row = { ...(defaults[table]?.() ?? { id: randomUUID() }), ...values };
      rows.push(row);
      return row;
    });
    return respond(res, 201, representation ? written : undefined, req);
  }

  if (req.method === "PATCH") {
    const values = await readJson(req);
    const updated = rows.filter((row) => matches(row, params)).map((row) => Object.assign(row, values));
    return respond(res, 200, representation ? updated : undefined, req);
  }

  if (req.method === "DELETE") {
    const kept = rows.filter((row) => !matches(row, params));
    const removed = rows.filter((row) => matches(row, params));
    tables[table] = kept;
    return respond(res, 200, representation ? removed : undefined, req);
  }

  return respond(res, 405, { message: "method not supported" }, req);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[e2e-mock] listening on ${port}`);
});
