import { NextResponse } from "next/server";

import { ensureOpsAuthorized } from "@/lib/ops-auth";
import { getDateScanRunHistory } from "@/lib/date-scan-runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = ensureOpsAuthorized(request);
  if (unauthorized) return unauthorized;

  const history = await getDateScanRunHistory(100);
  if (history.error) {
    return NextResponse.json(
      { ok: false, reason: "date_scan_history_unavailable", detail: history.error },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { ok: true, runs: history.runs },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
