import { NextResponse } from "next/server";

import { ensureOpsAuthorized } from "@/lib/ops-auth";
import { getPatternDiscoveryStatus } from "@/lib/pattern-discovery-status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = ensureOpsAuthorized(request);
  if (unauthorized) return unauthorized;

  try {
    const status = await getPatternDiscoveryStatus();
    return NextResponse.json(status, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const detail =
      error instanceof Error
        ? `${error.name || "Error"}: ${error.message || "Unknown error"}`
        : typeof error === "string"
          ? error
          : "Unknown pattern discovery live status error";

    return NextResponse.json(
      {
        error: "Pattern discovery live status failed.",
        detail,
        stack:
          process.env.NODE_ENV !== "production" && error instanceof Error
            ? error.stack ?? null
            : null,
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }
}
