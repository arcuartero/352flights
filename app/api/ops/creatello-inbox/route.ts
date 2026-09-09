import { NextResponse } from "next/server";
import { z } from "zod";

import { sendOffersToCreatello } from "@/lib/creatello-content-inbox";
import { hasCreatelloInboxEnv } from "@/lib/env";
import { ensureOpsAuthorized } from "@/lib/ops-auth";
import { CREATELLO_LANGUAGES } from "@/lib/tiktok-carousel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({
  selectedOfferIds: z.array(z.number().int().positive()).min(1).max(20)
    .refine((ids) => new Set(ids).size === ids.length, "No se permiten IDs duplicados"),
  language: z.enum(CREATELLO_LANGUAGES),
  revision: z.number().int().positive().max(2_147_483_647).default(1),
}).strict();

export async function POST(request: Request) {
  const unauthorized = ensureOpsAuthorized(request);
  if (unauthorized) return unauthorized;

  if (!hasCreatelloInboxEnv()) {
    return NextResponse.json(
      {
        ok: false,
        reason: "creatello_integration_not_configured",
        detail: "Faltan las variables privadas de integración con Creatello.",
      },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  let offerCount: number | undefined;
  try {
    const input = requestSchema.parse(await request.json());
    offerCount = input.selectedOfferIds.length;
    const result = await sendOffersToCreatello(input);
    return NextResponse.json(
      { ok: true, inboxItem: result.data, idempotent: result.idempotent },
      { status: result.idempotent ? 200 : 201, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          reason: "invalid_request",
          detail: "La selección enviada no es válida.",
          issues: error.issues.map((issue) => ({
            path: issue.path.join(".") || "$",
            message: issue.message,
          })),
        },
        { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    const detail = error instanceof Error ? error.message : "No se pudo enviar el paquete.";
    console.error("[creatello-inbox] send_failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      offerCount,
    });
    return NextResponse.json(
      { ok: false, reason: "creatello_send_failed", detail },
      { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
