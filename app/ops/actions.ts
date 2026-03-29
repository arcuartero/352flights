"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { initialOpsActionState, type OpsActionState } from "@/lib/ops-shared";
import {
  sendApprovedDealCampaign,
  sendCampaignTestEmail,
  updateDealStatus,
  updateDigestAutomation,
} from "@/lib/ops";

async function assertOpsAccess() {
  const expectedUser = process.env.OPS_BASIC_AUTH_USER;
  const expectedPassword = process.env.OPS_BASIC_AUTH_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return;
  }

  const headerStore = await headers();
  const authorization = headerStore.get("authorization");

  if (!authorization?.startsWith("Basic ")) {
    throw new Error("Unauthorized ops action.");
  }

  const encoded = authorization.slice("Basic ".length);
  const decoded = Buffer.from(encoded, "base64").toString("utf-8");
  const separatorIndex = decoded.indexOf(":");
  const user = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : decoded;
  const password = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : "";

  if (user !== expectedUser || password !== expectedPassword) {
    throw new Error("Unauthorized ops action.");
  }
}

export async function reviewDealAction(formData: FormData) {
  await assertOpsAccess();

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!id || (status !== "reviewed" && status !== "expired")) {
    throw new Error("Invalid review payload.");
  }

  await updateDealStatus({
    id,
    status,
  });

  revalidatePath("/ops");
}

export async function sendCampaignAction(
  _previousState: OpsActionState = initialOpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  try {
    await assertOpsAccess();

    const sendType = String(formData.get("sendType") ?? "");
    if (sendType !== "digest" && sendType !== "flash") {
      return {
        tone: "error",
        message: "Invalid campaign type.",
      };
    }

    const result = await sendApprovedDealCampaign({
      sendType,
    });

    revalidatePath("/ops");

    return {
      tone: "success",
      message:
        result.failedCount > 0
          ? `${result.sentCount} emails sent and ${result.failedCount} failed in the ${sendType} campaign.`
          : `${result.sentCount} emails sent in the ${sendType} campaign.`,
    };
  } catch (error) {
    return {
      tone: "error",
      message:
        error instanceof Error ? error.message : "The campaign could not be sent right now.",
    };
  }
}

export async function sendCampaignTestAction(
  _previousState: OpsActionState = initialOpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  try {
    await assertOpsAccess();

    const sendType = String(formData.get("sendType") ?? "");
    const testEmail = String(formData.get("testEmail") ?? "").trim();

    if (sendType !== "digest" && sendType !== "flash") {
      return {
        tone: "error",
        message: "Invalid campaign type.",
      };
    }

    const result = await sendCampaignTestEmail({
      sendType,
      testEmail,
    });

    return {
      tone: "success",
      message: `Test ${sendType} email sent to ${result.email}.`,
    };
  } catch (error) {
    return {
      tone: "error",
      message:
        error instanceof Error ? error.message : "The test email could not be sent right now.",
    };
  }
}

export async function saveDigestAutomationAction(
  _previousState: OpsActionState = initialOpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  try {
    await assertOpsAccess();

    const enabled = formData.get("enabled") === "on";
    const localTime = String(formData.get("localTime") ?? "");
    const testEmail = String(formData.get("testEmail") ?? "").trim();

    if (!/^\d{2}:\d{2}$/.test(localTime)) {
      return {
        tone: "error",
        message: "Pick a valid Luxembourg local time for the digest schedule.",
      };
    }

    const result = await updateDigestAutomation({
      enabled,
      localTime,
      testEmail: testEmail || null,
    });

    revalidatePath("/ops");

    return {
      tone: "success",
      message: result.enabled
        ? `Daily digest automation saved for ${result.localTime} Europe/Luxembourg.`
        : "Daily digest automation has been paused.",
    };
  } catch (error) {
    return {
      tone: "error",
      message:
        error instanceof Error
          ? error.message
          : "The digest automation settings could not be saved right now.",
    };
  }
}
