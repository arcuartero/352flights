import { NextResponse } from "next/server";

import { getOpsDealPriceSeries } from "@/lib/ops";
import { ensureOpsAuthorized } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const unauthorized = ensureOpsAuthorized(request);
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  const result = await getOpsDealPriceSeries(id);
  if (result.error) {
    const status = result.error === "Deal not found." ? 404 : 500;
    return NextResponse.json(
      { ok: false, reason: "deal_price_series_read_failed", detail: result.error },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { ok: true, series: result.series },
    { headers: { "Cache-Control": "no-store" } },
  );
}
