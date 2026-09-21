import { NextResponse } from "next/server";
import { defaultCookieConfig } from "@/lib/cookie-consent";
import { getCookieConfig } from "@/lib/cookie-config-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getCookieConfig(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(defaultCookieConfig, { headers: { "Cache-Control": "no-store" } });
  }
}
