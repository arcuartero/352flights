import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;

type Violation = {
  directive: string;
  blocked: string;
  page: string;
};

/** Origin and path only: subscriber pages carry tokens in their query strings. */
function redact(value: unknown) {
  if (typeof value !== "string" || value.length === 0) return "";
  try {
    const url = new URL(value);
    return url.protocol.startsWith("http") ? `${url.origin}${url.pathname}` : url.protocol;
  } catch {
    return value.slice(0, 40); // keywords such as "inline" or "eval"
  }
}

function normalize(report: Record<string, unknown>): Violation {
  return {
    directive: String(
      report["effectiveDirective"] ?? report["effective-directive"] ?? report["violated-directive"] ?? "",
    ).slice(0, 60),
    blocked: redact(report["blockedURL"] ?? report["blocked-uri"]),
    page: redact(report["documentURL"] ?? report["document-uri"]),
  };
}

/** Receives Content-Security-Policy-Report-Only violations (legacy report-uri and Reporting API). */
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const reports = (Array.isArray(parsed) ? parsed : [parsed])
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const body = record["csp-report"] ?? (record.type === "csp-violation" ? record.body : null);
      return body && typeof body === "object" ? normalize(body as Record<string, unknown>) : null;
    })
    .filter((report): report is Violation => report !== null)
    .slice(0, 20);

  for (const report of reports) console.warn("[csp-report]", report);
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
