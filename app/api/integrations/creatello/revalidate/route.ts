import { NextResponse } from "next/server";
import { getRevalidationSecret, revalidateCreatelloOffers, revalidationRequestSchema, verifyRevalidationSignature } from "@/lib/creatello-revalidation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 256 * 1024) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 256 * 1024) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  let secret: string;
  try { secret = getRevalidationSecret(); }
  catch { return NextResponse.json({ error: "integration_not_configured" }, { status: 503 }); }
  if (!verifyRevalidationSignature(rawBody, request.headers.get("x-352-timestamp"), request.headers.get("x-352-signature"), secret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }
  let json: unknown;
  try { json = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = revalidationRequestSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload", issues: parsed.error.issues.slice(0, 20).map((issue) => ({ path: issue.path.join("."), message: issue.message })) }, { status: 400 });
  try {
    return NextResponse.json(await revalidateCreatelloOffers(parsed.data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[creatello-revalidation] failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "revalidation_failed" }, { status: 500 });
  }
}

