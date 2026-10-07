import { ensureOpsAuthorized } from "@/lib/ops-auth";
import { NextResponse } from "next/server";

import { getPatternDiscoveryStatus } from "@/lib/pattern-discovery-status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      error: error.name || "Error",
      detail: error.message || "Unknown error",
      stack:
        process.env.NODE_ENV !== "production" ? (error.stack ?? null) : null,
    };
  }

  return {
    error: "UnknownError",
    detail:
      typeof error === "string"
        ? error
        : "Unknown pattern discovery status error",
    stack: null,
  };
}

export async function GET(request: Request) {
  const unauthorized = ensureOpsAuthorized(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const status = await getPatternDiscoveryStatus();
    return NextResponse.json(status, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const payload = serializeError(error);

    return NextResponse.json(
      {
        error: "Pattern discovery status failed.",
        detail: `${payload.error}: ${payload.detail}`,
        stack: payload.stack,
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }
}
