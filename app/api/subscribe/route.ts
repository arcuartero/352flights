import { NextResponse } from "next/server";
import { z } from "zod";

import { hasSupabaseAdminEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase";

const subscribeSchema = z.object({
  email: z.string().trim().email(),
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

  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("newsletter_subscribers")
    .upsert(
      {
        email: payload.data.email,
        origin_city: "Luxembourg",
        home_airport: "LUX",
        source: "landing_page",
        status: "pending",
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "email",
        ignoreDuplicates: false,
      },
    )
    .select("preference_token")
    .single();

  if (error) {
    const message =
      typeof error.message === "string" && error.message.includes("schema cache")
        ? "The subscription database is not ready yet. Run the SQL setup in Supabase first."
        : "We could not save your subscription right now.";

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    message: "You are on the list. Next, tell us which routes you actually care about.",
    preferencesPath: `/preferences?token=${data.preference_token}`,
  });
}

