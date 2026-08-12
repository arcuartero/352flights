import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  createAutomaticRoutePlannerSearchRules,
  createAutomaticRoutePlannerSearchRulesForRoutes,
} from "@/lib/active-routes";
import { ensureOpsAuthorized } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AutomaticRulesRequest = {
  routeId?: string;
  routeIds?: string[];
};

export async function POST(request: Request) {
  const unauthorized = ensureOpsAuthorized(request);
  if (unauthorized) return unauthorized;

  try {
    const body = (await request.json()) as AutomaticRulesRequest;

    if (Array.isArray(body.routeIds)) {
      const routeIds = Array.from(
        new Set((body.routeIds ?? []).filter((routeId): routeId is string => Boolean(routeId))),
      );
      if (routeIds.length === 0) {
        return NextResponse.json({ error: "Missing routeIds." }, { status: 400 });
      }

      const results = await createAutomaticRoutePlannerSearchRulesForRoutes({ routeIds });
      revalidatePath("/ops/active-routes");
      return NextResponse.json({ results });
    }

    const routeId = typeof body.routeId === "string" ? body.routeId : "";
    if (!routeId) {
      return NextResponse.json({ error: "Missing routeId." }, { status: 400 });
    }

    const result = await createAutomaticRoutePlannerSearchRules({ routeId });
    revalidatePath("/ops/active-routes");
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automatic rules could not be created.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
