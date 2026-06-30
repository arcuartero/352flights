import { NextResponse } from "next/server";
import { z } from "zod";

import { hasSupabaseAdminEnv } from "@/lib/env";
import { emailLocales } from "@/lib/email";
import { subscribeEmailAddress } from "@/lib/subscriptions";

const subscribeSchema = z.object({
  email: z.string().trim().email(),
  locale: z.enum(emailLocales).optional(),
});

export async function POST(request: Request) {
  const payload = subscribeSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json(
      {
        error:
          "Subscription storage is not configured yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to activate captures.",
      },
      { status: 503 },
    );
  }
  try {
    const result = await subscribeEmailAddress(payload.data.email, payload.data.locale);
    return NextResponse.json({
      message: result.message,
      requiresConfirmation: !result.alreadyConfirmed,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("schema cache")
        ? "The subscription database is not ready yet. Run the SQL setup in Supabase first."
        : error instanceof Error
          ? error.message
          : "We could not save your subscription right now.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
