import { access, constants } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { NextResponse } from "next/server";

import { getLocalScannerStatus, resolveScannerRoot } from "@/lib/local-scanner-status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorizedResponse() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Lux Ops", charset="UTF-8"',
    },
  });
}

async function ensureAuthorized(request: Request) {
  const expectedUser = process.env.OPS_BASIC_AUTH_USER;
  const expectedPassword = process.env.OPS_BASIC_AUTH_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return null;
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
  } catch {
    return unauthorizedResponse();
  }

  return null;
}

async function pathExists(targetPath: string) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const unauthorized = await ensureAuthorized(request);
  if (unauthorized) {
    return unauthorized;
  }

  const status = await getLocalScannerStatus();
  if (status.running) {
    return NextResponse.json(
      {
        ok: false,
        reason: "already_running",
      },
      { status: 409 },
    );
  }

  const scannerRoot = await resolveScannerRoot();
  if (!scannerRoot) {
    return NextResponse.json(
      {
        ok: false,
        reason: "scanner_unavailable",
      },
      { status: 503 },
    );
  }

  const scriptPath = path.join(scannerRoot, "scripts", "run-local-scanner.sh");
  if (!(await pathExists(scriptPath))) {
    return NextResponse.json(
      {
        ok: false,
        reason: "script_missing",
      },
      { status: 500 },
    );
  }

  const child = spawn("zsh", [scriptPath, "--force"], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  return NextResponse.json({
    ok: true,
    reason: "started",
  });
}
