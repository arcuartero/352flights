"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  confirmSubscriberByToken,
  unsubscribeSubscriberByToken,
} from "@/lib/subscriptions";

export type SubscriptionActionState = { error?: string; completed?: boolean };

export async function confirmSubscription(
  _state: SubscriptionActionState,
  formData: FormData,
): Promise<SubscriptionActionState> {
  const token = z.string().uuid().safeParse(formData.get("token"));
  if (!token.success)
    return { error: "Open the latest confirmation link in your email." };
  let preferencePath: string;
  try {
    const result = await confirmSubscriberByToken(token.data);
    if (result.status === "unsubscribed")
      return {
        error:
          "This address is unsubscribed. Subscribe again from the homepage to rejoin.",
      };
    preferencePath = result.preferencePath;
  } catch {
    return {
      error:
        "We could not confirm this link. Please try again or use the latest email.",
    };
  }
  redirect(preferencePath);
}

export async function unsubscribeSubscription(
  _state: SubscriptionActionState,
  formData: FormData,
): Promise<SubscriptionActionState> {
  const token = z.string().uuid().safeParse(formData.get("token"));
  if (!token.success)
    return { error: "Open the unsubscribe link in your latest email." };
  try {
    await unsubscribeSubscriberByToken(token.data);
    return { completed: true };
  } catch {
    return {
      error:
        "We could not process this link. Please try again or use the latest email.",
    };
  }
}
