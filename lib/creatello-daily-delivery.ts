import "server-only";

import { createHash } from "node:crypto";

import {
  buildCreatelloInboxPackage,
  createlloInboxPackageSchema,
  type CreatelloInboxPackage,
  type CreatelloInboxTargetTemplate,
} from "@/lib/creatello-content-inbox-contract";
import { sendCreatelloInboxPackage } from "@/lib/creatello-content-inbox";
import {
  DAILY_CREATELLO_TEMPLATES,
  dailyCreatelloCutoff,
  dailyCreatelloDateKey,
  dailyCreatelloDestinationKey,
  planDailyCreatelloPackages,
} from "@/lib/creatello-daily-selection";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type { CreatelloLanguage, TikTokSourceOffer } from "@/lib/tiktok-carousel";

const DAILY_LANGUAGE: CreatelloLanguage = "es";
const DAILY_ORIGIN_AIRPORT = "LUX";
const CANDIDATE_WINDOW_HOURS = 24;
const PAGE_SIZE = 1000;
const MAX_CANDIDATES = 5000;

type RouteRow = {
  id: string;
  origin_airport: string;
  destination_airport: string;
  destination_city: string;
};

type SnapshotRow = {
  id: number;
  route_id: string;
  price: number;
  currency: string;
  departure_date: string;
  return_date: string | null;
  max_stops: string;
  scanned_at: string;
  metadata: Record<string, unknown>;
};

type DailyDeliveryRow = {
  id: string;
  delivery_date: string;
  target_template: CreatelloInboxTargetTemplate;
  language: CreatelloLanguage;
  offer_count: number;
  payload: CreatelloInboxPackage;
  payload_hash: string;
  status: "pending" | "sent" | "failed";
  attempts: number;
  creatello_inbox_item_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
};

function safeDeliveryError(error: unknown) {
  const message = error instanceof Error ? error.message : "Error desconocido";
  return message.replace(/[\r\n\t]+/g, " ").slice(0, 500);
}

function packageHash(payload: CreatelloInboxPackage) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function loadCandidateOffers(dateKey: string) {
  const supabase = getSupabaseAdminClient();
  const cutoff = dailyCreatelloCutoff(dateKey);
  const windowStart = new Date(cutoff.getTime() - CANDIDATE_WINDOW_HOURS * 60 * 60 * 1000);
  const { data: routesData, error: routesError } = await supabase
    .from("scanned_routes")
    .select("id,origin_airport,destination_airport,destination_city")
    .eq("is_active", true)
    .eq("origin_airport", DAILY_ORIGIN_AIRPORT);
  if (routesError) throw routesError;

  const routes = (routesData ?? []) as RouteRow[];
  const routeMap = new Map(routes.map((route) => [route.id, route]));
  const routeIds = routes.map((route) => route.id);
  if (!routeIds.length) return [];

  const snapshots: SnapshotRow[] = [];
  for (let from = 0; from < MAX_CANDIDATES; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("price_snapshots")
      .select("id,route_id,price,currency,departure_date,return_date,max_stops,scanned_at,metadata")
      .in("route_id", routeIds)
      .eq("metadata->>public_fare_eligible", "true")
      .gte("departure_date", dateKey)
      .not("return_date", "is", null)
      .gte("scanned_at", windowStart.toISOString())
      .lte("scanned_at", cutoff.toISOString())
      .order("scanned_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, Math.min(from + PAGE_SIZE - 1, MAX_CANDIDATES - 1));
    if (error) throw error;
    const page = (data ?? []) as SnapshotRow[];
    snapshots.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return snapshots.flatMap((snapshot): TikTokSourceOffer[] => {
    const route = routeMap.get(snapshot.route_id);
    if (!route || !snapshot.return_date) return [];
    return [{
      id: snapshot.id,
      originAirport: route.origin_airport,
      originCity: "Luxemburgo",
      destinationAirport: route.destination_airport,
      destinationCity: route.destination_city,
      departureDate: snapshot.departure_date,
      returnDate: snapshot.return_date,
      price: Number(snapshot.price),
      currency: snapshot.currency,
      maxStops: snapshot.max_stops,
      scannedAt: snapshot.scanned_at,
      metadata: snapshot.metadata,
    }];
  });
}

async function loadExistingDailyDeliveries(dateKey: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("creatello_daily_deliveries")
    .select("*")
    .eq("delivery_date", dateKey);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    payload: createlloInboxPackageSchema.parse(row.payload),
  })) as DailyDeliveryRow[];
}

async function loadUsedOffers() {
  const supabase = getSupabaseAdminClient();
  const itineraryKeys = new Set<string>();
  const sourceSnapshotIds = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("creatello_daily_delivery_offers")
      .select("source_snapshot_id,itinerary_key")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    for (const row of page) {
      itineraryKeys.add(String(row.itinerary_key));
      sourceSnapshotIds.add(`price-snapshot:${row.source_snapshot_id}`);
    }
    if (page.length < PAGE_SIZE) break;
  }
  return { itineraryKeys, sourceSnapshotIds };
}

