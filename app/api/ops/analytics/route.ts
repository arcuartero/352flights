import { ensureOpsAuthorized } from "@/lib/ops-auth";
import { NextResponse } from "next/server";
import { getGaDashboard } from "@/lib/ga4-reporting";
import { getSupabaseAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = ensureOpsAuthorized(request);
  if (unauthorized) return unauthorized;
  const since = new Date(Date.now() - 29 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const [ga, aggregates] = await Promise.all([
    getGaDashboard(),
    getSupabaseAdminClient()
      .from("analytics_aggregates")
      .select("day,kind,page_group,total")
      .gte("day", since)
      .order("day", { ascending: true }),
  ]);
  return NextResponse.json(
    {
      ga,
      anonymous: {
        available: !aggregates.error,
        rows: aggregates.error ? [] : (aggregates.data ?? []),
        error: aggregates.error
          ? "Apply the analytics_aggregates migration to enable anonymous counts."
          : null,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
