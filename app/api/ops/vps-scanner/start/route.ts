import { NextResponse } from "next/server";

import { ensureOpsAuthorized } from "@/lib/ops-auth";
import { recordVpsPriceScanStartFailure } from "@/lib/price-scan-run-recovery";
import {
  callVpsScannerAgent,
  hasVpsScannerAgentConfig,
  type VpsScannerActionResponse,
} from "@/lib/vps-scanner-agent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const unauthorized = ensureOpsAuthorized(request);
  if (unauthorized) return unauthorized;

  if (!hasVpsScannerAgentConfig()) {
    return NextResponse.json(
      { ok: false, reason: "vps_agent_not_configured" },
      { status: 503 },
    );
  }

  const startedAt = new Date().toISOString();
  try {
    const result = await callVpsScannerAgent<VpsScannerActionResponse>("start", {
      method: "POST",
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown VPS scanner error.";
    await recordVpsPriceScanStartFailure(startedAt, detail).catch(() => undefined);
    return NextResponse.json(
      {
        ok: false,
        reason: "vps_start_failed",
        detail,
      },
      { status: 502 },
    );
  }
}
