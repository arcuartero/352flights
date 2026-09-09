import { NextResponse } from "next/server";

import { runDailyCreatelloDelivery } from "@/lib/creatello-daily-delivery";
import { hasCreatelloInboxEnv, hasSupabaseAdminEnv } from "@/lib/env";
import { validateCronSecret } from "@/lib/ops";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function handle(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
  if (!validateCronSecret(token)) {
    return NextResponse.json(
      { ok: false, reason: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
  if (!hasSupabaseAdminEnv() || !hasCreatelloInboxEnv()) {
    return NextResponse.json(
      { ok: false, reason: "integration_not_configured" },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  try {
    const result = await runDailyCreatelloDelivery();
    return NextResponse.json(result, {
      status: result.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("[creatello-daily] run_failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { ok: false, reason: "daily_delivery_failed" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
