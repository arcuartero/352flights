import { access, appendFile, constants, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { NextResponse } from "next/server";

import { getLocalScannerStatus, resolveScannerRoot } from "@/lib/local-scanner-status";
import {
  callVpsScannerAgent,
  hasVpsScannerAgentConfig,
  type VpsScannerActionResponse,
} from "@/lib/vps-scanner-agent";

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

async function runPkill(signal: "TERM" | "KILL", pattern: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("pkill", [`-${signal}`, "-f", pattern], {
      stdio: "ignore",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || code === 1) {
        resolve();
        return;
      }

      reject(new Error(`pkill exited with code ${code ?? "unknown"}`));
    });
  });
}

async function readPid(targetPath: string) {
  try {
    const raw = (await readFile(targetPath, "utf-8")).trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function signalPid(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(pid, signal);
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ESRCH"
    ) {
      return false;
    }

    throw error;
  }
}

function signalProcessGroup(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ESRCH"
    ) {
      return false;
    }

    return false;
  }
}

async function cleanupStateFiles(scannerRoot: string) {
  await Promise.allSettled([
    rm("/tmp/luxcheapflights-local-scan.lock", {
      recursive: true,
      force: true,
    }),
    rm(path.join(scannerRoot, "scanner", "state", "local-scanner.pid"), {
      force: true,
    }),
    rm(path.join(scannerRoot, "scanner", "state", "local-scanner.child.pid"), {
      force: true,
    }),
  ]);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  const unauthorized = await ensureAuthorized(request);
  if (unauthorized) {
    return unauthorized;
  }

  if (hasVpsScannerAgentConfig()) {
    try {
      const result = await callVpsScannerAgent<VpsScannerActionResponse>("stop", {
        method: "POST",
      });
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          reason: "vps_stop_failed",
          detail: error instanceof Error ? error.message : "Unknown VPS scanner error.",
        },
        { status: 502 },
      );
    }
  }

  const status = await getLocalScannerStatus();
  if (!status.running) {
    return NextResponse.json({
      ok: true,
      reason: "already_stopped",
    });
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
  const stdoutLog = path.join(scannerRoot, "logs", "local-scanner.stdout.log");
  const pidFile = path.join(scannerRoot, "scanner", "state", "local-scanner.pid");
  const childPidFile = path.join(scannerRoot, "scanner", "state", "local-scanner.child.pid");
  const patterns = [
    scriptPath,
    "uv run luxflight-scan --json",
    `${path.join(scannerRoot, "scanner", ".venv", "bin", "luxflight-scan")} --json`,
  ];

  if (await pathExists(stdoutLog)) {
    await appendFile(
      stdoutLog,
      `[${new Date().toISOString().replace("T", " ").slice(0, 19)}] Stop requested from ops UI.\n`,
    ).catch(() => undefined);
  }

  const scriptPid = await readPid(pidFile);
  const childPid = await readPid(childPidFile);

  if (childPid) {
    signalPid(childPid, "SIGTERM");
  }
  if (scriptPid) {
    signalProcessGroup(scriptPid, "SIGTERM");
    signalPid(scriptPid, "SIGTERM");
  }

  for (const pattern of patterns) {
    await runPkill("TERM", pattern);
  }

  await wait(900);
  const afterTerm = await getLocalScannerStatus();
  if (!afterTerm.running) {
    await cleanupStateFiles(scannerRoot);
    return NextResponse.json({
      ok: true,
      reason: "stopped",
    });
  }

  if (childPid) {
    signalPid(childPid, "SIGKILL");
  }
  if (scriptPid) {
    signalProcessGroup(scriptPid, "SIGKILL");
    signalPid(scriptPid, "SIGKILL");
  }

  for (const pattern of patterns) {
    await runPkill("KILL", pattern);
  }

  await wait(500);
  const finalStatus = await getLocalScannerStatus();
  if (!finalStatus.running) {
    await cleanupStateFiles(scannerRoot);
  }

  return NextResponse.json(
    {
      ok: !finalStatus.running,
      reason: finalStatus.running ? "still_running" : "stopped",
    },
    { status: finalStatus.running ? 409 : 200 },
  );
}
