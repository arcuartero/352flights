import { NextResponse } from "next/server";

import {
  enqueueMacScannerCommand,
  getMacScannerControlState,
} from "@/lib/mac-scanner-control";
import { ensureOpsAuthorized } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const unauthorized = ensureOpsAuthorized(request);
  if (unauthorized) return unauthorized;

  const state = await getMacScannerControlState("price_scanner");
  if (!state.configured || !state.online) {
    console.warn("[ops/scanner-stop] Mac controller offline", {
      configured: state.configured,
      lastSeenAt: state.lastSeenAt,
    });
    return NextResponse.json(
      {
        ok: false,
        reason: "mac_controller_offline",
        detail: "The Mac controller has not reported in the last 45 seconds.",
      },
      { status: 503 },
    );
  }
  if (!state.priceScannerRunning) {
    return NextResponse.json({ ok: true, reason: "already_stopped" });
  }

  const result = await enqueueMacScannerCommand("price_scanner", "stop");
  if (result.error) {
    console.error("[ops/scanner-stop] Failed to queue Mac command", {
      error: result.error,
    });
    return NextResponse.json(
      { ok: false, reason: "mac_stop_queue_failed", detail: result.error },
      { status: 500 },
    );
  }

  console.info("[ops/scanner-stop] Stop queued for Mac", {
    commandId: result.command?.id ?? null,
  });

  return NextResponse.json(
    {
      ok: true,
      reason: "queued_for_mac",
      commandId: result.command?.id ?? null,
    },
    {
      status: 202,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
