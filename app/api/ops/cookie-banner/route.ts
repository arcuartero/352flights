import { NextResponse } from "next/server";
import { cookieConfigSchema } from "@/lib/cookie-consent";
import { getCookieConfig, saveCookieConfig } from "@/lib/cookie-config-server";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const user = process.env.OPS_BASIC_AUTH_USER;
  const password = process.env.OPS_BASIC_AUTH_PASSWORD;
  if (!user || !password) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    return decoded === `${user}:${password}`;
  } catch { return false; }
}

export async function GET(request: Request) {
  if (!authorized(request)) return new NextResponse("Authentication required", { status: 401 });
  try { return NextResponse.json(await getCookieConfig()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Cannot load settings" }, { status: 500 }); }
}

export async function PUT(request: Request) {
  if (!authorized(request)) return new NextResponse("Authentication required", { status: 401 });
  const parsed = cookieConfigSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid cookie banner settings" }, { status: 400 });
  const config = { ...parsed.data, revision: crypto.randomUUID() };
  try { await saveCookieConfig(config); return NextResponse.json(config); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Cannot save settings" }, { status: 500 }); }
}
