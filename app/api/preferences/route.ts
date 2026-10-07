import { NextResponse } from "next/server";
import { z } from "zod";

import { hasSupabaseAdminEnv } from "@/lib/env";
import {
  getPreferencesByToken,
  savePreferencesByToken,
} from "@/lib/preferences";
import { preferencePayloadSchema } from "@/lib/preferences-shared";

const tokenSchema = z.string().uuid();

export const dynamic = "force-dynamic";

function privateJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return NextResponse.json(body, { ...init, headers });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  const parsedToken = tokenSchema.safeParse(token);
  if (!parsedToken.success) {
    return privateJson(
      { error: "Missing or invalid preference token." },
      { status: 400 },
    );
  }

  if (!hasSupabaseAdminEnv()) {
    return privateJson(
      {
        error:
          "Preferences are temporarily unavailable. Please try again later.",
      },
      { status: 503 },
    );
  }

  try {
    const result = await getPreferencesByToken(parsedToken.data);
    if (!result.ok) {
      return privateJson(
        {
          error:
            result.status === 404
              ? "We could not find that preference link."
              : "We could not load your preferences right now.",
        },
        { status: result.status === 404 ? 404 : 500 },
      );
    }
    return privateJson(result.bundle);
  } catch {
    return privateJson(
      { error: "We could not load your preferences right now." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const payload = preferencePayloadSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!payload.success) {
    return privateJson(
      { error: "Your preference form is incomplete or invalid." },
      { status: 400 },
    );
  }

  if (!hasSupabaseAdminEnv()) {
    return privateJson(
      {
        error:
          "Preferences are temporarily unavailable. Please try again later.",
      },
      { status: 503 },
    );
  }

  try {
    const result = await savePreferencesByToken(payload.data);
    return privateJson({
      message: result.emailConfirmed
        ? "Preferences saved. Your Luxembourg flight profile is live."
        : "Preferences saved. Confirm your email from the welcome message to activate alerts.",
    });
  } catch (error) {
    return privateJson(
      {
        error:
          "We could not save your preferences right now. Please try again later.",
      },
      { status: 500 },
    );
  }
}
