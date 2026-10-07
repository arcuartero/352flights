"use server";

import { assertOpsAccess } from "@/lib/ops-access";
import { revalidatePath } from "next/cache";

import {
  createAutomaticRoutePlannerSearchRules,
  createAutomaticRoutePlannerSearchRulesForRoutes,
  saveRouteMonthSearchRules,
  saveRoutePlannerSearchRules,
} from "@/lib/active-routes";
import { initialOpsActionState, type OpsActionState } from "@/lib/ops-shared";
import {
  deleteSubscriber,
  updateSubscriber,
  updateDealStatus,
} from "@/lib/ops/mutations";
import {
  sendApprovedDealCampaign,
  runScheduledDigest,
  runScheduledWeeklyDigest,
  sendCampaignTestEmail,
  updateDigestAutomation,
} from "@/lib/ops/campaigns";

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

export async function bulkReviewDealAction(formData: FormData) {
  await assertOpsAccess();

  const ids = formData
    .getAll("id")
    .map((value) => String(value))
    .filter(Boolean);
  const status = String(formData.get("status") ?? "");

  if (ids.length === 0 || (status !== "reviewed" && status !== "expired")) {
    throw new Error("Invalid bulk review payload.");
  }

  await Promise.all(
    ids.map((id) =>
      updateDealStatus({
        id,
        status,
      }),
    ),
  );

  revalidatePath("/ops");
}

export async function updateSubscriberAction(formData: FormData) {
  await assertOpsAccess();

  const id = String(formData.get("id") ?? "");
  const email = String(formData.get("email") ?? "");
  const status = String(formData.get("status") ?? "");
  const homeAirport = String(formData.get("homeAirport") ?? "");
  const emailConfirmed = formData.get("emailConfirmed") === "on";
  const onboardingCompleted = formData.get("onboardingCompleted") === "on";

  if (
    status !== "pending" &&
    status !== "active" &&
    status !== "unsubscribed"
  ) {
    throw new Error("Invalid subscriber status.");
  }

  await updateSubscriber({
    id,
    email,
    status,
    homeAirport,
    emailConfirmed,
    onboardingCompleted,
  });

  revalidatePath("/ops");
}

export async function deleteSubscriberAction(formData: FormData) {
  await assertOpsAccess();

  const id = String(formData.get("id") ?? "");
  await deleteSubscriber({ id });

  revalidatePath("/ops");
}

export async function sendCampaignAction(
  _previousState: OpsActionState = initialOpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  try {
    await assertOpsAccess();

    const sendType = String(formData.get("sendType") ?? "");
    if (
      sendType !== "digest" &&
      sendType !== "flash" &&
      sendType !== "weekly"
    ) {
      return {
        tone: "error",
        message: "Invalid campaign type.",
      };
    }

    const result =
      sendType === "weekly"
        ? await runScheduledWeeklyDigest({ force: true })
        : sendType === "digest"
          ? await runScheduledDigest({ force: true })
          : await sendApprovedDealCampaign({ sendType });

    if ("reason" in result) {
      return { tone: "success", message: result.reason };
    }

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
        error instanceof Error
          ? error.message
          : "The campaign could not be sent right now.",
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

    if (
      sendType !== "digest" &&
      sendType !== "flash" &&
      sendType !== "weekly"
    ) {
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
        error instanceof Error
          ? error.message
          : "The test email could not be sent right now.",
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
      weeklyEnabled: formData.get("weeklyEnabled") === "on",
      localTime,
      testEmail: testEmail || null,
    });

    revalidatePath("/ops");

    return {
      tone: "success",
      message: `Daily and weekly automation settings saved. Schedule: ${result.localTime} Europe/Luxembourg.`,
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

export async function saveRouteMonthRulesAction(formData: FormData) {
  await assertOpsAccess();

  const routeId = String(formData.get("routeId") ?? "");
  const monthStart = String(formData.get("monthStart") ?? "");
  const patternKeys = formData
    .getAll("patternKey")
    .map((value) => String(value))
    .filter(Boolean);

  await saveRouteMonthSearchRules({
    routeId,
    monthStart,
    patternKeys,
  });

  revalidatePath("/ops/active-routes");
}

export async function saveRoutePlannerRulesAction(input: {
  routeId: string;
  months: Array<{
    monthStart: string;
    patternKeys: string[];
  }>;
}) {
  await assertOpsAccess();

  await saveRoutePlannerSearchRules(input);

  revalidatePath("/ops/active-routes");
}

export async function createAutomaticRoutePlannerRulesAction(input: {
  routeId: string;
}) {
  await assertOpsAccess();

  const result = await createAutomaticRoutePlannerSearchRules(input);

  revalidatePath("/ops/active-routes");
  return result;
}

export async function createAutomaticRoutePlannerRulesForRoutesAction(input: {
  routeIds: string[];
}) {
  await assertOpsAccess();

  const results = await createAutomaticRoutePlannerSearchRulesForRoutes(input);

  revalidatePath("/ops/active-routes");
  return results;
}

export async function saveManyRoutePlannerRulesAction(input: {
  routes: Array<{
    routeId: string;
    months: Array<{
      monthStart: string;
      patternKeys: string[];
    }>;
  }>;
}) {
  await assertOpsAccess();

  const routes = input.routes.filter(
    (route) => route.routeId && route.months.length > 0,
  );
  if (routes.length === 0) {
    throw new Error("Missing routes to save.");
  }

  for (const route of routes) {
    await saveRoutePlannerSearchRules(route);
  }

  revalidatePath("/ops/active-routes");
}
