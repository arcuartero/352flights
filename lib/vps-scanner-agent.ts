export type VpsScannerAgentStatus = {
  ok: boolean;
  serviceName: string;
  timerName: string;
  root: string;
  running: boolean;
  service: Record<string, string>;
  timer: Record<string, string>;
  journal: string[];
  latestScannerLog: {
    path?: string;
    error?: string;
    tail?: string[];
  } | null;
  latestSyncLog: {
    path?: string;
    error?: string;
    tail?: string[];
  } | null;
};

export type VpsScannerActionResponse = {
  ok: boolean;
  reason: string;
  stdout?: string;
  stderr?: string;
  status?: VpsScannerAgentStatus;
};

export function hasVpsScannerAgentConfig() {
  return Boolean(process.env.VPS_SCANNER_AGENT_URL && process.env.VPS_SCANNER_AGENT_TOKEN);
}

function scannerAgentUrl(path: string) {
  const baseUrl = process.env.VPS_SCANNER_AGENT_URL;
  if (!baseUrl) {
    throw new Error("Missing VPS_SCANNER_AGENT_URL.");
  }

  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (url.protocol !== "https:" && process.env.VPS_SCANNER_ALLOW_INSECURE_HTTP !== "1") {
    throw new Error("VPS_SCANNER_AGENT_URL must use HTTPS.");
  }

  return url;
}

export async function callVpsScannerAgent<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = process.env.VPS_SCANNER_AGENT_TOKEN;
  if (!token) {
    throw new Error("Missing VPS_SCANNER_AGENT_TOKEN.");
  }

  const response = await fetch(scannerAgentUrl(path), {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "reason" in payload
        ? String((payload as { reason?: unknown }).reason)
        : response.statusText;
    throw new Error(`VPS scanner agent failed: ${detail}`);
  }

  if (!payload) {
    throw new Error("VPS scanner agent returned an empty response.");
  }

  return payload;
}
