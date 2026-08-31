import { NextRequest, NextResponse } from "next/server";

import {
  getLocaleFromPathname,
  localeRequestHeader,
} from "@/lib/locales";

function unauthorizedResponse() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Lux Ops", charset="UTF-8"',
    },
  });
}

function localizedResponse(request: NextRequest) {
  const locale = getLocaleFromPathname(request.nextUrl.pathname) ?? "en";
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(localeRequestHeader, locale);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
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
  ],
};
