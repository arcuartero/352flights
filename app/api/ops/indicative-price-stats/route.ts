import { NextResponse } from "next/server";

import { getIndicativePriceCoverage } from "@/lib/indicative-price-stats";
import { ensureOpsAuthorized } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = ensureOpsAuthorized(request);
  if (unauthorized) return unauthorized;

  const result = await getIndicativePriceCoverage(50);
  if (result.error) {
    return NextResponse.json(
      { ok: false, reason: "indicative_price_stats_unavailable", detail: result.error },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { ok: true, overview: result.overview, statistics: result.statistics },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
