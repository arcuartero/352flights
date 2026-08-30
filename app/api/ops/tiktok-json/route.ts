import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureOpsAuthorized } from "@/lib/ops-auth";
import { CREATELLO_LANGUAGES, CREATELLO_TEMPLATES } from "@/lib/tiktok-carousel";
import { buildCreatelloDocument } from "@/lib/tiktok-carousel-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({
  template: z.enum(CREATELLO_TEMPLATES).default("travel-offer"),
  language: z.enum(CREATELLO_LANGUAGES).default("en"),
  originAirport: z.string().trim().min(3).max(4).default("LUX"),
  startMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  slideCount: z.coerce.number().int().min(1).max(20).default(5),
  offersPerSlide: z.coerce.number().int().min(3).max(10).default(3),
  maxPrice: z.coerce.number().positive().optional(),
});

export async function POST(request: Request) {
  const unauthorized = ensureOpsAuthorized(request);
  if (unauthorized) return unauthorized;

  try {
    const input = requestSchema.parse(await request.json());
    const result = await buildCreatelloDocument(input);
    return NextResponse.json(
      { ok: true, template: input.template, ...result },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo generar el JSON.";
    return NextResponse.json(
      { ok: false, reason: "tiktok_json_generation_failed", detail: message },
      {
        status: error instanceof z.ZodError ? 400 : 500,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }
}
