import "server-only";

import { randomUUID } from "node:crypto";

import { hasResendEnv, getSiteUrl } from "@/lib/env";
import {
  normalizeEmailLocale,
  renderWelcomeEmail,
  sendResendEmail,
  type EmailLocale,
} from "@/lib/email";
import { getSupabaseAdminClient } from "@/lib/supabase";

type SubscriberLookupRow = {
  id: string;
  email: string;
  status: string;
  preference_token: string;
  confirmation_token: string;
  unsubscribe_token: string;
  email_confirmed: boolean;
  onboarding_completed: boolean;
  preferred_locale: string | null;
};

function formatError(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "Unknown error";
}

function buildSubscriptionUrls(subscriber: Pick<
  SubscriberLookupRow,
  "preference_token" | "confirmation_token" | "unsubscribe_token"
>) {
  const siteUrl = getSiteUrl();

  return {
    confirmUrl: `${siteUrl}/confirm?token=${subscriber.confirmation_token}`,
    managePreferencesUrl: `${siteUrl}/preferences?token=${subscriber.preference_token}`,
    unsubscribeUrl: `${siteUrl}/unsubscribe?token=${subscriber.unsubscribe_token}`,
  };
}

const subscriberSelect =
  "id,email,status,preference_token,confirmation_token,unsubscribe_token,email_confirmed,onboarding_completed,preferred_locale";

export async function subscribeEmailAddress(email: string, locale?: EmailLocale) {
  const supabase = getSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const preferredLocale = normalizeEmailLocale(locale);

  const existingQuery = await supabase
    .from("newsletter_subscribers")
    .select(subscriberSelect)
    .eq("email", email)
    .maybeSingle();

  if (existingQuery.error) {
    throw new Error(formatError(existingQuery.error));
  }

  let subscriber = existingQuery.data as SubscriberLookupRow | null;

  if (subscriber) {
    const shouldReconfirm = subscriber.status === "unsubscribed" || !subscriber.email_confirmed;

    const updatePayload: Record<string, unknown> = {
      origin_city: "Luxembourg",
      home_airport: "LUX",
      source: "landing_page",
      preferred_locale: preferredLocale,
      updated_at: nowIso,
    };

    if (shouldReconfirm) {
      updatePayload.status = "pending";
      updatePayload.email_confirmed = false;
      updatePayload.confirmed_at = null;
      updatePayload.unsubscribed_at = null;
      updatePayload.confirmation_token = randomUUID();
      updatePayload.unsubscribe_token = randomUUID();
    }

    const updateQuery = await supabase
      .from("newsletter_subscribers")
      .update(updatePayload)
      .eq("id", subscriber.id)
      .select(subscriberSelect)
      .single();

    if (updateQuery.error) {
      throw new Error(formatError(updateQuery.error));
    }

    subscriber = updateQuery.data as SubscriberLookupRow;
  } else {
    const insertQuery = await supabase
      .from("newsletter_subscribers")
      .insert({
        email,
        origin_city: "Luxembourg",
        home_airport: "LUX",
        source: "landing_page",
        preferred_locale: preferredLocale,
        status: "pending",
        email_confirmed: false,
        onboarding_completed: false,
        updated_at: nowIso,
      })
      .select(subscriberSelect)
      .single();

    if (insertQuery.error) {
      throw new Error(formatError(insertQuery.error));
    }

    subscriber = insertQuery.data as SubscriberLookupRow;
  }

  if (hasResendEnv()) {
    const links = buildSubscriptionUrls(subscriber);
    const welcome = renderWelcomeEmail({
      email: subscriber.email,
      confirmUrl: links.confirmUrl,
      managePreferencesUrl: links.managePreferencesUrl,
      unsubscribeUrl: links.unsubscribeUrl,
      alreadyConfirmed: subscriber.email_confirmed,
      onboardingCompleted: subscriber.onboarding_completed,
      locale: normalizeEmailLocale(subscriber.preferred_locale),
    });

    await sendResendEmail({
      to: subscriber.email,
      subject: welcome.subject,
      html: welcome.html,
      text: welcome.text,
      emailType: "welcome",
      idempotencyKey: `lux-welcome-${subscriber.id}-${Date.now()}`,
    });

    const welcomeUpdate = await supabase
      .from("newsletter_subscribers")
      .update({
        welcome_email_sent_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", subscriber.id);

    if (welcomeUpdate.error) {
      throw new Error(formatError(welcomeUpdate.error));
    }
  }

  return {
    alreadyConfirmed: subscriber.email_confirmed,
    message: subscriber.email_confirmed
      ? "You were already subscribed, so we emailed your access links again."
      : hasResendEnv()
        ? "Check your inbox to confirm your subscription and finish your preferences."
        : "We saved your email, but outbound email is not configured yet. Add Resend to complete double opt-in.",
  };
}

export async function confirmSubscriberByToken(token: string) {
  const supabase = getSupabaseAdminClient();
  const query = await supabase
    .from("newsletter_subscribers")
    .select(
      subscriberSelect,
    )
    .eq("confirmation_token", token)
    .maybeSingle();

  if (query.error) {
    throw new Error(formatError(query.error));
  }

  if (!query.data) {
    throw new Error("We could not find that confirmation link. Try subscribing again.");
  }

  const subscriber = query.data as SubscriberLookupRow;

  if (subscriber.status === "unsubscribed") {
    return {
      email: subscriber.email,
      preferencePath: `/preferences?token=${subscriber.preference_token}`,
      onboardingCompleted: subscriber.onboarding_completed,
      alreadyConfirmed: false,
      status: "unsubscribed" as const,
    };
  }

  if (subscriber.email_confirmed) {
    return {
      email: subscriber.email,
      preferencePath: `/preferences?token=${subscriber.preference_token}`,
      onboardingCompleted: subscriber.onboarding_completed,
      alreadyConfirmed: true,
      status: "active" as const,
    };
  }

  const updateQuery = await supabase
    .from("newsletter_subscribers")
    .update({
      email_confirmed: true,
      confirmed_at: new Date().toISOString(),
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscriber.id);

  if (updateQuery.error) {
    throw new Error(formatError(updateQuery.error));
  }

  return {
    email: subscriber.email,
    preferencePath: `/preferences?token=${subscriber.preference_token}`,
    onboardingCompleted: subscriber.onboarding_completed,
    alreadyConfirmed: false,
    status: "active" as const,
  };
}

export async function unsubscribeSubscriberByToken(token: string) {
  const supabase = getSupabaseAdminClient();
  const query = await supabase
    .from("newsletter_subscribers")
    .select("id,email,status,preference_token")
    .eq("unsubscribe_token", token)
    .maybeSingle();

  if (query.error) {
    throw new Error(formatError(query.error));
  }

  if (!query.data) {
    throw new Error("We could not find that unsubscribe link.");
  }

  if (query.data.status === "unsubscribed") {
    return {
      email: query.data.email,
      alreadyUnsubscribed: true,
      preferencePath: `/preferences?token=${query.data.preference_token}`,
    };
  }

  const updateQuery = await supabase
    .from("newsletter_subscribers")
    .update({
      status: "unsubscribed",
      unsubscribed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", query.data.id);

  if (updateQuery.error) {
    throw new Error(formatError(updateQuery.error));
  }

  return {
    email: query.data.email,
    alreadyUnsubscribed: false,
    preferencePath: `/preferences?token=${query.data.preference_token}`,
  };
}
