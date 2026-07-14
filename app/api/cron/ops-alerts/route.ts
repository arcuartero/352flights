import { NextResponse } from "next/server";

import { sendOpsAutomatedAlertsEmail, validateCronSecret } from "@/lib/ops";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  if (!validateCronSecret(token)) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get("force") === "1";
    const result = await sendOpsAutomatedAlertsEmail({ force });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Ops alert email failed unexpectedly.",
      },
      { status: 500 },
    );
  }
}
