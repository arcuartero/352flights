import { NextRequest, NextResponse } from "next/server";

import { revalidateDestinationFares } from "@/lib/public-fare-cache";
import { bearerToken, matchesAnySecret } from "@/lib/secret-compare";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  // The Supabase service-role key is deliberately not accepted: it must never travel to the web app.
  return matchesAnySecret(bearerToken(request), [
    process.env.PUBLIC_CACHE_REVALIDATION_SECRET,
    process.env.CRON_SECRET,
  ]);
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
