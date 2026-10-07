import { NextResponse } from "next/server";
import { defaultCookieConfig } from "@/lib/cookie-consent";
import { getCachedCookieConfig } from "@/lib/cookie-config-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getCachedCookieConfig(), {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch {
    return NextResponse.json(defaultCookieConfig, { headers: { "Cache-Control": "no-store" } });
  }
}
