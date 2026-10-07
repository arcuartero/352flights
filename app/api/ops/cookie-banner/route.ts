import { ensureOpsAuthorized } from "@/lib/ops-auth";
import { NextResponse } from "next/server";
import { cookieConfigSchema } from "@/lib/cookie-consent";
import { getCookieConfig, saveCookieConfig } from "@/lib/cookie-config-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = ensureOpsAuthorized(request);
  if (unauthorized) return unauthorized;
  try {
    return NextResponse.json(await getCookieConfig());
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Cannot load settings",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const unauthorized = ensureOpsAuthorized(request);
  if (unauthorized) return unauthorized;
  const parsed = cookieConfigSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid cookie banner settings" },
      { status: 400 },
    );
  const config = { ...parsed.data, revision: crypto.randomUUID() };
  try {
    await saveCookieConfig(config);
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Cannot save settings",
      },
      { status: 500 },
    );
  }
}
