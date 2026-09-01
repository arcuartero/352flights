import { NextRequest, NextResponse } from "next/server";

import {
  parseLocalizedDealsPathname,
  getLocaleFromPathname,
  localeRequestHeader,
} from "@/lib/locales";

const CACHE_SECONDS = {
  home: 60 * 60,
  publicDeals: 30 * 60,
} as const;

function isHomePathname(pathname: string) {
  return pathname === "/" || /^\/(?:fr|de|pt|it|es)$/.test(pathname);
}

function isPrivatePathname(pathname: string) {
  return (
    pathname === "/ops" ||
    pathname.startsWith("/ops/") ||
    pathname === "/preferences" ||
    pathname.startsWith("/preferences/") ||
    pathname === "/api/preferences" ||
    pathname === "/confirm" ||
    pathname === "/unsubscribe"
  );
}

function applyCachePolicy(response: NextResponse, pathname: string) {
  if (isPrivatePathname(pathname)) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
    response.headers.set("Vercel-CDN-Cache-Control", "no-store");
    return response;
  }

  const seconds = isHomePathname(pathname)
    ? CACHE_SECONDS.home
    : parseLocalizedDealsPathname(pathname)
      ? CACHE_SECONDS.publicDeals
      : null;

  if (seconds !== null) {
    response.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
    response.headers.set(
      "Vercel-CDN-Cache-Control",
      `public, s-maxage=${seconds}, stale-while-revalidate=${seconds}`,
    );
  }

  return response;
}

function unauthorizedResponse() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      "WWW-Authenticate": 'Basic realm="Lux Ops", charset="UTF-8"',
    },
  });
}

function localizedResponse(request: NextRequest) {
  const locale = getLocaleFromPathname(request.nextUrl.pathname) ?? "en";
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(localeRequestHeader, locale);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  return applyCachePolicy(response, request.nextUrl.pathname);
}

export function middleware(request: NextRequest) {
  const isOpsRoute =
    request.nextUrl.pathname === "/ops" || request.nextUrl.pathname.startsWith("/ops/");

  if (!isOpsRoute) {
    return localizedResponse(request);
  }

  const expectedUser = process.env.OPS_BASIC_AUTH_USER;
  const expectedPassword = process.env.OPS_BASIC_AUTH_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return localizedResponse(request);
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) {
    return unauthorizedResponse();
  }

  try {
    const encoded = authorization.slice("Basic ".length);
    const decoded = atob(encoded);
    const separatorIndex = decoded.indexOf(":");
    const user = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : decoded;
    const password = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : "";

    if (user !== expectedUser || password !== expectedPassword) {
      return unauthorizedResponse();
    }

    return localizedResponse(request);
  } catch {
    return unauthorizedResponse();
  }
}

export const config = {
  matcher: [
    "/",
    "/deals/:path*",
    "/fr",
    "/fr/:path*",
    "/de",
    "/de/:path*",
    "/pt",
    "/pt/:path*",
    "/it",
    "/it/:path*",
    "/es",
    "/es/:path*",
    "/ops/:path*",
    "/preferences/:path*",
    "/api/preferences",
    "/confirm",
    "/unsubscribe",
  ],
};
