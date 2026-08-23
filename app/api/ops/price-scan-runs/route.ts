import { NextResponse } from "next/server";

import { ensureOpsAuthorized } from "@/lib/ops-auth";
import { recoverLatestVpsPriceScanRun } from "@/lib/price-scan-run-recovery";
import { getPriceScanRunHistory } from "@/lib/price-scan-runs";
import {
  callVpsScannerAgent,
  hasVpsScannerAgentConfig,
  type VpsScannerAgentStatus,
} from "@/lib/vps-scanner-agent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = ensureOpsAuthorized(request);
  if (unauthorized) return unauthorized;

  let history = await getPriceScanRunHistory(10);
  if (history.error) {
    return NextResponse.json(
      { ok: false, reason: "scan_history_unavailable", detail: history.error },
      { status: 503 },
    );
  }

  // The VPS is the authority for whether the process is alive. Always compare
  // it with persisted history so a run closed during a Supabase outage can be
  // repaired even when no database row is currently marked as running.
  if (hasVpsScannerAgentConfig()) {
    try {
      const status = await callVpsScannerAgent<VpsScannerAgentStatus>("status");
      const recovery = await recoverLatestVpsPriceScanRun(status);
      if (recovery.recovered) history = await getPriceScanRunHistory(10);
    } catch {
      // Keep serving the persisted history if the VPS cannot be reached.
    }
  }

  return NextResponse.json(
    { ok: true, runs: history.runs },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
