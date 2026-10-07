import { NextResponse } from "next/server";
import { z } from "zod";

import { hasSupabaseAdminEnv } from "@/lib/env";
import { unsubscribeSubscriberByToken } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

const tokenSchema = z.string().uuid();
const noStore = { "Cache-Control": "private, no-store, max-age=0" };

/**
 * RFC 8058 one-click unsubscribe, called by mailbox providers from the
 * List-Unsubscribe header. Humans keep using the /unsubscribe form, which
 * protects against link scanners; providers send an explicit POST instead.
 */
export async function POST(request: Request) {
  const token = tokenSchema.safeParse(
    new URL(request.url).searchParams.get("token"),
  );
  if (!token.success) {
    return NextResponse.json(
      { error: "invalid_token" },
      { status: 400, headers: noStore },
    );
  }
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json(
      { error: "unavailable" },
      { status: 503, headers: noStore },
    );
  }

  try {
    await unsubscribeSubscriberByToken(token.data);
    return new NextResponse(null, { status: 200, headers: noStore });
  } catch {
    return NextResponse.json(
      { error: "unsubscribe_failed" },
      { status: 404, headers: noStore },
    );
  }
}

/** A person opening the header URL lands on the confirmation form, never an implicit unsubscribe. */
export function GET(request: Request) {
  const url = new URL(request.url);
  const target = new URL("/unsubscribe", url.origin);
  const token = url.searchParams.get("token");
  if (token) target.searchParams.set("token", token);
  return NextResponse.redirect(target, { status: 303, headers: noStore });
}
