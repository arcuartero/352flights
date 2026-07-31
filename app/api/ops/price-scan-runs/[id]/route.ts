import { NextResponse } from "next/server";

import { getPriceScanRun } from "@/lib/price-scan-runs";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const result = await getPriceScanRun(id);

  if (result.error) {
    return NextResponse.json(
      { ok: false, reason: "price_scan_run_read_failed", detail: result.error },
      { status: 500 },
    );
  }

  if (!result.run) {
    return NextResponse.json(
      { ok: false, reason: "price_scan_run_not_found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, run: result.run });
}
