import { NextResponse } from "next/server";

import {
  enqueueMacScannerCommand,
  getMacScannerControlState,
} from "@/lib/mac-scanner-control";
import { ensureOpsAuthorized } from "@/lib/ops-auth";
import { getPriceScanRun } from "@/lib/price-scan-runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const resumableStatuses = new Set(["partial", "failed", "stopped"]);

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const unauthorized = ensureOpsAuthorized(request);
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  const runResult = await getPriceScanRun(id);
  if (runResult.error) {
    return NextResponse.json(
      { ok: false, reason: "price_scan_run_read_failed", detail: runResult.error },
      { status: 500 },
    );
  }
  const run = runResult.run;
  if (!run) {
    return NextResponse.json(
      { ok: false, reason: "price_scan_run_not_found" },
      { status: 404 },
    );
  }
  if (
    run.scannerSource !== "mac" ||
    !resumableStatuses.has(run.status) ||
    run.routesCompleted >= run.routesPlanned
  ) {
    return NextResponse.json(
      {
        ok: false,
        reason: "scan_not_resumable",
        detail: "This scan is not an incomplete Mac execution.",
      },
      { status: 409 },
    );
  }

  const state = await getMacScannerControlState("price_scanner");
  if (!state.configured || !state.online) {
    return NextResponse.json(
      {
        ok: false,
        reason: "mac_controller_offline",
        detail: "El Mac no está conectado. Enciéndelo y espera unos segundos antes de reintentar.",
      },
      { status: 503 },
    );
  }
  if (state.priceScannerRunning || state.activeOwner || state.pendingCommand) {
    return NextResponse.json(
      {
        ok: false,
        reason: "scanner_busy",
        detail: "Ya hay un análisis o una orden pendiente en el Mac.",
      },
      { status: 409 },
    );
  }

  const result = await enqueueMacScannerCommand("price_scanner", "start", {
    resume_run_key: run.runKey,
  });
  if (result.error || !result.command) {
    return NextResponse.json(
      {
        ok: false,
        reason: "mac_resume_queue_failed",
        detail: result.error ?? "No se pudo crear la orden de reanudación.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true, reason: "resume_queued", commandId: result.command.id },
    { status: 202, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
