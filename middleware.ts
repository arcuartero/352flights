import { NextRequest, NextResponse } from "next/server";

import { ensureOpsAuthorized } from "@/lib/ops-auth";

function isPrivatePathname(pathname: string) {
  return (
    pathname === "/ops" ||
    pathname.startsWith("/ops/") ||
    pathname.startsWith("/api/ops/") ||
    pathname.startsWith("/api/cron/") ||
    pathname === "/preferences" ||
    pathname.startsWith("/preferences/") ||
    pathname === "/api/preferences" ||
    pathname === "/confirm" ||
    pathname === "/unsubscribe"
  );
}

function applyCachePolicy(response: NextResponse, pathname: string) {
  if (isPrivatePathname(pathname)) {
    response.headers.set(
      "Cache-Control",
      "private, no-store, max-age=0, must-revalidate",
    );
    response.headers.set("Vercel-CDN-Cache-Control", "no-store");
    return response;
  }

  return response;
}

function localizedResponse(request: NextRequest) {
  const response = NextResponse.next();
  return applyCachePolicy(response, request.nextUrl.pathname);
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (
    pathname === "/ops" ||
    pathname.startsWith("/ops/") ||
    pathname === "/api/ops" ||
    pathname.startsWith("/api/ops/")
  ) {
    const unauthorized = ensureOpsAuthorized(request);
    if (unauthorized) return unauthorized;
  }
  return localizedResponse(request);
}

export const config = {
  matcher: [
    "/ops/:path*",
    "/api/ops/:path*",
    "/api/cron/:path*",
    "/preferences/:path*",
    "/api/preferences",
    "/confirm",
    "/unsubscribe",
  ],
};
