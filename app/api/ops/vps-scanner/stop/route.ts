import { NextResponse } from "next/server";

import { ensureOpsAuthorized } from "@/lib/ops-auth";
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

  try {
    const result = await callVpsScannerAgent<VpsScannerActionResponse>("stop", {
      method: "POST",
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: "vps_stop_failed",
        detail: error instanceof Error ? error.message : "Unknown VPS scanner error.",
      },
      { status: 502 },
    );
  }
}
