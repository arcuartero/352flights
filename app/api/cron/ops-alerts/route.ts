import { NextResponse } from "next/server";
import { reconcileStalePriceScanRuns } from "@/lib/price-scan-runs";

import { sendOpsAutomatedAlertsEmail } from "@/lib/ops/dashboard";
import { validateCronSecret } from "@/lib/ops/campaigns";
import { bearerToken } from "@/lib/secret-compare";

export async function POST(request: Request) {
  const token = bearerToken(request);

  if (!validateCronSecret(token)) {
    return NextResponse.json(
      { error: "Unauthorized cron request." },
      { status: 401 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get("force") === "1";
    await reconcileStalePriceScanRuns();
    const result = await sendOpsAutomatedAlertsEmail({ force });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Ops alert email failed unexpectedly.",
      },
      { status: 500 },
    );
  }
}
