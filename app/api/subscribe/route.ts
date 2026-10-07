import { after, NextResponse } from "next/server";
import { z } from "zod";

import { hasSupabaseAdminEnv } from "@/lib/env";
import { emailLocales } from "@/lib/email";
import { clientIp, withinRateLimits } from "@/lib/rate-limit";
import { subscribeEmailAddress } from "@/lib/subscriptions";

const subscribeSchema = z.object({
  email: z.string().trim().email(),
  locale: z.enum(emailLocales).optional(),
  travelEmailConsent: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const startedAt = Date.now();
  const payload = subscribeSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!payload.success) {
    return NextResponse.json(
      { code: "invalid_email", error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json(
      {
        code: "storage_unavailable",
        error:
          "Subscriptions are temporarily unavailable. Please try again later.",
      },
      { status: 503 },
    );
  }
  const allowed = await withinRateLimits([
    { scope: "subscribe-ip", identifier: clientIp(request), limit: 10, windowSeconds: 600 },
    { scope: "subscribe-email", identifier: payload.data.email, limit: 3, windowSeconds: 3600 },
  ]);
  if (!allowed) {
    return NextResponse.json(
      {
        code: "rate_limited",
        error: "Too many attempts. Please wait a few minutes and try again.",
      },
      { status: 429, headers: { "Retry-After": "600" } },
    );
  }

  try {
    const result = await subscribeEmailAddress(
      payload.data.email,
      payload.data.locale,
      payload.data.travelEmailConsent,
    );

    if (result.sendWelcomeEmail) {
      after(async () => {
        const emailStartedAt = Date.now();

        try {
          await result.sendWelcomeEmail?.();
          console.info("[api/subscribe] welcome email sent", {
            durationMs: Date.now() - emailStartedAt,
          });
        } catch (error) {
          console.error("[api/subscribe] welcome email failed", {
            durationMs: Date.now() - emailStartedAt,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }

    console.info("[api/subscribe] subscriber saved", {
      durationMs: Date.now() - startedAt,
      welcomeEmailScheduled: Boolean(result.sendWelcomeEmail),
    });

    return NextResponse.json({
      code: result.code,
      message: result.message,
      requiresConfirmation: !result.alreadyConfirmed,
    });
  } catch (error) {
    console.error("[api/subscribe] subscription failed", {
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        code: "subscription_failed",
        error:
          "We could not save your subscription right now. Please try again later.",
      },
      { status: 500 },
    );
  }
}
