import { NextResponse } from "next/server";
import { getGaDashboard } from "@/lib/ga4-reporting";
import { getSupabaseAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const user = process.env.OPS_BASIC_AUTH_USER;
  const password = process.env.OPS_BASIC_AUTH_PASSWORD;
  if (!user || !password) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return false;
  try { return Buffer.from(header.slice(6), "base64").toString("utf8") === `${user}:${password}`; }
  catch { return false; }
}

export async function GET(request: Request) {
  if (!authorized(request)) return new NextResponse("Authentication required", { status: 401 });
  const since = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const [ga, aggregates] = await Promise.all([
    getGaDashboard(),
    getSupabaseAdminClient().from("analytics_aggregates").select("day,kind,page_group,total")
      .gte("day", since).order("day", { ascending: true }),
  ]);
  return NextResponse.json({
    ga,
    anonymous: { available: !aggregates.error, rows: aggregates.error ? [] : aggregates.data ?? [],
      error: aggregates.error ? "Apply the analytics_aggregates migration to enable anonymous counts." : null },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
