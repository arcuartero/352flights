import { NextResponse } from "next/server";

import { ensureOpsAuthorized } from "@/lib/ops-auth";
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

  if (!hasVpsScannerAgentConfig()) {
    return NextResponse.json(
      { ok: false, reason: "vps_agent_not_configured" },
      { status: 503 },
    );
  }

  try {
    const status = await callVpsScannerAgent<VpsScannerAgentStatus>("status");
    return NextResponse.json(status, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: "vps_agent_unavailable",
        detail: error instanceof Error ? error.message : "Unknown VPS scanner error.",
      },
      { status: 502 },
    );
  }
}
