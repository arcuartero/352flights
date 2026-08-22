import { NextResponse } from "next/server";

import { getOpsEmailCampaignsData } from "@/lib/ops";
import { ensureOpsAuthorized } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = ensureOpsAuthorized(request);
  if (unauthorized) return unauthorized;

  const data = await getOpsEmailCampaignsData();
  if (!data.schemaReady) {
    return NextResponse.json(
      {
        ok: false,
        reason: "email_campaigns_unavailable",
        detail: data.onboardingMessage ?? "Email campaign data is unavailable.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { ok: true, data },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
