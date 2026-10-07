import { NextRequest, NextResponse } from "next/server";
import { consentCookieName } from "@/lib/cookie-consent";
import { getSupabaseAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const decisions = ["reject", "close", "selected", "all"] as const;
const pageGroups = ["home", "deals", "legal", "other"] as const;

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin !== request.nextUrl.origin || request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return new NextResponse(null, { status: 403 });
  }

  let body: { kind?: unknown; pageGroup?: unknown };
  try {
    if (Number(request.headers.get("content-length")) > 256) return new NextResponse(null, { status: 413 });
    const raw = await request.text();
    if (raw.length > 256) return new NextResponse(null, { status: 413 });
    body = JSON.parse(raw);
  } catch { return new NextResponse(null, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return new NextResponse(null, { status: 400 });

  let consent: { decision?: unknown; analytics?: unknown };
  try { consent = JSON.parse(decodeURIComponent(request.cookies.get(consentCookieName)?.value ?? "null")); }
  catch { return new NextResponse(null, { status: 400 }); }
  if (!consent || typeof consent !== "object") return new NextResponse(null, { status: 400 });

  const decision = decisions.includes(consent.decision as typeof decisions[number]) ? consent.decision : null;
  const isDecision = decisions.includes(body.kind as typeof decisions[number]);
  const isDeclinedView = body.kind === "declined_view" &&
    (decision === "reject" || decision === "close") && consent.analytics !== true &&
    pageGroups.includes(body.pageGroup as typeof pageGroups[number]);

  if ((!isDecision || body.kind !== decision || body.pageGroup !== "all") && !isDeclinedView) {
    return new NextResponse(null, { status: 400 });
  }

  const { error } = await getSupabaseAdminClient().rpc("increment_analytics_aggregate", {
    p_kind: body.kind, p_page_group: body.pageGroup,
  });
  if (error) return new NextResponse(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
