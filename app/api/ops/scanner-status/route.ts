import { NextResponse } from "next/server";

import { getLocalScannerStatus } from "@/lib/local-scanner-status";
import {
  callVpsScannerAgent,
  hasVpsScannerAgentConfig,
  type VpsScannerAgentStatus,
} from "@/lib/vps-scanner-agent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      error: error.name || "Error",
      detail: error.message || "Unknown error",
      stack: process.env.NODE_ENV !== "production" ? error.stack ?? null : null,
    };
  }

  return {
    error: "UnknownError",
    detail: typeof error === "string" ? error : "Unknown scanner status error",
    stack: null,
  };
}

function unauthorizedResponse() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Lux Ops", charset="UTF-8"',
    },
  });
}

export async function GET(request: Request) {
  const expectedUser = process.env.OPS_BASIC_AUTH_USER;
  const expectedPassword = process.env.OPS_BASIC_AUTH_PASSWORD;

  if (expectedUser && expectedPassword) {
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
    } catch {
      return unauthorizedResponse();
    }
  }

  try {
    if (hasVpsScannerAgentConfig()) {
      const status = await callVpsScannerAgent<VpsScannerAgentStatus>("status");
      return NextResponse.json(
        {
          ...status,
          source: "vps",
        },
        {
          headers: {
            "Cache-Control": "no-store, max-age=0",
          },
        },
      );
    }

    const status = await getLocalScannerStatus();

    return NextResponse.json(status, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const payload = serializeError(error);

    return NextResponse.json(
      {
        error: "Scanner status failed.",
        detail: `${payload.error}: ${payload.detail}`,
        stack: payload.stack,
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }
}
