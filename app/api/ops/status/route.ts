import { ensureOpsAuthorized } from "@/lib/ops-auth";
import { NextRequest, NextResponse } from "next/server";
import { GET as scanner } from "@/app/api/ops/scanner-status/route";
import { GET as discovery } from "@/app/api/ops/pattern-discovery-status/route";
import { GET as priceRuns } from "@/app/api/ops/price-scan-runs/route";
import { GET as dateRuns } from "@/app/api/ops/date-scan-runs/route";
import { GET as vps } from "@/app/api/ops/vps-scanner/status/route";

export const dynamic = "force-dynamic";
const handlers = {
  "scanner-status": scanner,
  "pattern-discovery-status": discovery,
  "pattern-discovery-live-status": discovery,
  "price-scan-runs": priceRuns,
  "date-scan-runs": dateRuns,
  "vps-scanner/status": vps,
};
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "Vercel-CDN-Cache-Control": "no-store",
};

export async function GET(request: NextRequest) {
  const unauthorized = ensureOpsAuthorized(request);
  if (unauthorized) {
    for (const [key, value] of Object.entries(headers)) unauthorized.headers.set(key, value);
    return unauthorized;
  }
  const resources = [...new Set((request.nextUrl.searchParams.get("resources") ?? "").split(","))];
  if (!resources.length || resources.some((key) => !Object.hasOwn(handlers, key))) {
    return NextResponse.json({ error: "Unknown status resource" }, { status: 400, headers });
  }
  // Call handlers in-process, retaining their authentication, with no internal HTTP invocations.
  const pending = new Map<(typeof handlers)[keyof typeof handlers], Promise<Response>>();
  const entries = await Promise.all(resources.map(async (key) => {
    try {
      const handler = handlers[key as keyof typeof handlers];
      let result = pending.get(handler);
      if (!result) { result = handler(request); pending.set(handler, result); }
      const response = (await result).clone();
      const body = await response.json().catch(() => ({ error: "Status unavailable" }));
      return [key, { status: response.status, body }];
    } catch {
      return [key, { status: 503, body: { error: "Status temporarily unavailable" } }];
    }
  }));
  return NextResponse.json(Object.fromEntries(entries), { headers });
}
