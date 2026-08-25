import { access, constants } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { NextResponse } from "next/server";

import { getLocalScannerLockState } from "@/lib/local-scanner-lock";
import { getLocalPatternDiscoveryStatus } from "@/lib/local-pattern-discovery-status";
import { resolveScannerRoot } from "@/lib/local-scanner-status";
import {
  callVpsScannerAgent,
  hasVpsScannerAgentConfig,
  type VpsScannerActionResponse,
} from "@/lib/vps-scanner-agent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AIRPORT_CODE_PATTERN = /^[A-Z0-9]{3}$/;
const ROUTING_VALUES = new Set([
  "NON_STOP",
  "ONE_STOP_OR_FEWER",
  "TWO_OR_FEWER_STOPS",
  "ANY",
]);

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

function vpsFailureReason(error: unknown) {
  if (!(error instanceof Error)) {
    return null;
  }

  return error.message.match(/VPS scanner agent failed:\s*([a-z0-9_]+)/i)?.[1] ?? null;
}

export async function POST(request: Request) {
  const unauthorized = await ensureAuthorized(request);
  if (unauthorized) {
    return unauthorized;
  }

  let routeFilter:
    | {
        originAirport: string;
        destinationAirport: string;
        maxStops: string;
      }
    | null = null;

  try {
    const rawBody = await request.text();
    const payload = (rawBody.trim() ? JSON.parse(rawBody) : {}) as
      | {
          route?: {
            originAirport?: string;
            destinationAirport?: string;
            maxStops?: string;
          };
        }
      | null;
    if (payload?.route !== undefined) {
      const originAirport = payload.route.originAirport?.trim().toUpperCase() ?? "";
      const destinationAirport = payload.route.destinationAirport?.trim().toUpperCase() ?? "";
      const maxStops = payload.route.maxStops?.trim().toUpperCase() ?? "";
      if (
        !AIRPORT_CODE_PATTERN.test(originAirport) ||
        !AIRPORT_CODE_PATTERN.test(destinationAirport) ||
        !ROUTING_VALUES.has(maxStops)
      ) {
        return NextResponse.json(
          {
            ok: false,
            reason: "invalid_route_scope",
            detail: "A route scan requires valid origin, destination, and routing values.",
          },
          { status: 400 },
        );
      }

      routeFilter = {
        originAirport,
        destinationAirport,
        maxStops,
      };
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: "invalid_request",
        detail: error instanceof Error ? error.message : "The request body is not valid JSON.",
      },
      { status: 400 },
    );
  }

  if (hasVpsScannerAgentConfig()) {
    try {
      const result = await callVpsScannerAgent<VpsScannerActionResponse>(
        "pattern-discovery/start",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            forceRefresh: true,
            ...(routeFilter ? { route: routeFilter } : {}),
          }),
        },
      );
      return NextResponse.json(result, {
        headers: { "Cache-Control": "no-store, max-age=0" },
      });
    } catch (error) {
      const agentReason = vpsFailureReason(error);
      const isConflict = agentReason === "already_running" || agentReason === "scanner_busy";
      return NextResponse.json(
        {
          ok: false,
          reason: agentReason ?? "vps_pattern_discovery_start_failed",
          detail: error instanceof Error ? error.message : "Unknown VPS Dates Scanner error.",
        },
        { status: isConflict ? 409 : 502 },
      );
    }
  }

  const status = await getLocalPatternDiscoveryStatus();
  if (status.running) {
    return NextResponse.json(
      {
        ok: false,
        reason: "already_running",
      },
      { status: 409 },
    );
  }

  const sharedLock = await getLocalScannerLockState();
  if (sharedLock.active) {
    return NextResponse.json(
      {
        ok: false,
        reason: "scanner_busy",
        activeScanner: sharedLock.owner,
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

  const scriptPath = path.join(scannerRoot, "scripts", "run-local-pattern-discovery.sh");
  if (!(await pathExists(scriptPath))) {
    return NextResponse.json(
      {
        ok: false,
        reason: "script_missing",
      },
      { status: 500 },
    );
  }

  const args = ["--force", "--refresh-service-months"];
  if (routeFilter) {
    args.push(
      "--origin-airport",
      routeFilter.originAirport,
      "--destination-airport",
      routeFilter.destinationAirport,
      "--max-stops",
      routeFilter.maxStops,
    );
  }

  const child = spawn("zsh", [scriptPath, ...args], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  return NextResponse.json({
    ok: true,
    reason: "started",
    forceRefresh: true,
    carrierScope: "all_airlines",
    routeScope: routeFilter,
  });
}
