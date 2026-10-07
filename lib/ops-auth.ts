import { NextResponse } from "next/server";

import { constantTimeEqual } from "@/lib/secret-compare";

/** Shared by the Edge middleware, API handlers and server components/actions. */
export function isOpsAuthorized(
  authorization: string | null,
  credentials = {
    user: process.env.OPS_BASIC_AUTH_USER,
    password: process.env.OPS_BASIC_AUTH_PASSWORD,
  },
): boolean {
  if (!credentials.user || !credentials.password || !authorization)
    return false;
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);
  if (!match) return false;
  try {
    const bytes = Uint8Array.from(atob(match[1]), (character) =>
      character.charCodeAt(0),
    );
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return constantTimeEqual(
      decoded,
      credentials.user + ":" + credentials.password,
    );
  } catch {
    return false;
  }
}

export function unauthorizedOpsResponse() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Lux Ops", charset="UTF-8"',
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      "Vercel-CDN-Cache-Control": "no-store",
    },
  });
}

export function ensureOpsAuthorized(request: Request) {
  return isOpsAuthorized(request.headers.get("authorization"))
    ? null
    : unauthorizedOpsResponse();
}
