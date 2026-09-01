import { NextRequest, NextResponse } from "next/server";

import { hasCronSecret, hasSupabaseAdminEnv } from "@/lib/env";
import { revalidateDestinationFares } from "@/lib/public-fare-cache";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  const token = authorization.slice("Bearer ".length);
  return (
    (hasCronSecret() && token === process.env.CRON_SECRET) ||
    (hasSupabaseAdminEnv() && token === process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const payload = (await request.json().catch(() => null)) as
    | { cities?: unknown }
    | null;
  const cities = Array.isArray(payload?.cities)
    ? payload.cities.filter((city): city is string => typeof city === "string" && city.trim().length > 0)
    : [];

  if (cities.length === 0) {
    return NextResponse.json(
      { ok: false, error: "At least one destination city is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const revalidated = revalidateDestinationFares(cities);
  return NextResponse.json(
    { ok: true, revalidated },
    { headers: { "Cache-Control": "no-store" } },
  );
}
