import { NextResponse } from "next/server";

import { getOpsRecentSnapshotsData } from "@/lib/ops";
import { ensureOpsAuthorized } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = ensureOpsAuthorized(request);
  if (unauthorized) return unauthorized;

  const result = await getOpsRecentSnapshotsData(10);
  if (!result.schemaReady) {
    return NextResponse.json(
      {
        ok: false,
        reason: "recent_snapshots_unavailable",
        detail: result.onboardingMessage ?? "Recent snapshots are unavailable.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { ok: true, snapshots: result.snapshots },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