async function reserveDelivery(input: {
  dateKey: string;
  targetTemplate: CreatelloInboxTargetTemplate;
  payload: CreatelloInboxPackage;
  sourceSnapshotIds: number[];
}) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("reserve_creatello_daily_delivery", {
    p_delivery_date: input.dateKey,
    p_target_template: input.targetTemplate,
    p_language: input.payload.language,
    p_payload: input.payload,
    p_payload_hash: packageHash(input.payload),
    p_source_snapshot_ids: input.sourceSnapshotIds,
    p_itinerary_keys: input.payload.offers.map((offer) => offer.itineraryKey),
    p_destination_airports: input.payload.offers.map((offer) => offer.destinationAirport),
  });
  if (error) throw error;
  const result = data as { created?: unknown; delivery?: unknown } | null;
  if (!result?.delivery) throw new Error("Supabase no devolvió la reserva diaria de Creatello.");
  const row = result.delivery as DailyDeliveryRow;
  return {
    ...row,
    payload: createlloInboxPackageSchema.parse(row.payload),
  } satisfies DailyDeliveryRow;
}

async function deliver(row: DailyDeliveryRow) {
  if (row.status === "sent") {
    return {
      targetTemplate: row.target_template,
      offerCount: row.offer_count,
      inboxItemId: row.creatello_inbox_item_id,
      idempotent: true,
      state: "already_sent" as const,
    };
  }

  const supabase = getSupabaseAdminClient();
  const attemptAt = new Date().toISOString();
  const { error: attemptError } = await supabase
    .from("creatello_daily_deliveries")
    .update({
      attempts: row.attempts + 1,
      status: "pending",
      last_error: null,
      updated_at: attemptAt,
    })
    .eq("id", row.id);
  if (attemptError) throw attemptError;

  try {
    const response = await sendCreatelloInboxPackage(row.payload);
    const sentAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("creatello_daily_deliveries")
      .update({
        status: "sent",
        creatello_inbox_item_id: response.data.id,
        sent_at: sentAt,
        updated_at: sentAt,
      })
      .eq("id", row.id);
    if (updateError) throw updateError;
    return {
      targetTemplate: row.target_template,
      offerCount: row.offer_count,
      inboxItemId: response.data.id,
      idempotent: response.idempotent,
      state: "sent" as const,
    };
  } catch (error) {
    const failedAt = new Date().toISOString();
    await supabase
      .from("creatello_daily_deliveries")
      .update({
        status: "failed",
        last_error: safeDeliveryError(error),
        updated_at: failedAt,
      })
      .eq("id", row.id);
    throw error;
  }
}

export async function runDailyCreatelloDelivery(now = new Date()) {
  const dateKey = dailyCreatelloDateKey(now);
  const [offers, existing, used] = await Promise.all([
    loadCandidateOffers(dateKey),
    loadExistingDailyDeliveries(dateKey),
    loadUsedOffers(),
  ]);
  const existingTemplates = new Set(existing.map((row) => row.target_template));
  const reservedTodayDestinationKeys = existing.flatMap((row) =>
    row.payload.offers.map((offer) => dailyCreatelloDestinationKey(offer.destinationCity)));
  const missingTemplates = DAILY_CREATELLO_TEMPLATES.filter((template) => !existingTemplates.has(template));
  const plan = planDailyCreatelloPackages({
    offers,
    language: DAILY_LANGUAGE,
    dateKey,
    usedItineraryKeys: used.itineraryKeys,
    usedSourceSnapshotIds: used.sourceSnapshotIds,
    reservedTodayDestinationKeys,
    templates: missingTemplates,
  });

  const cutoff = dailyCreatelloCutoff(dateKey).toISOString();
  const reserved: DailyDeliveryRow[] = [];
  for (const item of plan.plans) {
    const payload = buildCreatelloInboxPackage(item.offers, DAILY_LANGUAGE, 1, {
      targetTemplate: item.targetTemplate,
      externalId: `daily:${dateKey}:${item.targetTemplate}`,
      createdAt: cutoff,
    });
    reserved.push(await reserveDelivery({
      dateKey,
      targetTemplate: item.targetTemplate,
      payload,
      sourceSnapshotIds: item.offers.map((offer) => offer.id),
    }));
  }

  const deliveries = [...existing, ...reserved];
  const settled = await Promise.allSettled(deliveries.map(deliver));
  const delivered = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const failed = settled.flatMap((result, index) => result.status === "rejected" ? [{
    targetTemplate: deliveries[index].target_template,
    reason: safeDeliveryError(result.reason),
  }] : []);

  console.info("[creatello-daily] run_completed", {
    dateKey,
    candidateCount: offers.length,
    validCandidateCount: plan.validCandidateCount,
    delivered: delivered.map((item) => ({ template: item.targetTemplate, count: item.offerCount, state: item.state })),
    skipped: plan.skipped,
    failed: failed.map((item) => ({ template: item.targetTemplate })),
  });

  return {
    ok: failed.length === 0 && plan.skipped.length === 0 && delivered.length === DAILY_CREATELLO_TEMPLATES.length,
    date: dateKey,
    cutoff,
    candidateCount: offers.length,
    validCandidateCount: plan.validCandidateCount,
    delivered,
    skipped: plan.skipped,
    failed,
  };
}
