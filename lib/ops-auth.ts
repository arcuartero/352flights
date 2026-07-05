import { NextResponse } from "next/server";

export function unauthorizedOpsResponse() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Lux Ops", charset="UTF-8"',
    },
  });
}

export function ensureOpsAuthorized(request: Request) {
  const expectedUser = process.env.OPS_BASIC_AUTH_USER;
  const expectedPassword = process.env.OPS_BASIC_AUTH_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return null;
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) {
    return unauthorizedOpsResponse();
  }

  try {
    const decoded = atob(authorization.slice("Basic ".length));
    const separatorIndex = decoded.indexOf(":");
    const user = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : decoded;
    const password = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : "";

    if (user !== expectedUser || password !== expectedPassword) {
      return unauthorizedOpsResponse();
    }
  } catch {
    return unauthorizedOpsResponse();
  }

  return null;
}
