import { NextResponse } from "next/server";
import { z } from "zod";

import { hasSupabaseAdminEnv } from "@/lib/env";
import { getPreferencesByToken, savePreferencesByToken } from "@/lib/preferences";
import { preferencePayloadSchema } from "@/lib/preferences-shared";

const tokenSchema = z.string().uuid();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  const parsedToken = tokenSchema.safeParse(token);
  if (!parsedToken.success) {
    return NextResponse.json(
      { error: "Missing or invalid preference token." },
      { status: 400 },
    );
  }

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json(
      { error: "Supabase is not configured for preferences yet." },
      { status: 503 },
    );
  }

  const result = await getPreferencesByToken(parsedToken.data);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json(result.bundle);
}

export async function POST(request: Request) {
  const payload = preferencePayloadSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json(
      { error: "Your preference form is incomplete or invalid." },
      { status: 400 },
    );
  }

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json(
      { error: "Supabase is not configured for preferences yet." },
      { status: 503 },
    );
  }

  try {
    await savePreferencesByToken(payload.data);
    return NextResponse.json({
      message: "Preferences saved. Your Luxembourg flight profile is live.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "We could not save your preferences right now.",
      },
      { status: 500 },
    );
  }
}
