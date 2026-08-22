import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

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

const VPS_SCANNER_AGENT_TIMEOUT_MS = 10_000;

function errorCode(error: unknown) {
  const cause =
    error instanceof Error && error.cause && typeof error.cause === "object"
      ? error.cause
      : null;
  return cause && "code" in cause && typeof cause.code === "string" ? cause.code : null;
}

function fallbackIp() {
  const value = process.env.VPS_SCANNER_AGENT_IP?.trim();
  if (!value) return null;
  if (isIP(value) === 0) {
    throw new Error("VPS_SCANNER_AGENT_IP must be a valid IPv4 or IPv6 address.");
  }
  return value;
}

async function callVpsScannerAgentByIp<T>(
  url: URL,
  token: string,
  init: RequestInit,
): Promise<T> {
  const ip = fallbackIp();
  if (!ip || url.protocol !== "https:") {
    throw new Error("The secure VPS scanner IP fallback is not configured.");
  }

  if (init.body != null && typeof init.body !== "string") {
    throw new Error("The VPS scanner IP fallback only supports text request bodies.");
  }

  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((value, key) => {
    headers[key] = value;
  });
  headers.authorization = `Bearer ${token}`;
  headers.accept = "application/json";
  headers.host = url.host;

  return new Promise<T>((resolve, reject) => {
    const request = httpsRequest(
      {
        hostname: ip,
        port: url.port || 443,
        servername: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: init.method ?? "GET",
        headers,
        rejectUnauthorized: true,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let payload: T | null = null;
          try {
            payload = raw ? (JSON.parse(raw) as T) : null;
          } catch {
            payload = null;
          }

          const statusCode = response.statusCode ?? 500;
          if (statusCode < 200 || statusCode >= 300) {
            const detail =
              payload && typeof payload === "object" && "reason" in payload
                ? String((payload as { reason?: unknown }).reason)
                : response.statusMessage ?? `HTTP ${statusCode}`;
            reject(new Error(`VPS scanner agent failed: ${detail}`));
            return;
          }
          if (!payload) {
            reject(new Error("VPS scanner agent returned an empty response."));
            return;
          }
          resolve(payload);
        });
      },
    );

    request.setTimeout(VPS_SCANNER_AGENT_TIMEOUT_MS, () => {
      request.destroy(new Error("VPS scanner agent IP fallback timed out."));
    });
    request.on("error", reject);

    const signal = init.signal;
    if (signal) {
      const abortRequest = () => {
        request.destroy(
          signal.reason instanceof Error ? signal.reason : new Error("VPS scanner request aborted."),
        );
      };
      if (signal.aborted) abortRequest();
      else signal.addEventListener("abort", abortRequest, { once: true });
    }

    if (typeof init.body === "string") request.write(init.body);
    request.end();
  });
}

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

  const url = scannerAgentUrl(path);
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
      signal: init.signal ?? AbortSignal.timeout(VPS_SCANNER_AGENT_TIMEOUT_MS),
    });
  } catch (error) {
    const causeCode = errorCode(error);
    if ((causeCode === "ENOTFOUND" || causeCode === "EAI_AGAIN") && fallbackIp()) {
      try {
        return await callVpsScannerAgentByIp<T>(url, token, init);
      } catch (fallbackError) {
        const fallbackReason =
          fallbackError instanceof Error ? fallbackError.message : "unknown fallback error";
        throw new Error(
          `VPS scanner agent connection failed (${causeCode}) at ${url.hostname}; secure IP fallback also failed: ${fallbackReason}`,
          { cause: fallbackError },
        );
      }
    }
    const reason =
      causeCode ?? (error instanceof Error ? error.message : "unknown connection error");
    throw new Error(
      `VPS scanner agent connection failed (${reason}) at ${url.hostname}.`,
      { cause: error },
    );
  }

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
