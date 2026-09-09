import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureOpsAuthorized } from "@/lib/ops-auth";
import { CREATELLO_LANGUAGES, CREATELLO_TEMPLATES } from "@/lib/tiktok-carousel";
import {
  buildCreatelloDocument,
  buildTikTokOfferProposal,
} from "@/lib/tiktok-carousel-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({
  mode: z.enum(["generate", "propose"]).default("generate"),
  template: z.enum(CREATELLO_TEMPLATES).default("travel-offer"),
  language: z.enum(CREATELLO_LANGUAGES).default("en"),
  originAirport: z.string().trim().min(3).max(4).default("LUX"),
  startMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  slideCount: z.coerce.number().int().min(1).max(20).default(5),
  monthCount: z.coerce.number().int().min(1).max(20).default(3),
  offersPerSlide: z.coerce.number().int().min(3).max(10).default(3),
  maxPrice: z.coerce.number().positive().optional(),
  proposalSort: z.enum(["cheapest", "freshest", "direct"]).default("cheapest"),
  candidateLimit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function POST(request: Request) {
  const unauthorized = ensureOpsAuthorized(request);
  if (unauthorized) return unauthorized;

  try {
    const input = requestSchema.parse(await request.json());
    if (input.mode === "propose") {
      const proposal = await buildTikTokOfferProposal({
        originAirport: input.originAirport,
        startMonth: input.startMonth,
        monthCount: input.monthCount,
        candidateLimit: input.candidateLimit,
        sort: input.proposalSort,
        maxPrice: input.maxPrice,
      });
      return NextResponse.json(
        { ok: true, mode: "propose", ...proposal },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }
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
