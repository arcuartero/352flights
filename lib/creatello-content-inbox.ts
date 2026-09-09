import "server-only";

import { createHmac } from "node:crypto";

import { getCreatelloInboxEnv } from "@/lib/env";
import {
  buildCreatelloInboxPackage,
  CREATELLO_INBOX_MAX_BYTES,
  createlloInboxPackageSchema,
  type CreatelloInboxPackage,
} from "@/lib/creatello-content-inbox-contract";
import { loadTikTokOffersByIds } from "@/lib/tiktok-carousel-data";
import type { CreatelloLanguage } from "@/lib/tiktok-carousel";

const REQUEST_TIMEOUT_MS = 15_000;

type CreatelloSuccess = {
  data: {
    id: string;
    source: string;
    externalId: string;
    revision: number;
    schemaVersion: number;
    status: string;
    receivedAt: string;
  };
  idempotent: boolean;
};

type CreatelloError = {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ path?: string; message?: string }>;
  };
};

function isSuccessPayload(value: unknown): value is CreatelloSuccess {
  if (!value || typeof value !== "object") return false;
  const data = (value as { data?: unknown }).data;
  return Boolean(data && typeof data === "object" && typeof (data as { id?: unknown }).id === "string");
}

function safeErrorMessage(value: unknown, status: number) {
  const payload = value as CreatelloError | null;
  const message = payload?.error?.message;
  const details = payload?.error?.details
    ?.map((detail) => [detail.path, detail.message].filter(Boolean).join(": "))
    .filter(Boolean)
    .slice(0, 5)
    .join("; ");
  if (typeof message === "string" && message.trim()) {
    return details ? `${message}: ${details}` : message;
  }
  return `Creatello rechazó el paquete (HTTP ${status}).`;
}

export async function sendCreatelloInboxPackage(payloadValue: CreatelloInboxPackage) {
  const env = getCreatelloInboxEnv();
  const payload = createlloInboxPackageSchema.parse(payloadValue);
  const rawBody = JSON.stringify(payload);
  if (Buffer.byteLength(rawBody, "utf8") > CREATELLO_INBOX_MAX_BYTES) {
    throw new Error("El paquete supera el límite de 256 KiB de Creatello.");
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", env.CREATELLO_CONTENT_INBOX_HMAC_SECRET)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(env.CREATELLO_CONTENT_INBOX_URL, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Creatello-Timestamp": timestamp,
        "X-Creatello-Signature": `sha256=${signature}`,
      },
      body: rawBody,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Creatello no respondió antes de 15 segundos.");
    }
    throw new Error("No se pudo conectar con Creatello.");
  } finally {
    clearTimeout(timeout);
  }

  const responseBody = await response.json().catch(() => null) as unknown;
  if (!response.ok || !isSuccessPayload(responseBody)) {
    throw new Error(safeErrorMessage(responseBody, response.status));
  }

  console.info("[creatello-inbox] package_sent", {
    inboxItemId: responseBody.data.id,
    externalId: payload.externalId,
    revision: payload.revision,
    offerCount: payload.offers.length,
    idempotent: responseBody.idempotent,
  });
  return responseBody;
}

export async function sendOffersToCreatello(input: {
  selectedOfferIds: number[];
  language: CreatelloLanguage;
  revision?: number;
}) {
  const offers = await loadTikTokOffersByIds(input.selectedOfferIds);
  const payload = buildCreatelloInboxPackage(offers, input.language, input.revision ?? 1);
  return sendCreatelloInboxPackage(payload);
}
