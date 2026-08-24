import "server-only";

import { constants } from "node:fs";
import { access, readFile, rm } from "node:fs/promises";

export const LOCAL_SCANNER_LOCK_DIR = "/tmp/luxcheapflights-scanner.lock";

export type LocalScannerLockOwner = "price_scanner" | "dates_scanner";

export type LocalScannerLockState = {
  exists: boolean;
  owner: LocalScannerLockOwner | null;
  pid: number | null;
  active: boolean;
};

async function pathExists(targetPath: string) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readText(targetPath: string) {
  try {
    return (await readFile(targetPath, "utf-8")).trim();
  } catch {
    return "";
  }
}

function processExists(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function parseOwner(value: string): LocalScannerLockOwner | null {
  return value === "price_scanner" || value === "dates_scanner" ? value : null;
}

function parsePid(value: string) {
  const pid = Number.parseInt(value, 10);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

export async function getLocalScannerLockState(): Promise<LocalScannerLockState> {
  if (!(await pathExists(LOCAL_SCANNER_LOCK_DIR))) {
    return { exists: false, owner: null, pid: null, active: false };
  }

  const [rawOwner, rawPid] = await Promise.all([
    readText(`${LOCAL_SCANNER_LOCK_DIR}/owner`),
    readText(`${LOCAL_SCANNER_LOCK_DIR}/pid`),
  ]);
  const owner = parseOwner(rawOwner);
  const pid = parsePid(rawPid);

  return {
    exists: true,
    owner,
    pid,
    active: pid !== null && processExists(pid),
  };
}

export async function removeStaleLocalScannerLock(owner: LocalScannerLockOwner) {
  const state = await getLocalScannerLockState();
  if (!state.exists || state.owner !== owner || state.active) {
    return false;
  }

  await rm(LOCAL_SCANNER_LOCK_DIR, { recursive: true, force: true });
  return true;
}
