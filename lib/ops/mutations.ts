import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { formatError } from "@/lib/ops/shared";

export async function updateDealStatus(input: {
  id: string;
  status: "reviewed" | "expired";
}) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("deal_candidates")
    .update({
      status: input.status,
      reviewed_at:
        input.status === "reviewed" ? new Date().toISOString() : null,
    })
    .eq("id", input.id);

  if (error) {
    throw new Error(formatError(error));
  }
}

export async function updateSubscriber(input: {
  id: string;
  email: string;
  status: "pending" | "active" | "unsubscribed";
  homeAirport: string;
  emailConfirmed: boolean;
  onboardingCompleted: boolean;
}) {
  const supabase = getSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const email = input.email.trim().toLowerCase();
  const homeAirport = input.homeAirport.trim().toUpperCase();

  if (!input.id) {
    throw new Error("Subscriber id is required.");
  }

  if (!email || !email.includes("@")) {
    throw new Error("Enter a valid subscriber email.");
  }

  if (!homeAirport) {
    throw new Error("Home airport is required.");
  }

  const updatePayload = {
    email,
    status: input.status,
    home_airport: homeAirport,
    email_confirmed: input.emailConfirmed,
    onboarding_completed: input.onboardingCompleted,
    confirmed_at: input.emailConfirmed ? nowIso : null,
    unsubscribed_at: input.status === "unsubscribed" ? nowIso : null,
    updated_at: nowIso,
  };

  const { error } = await supabase
    .from("newsletter_subscribers")
    .update(updatePayload)
    .eq("id", input.id);

  if (error) {
    throw new Error(formatError(error));
  }
}

export async function deleteSubscriber(input: { id: string }) {
  const supabase = getSupabaseAdminClient();

  if (!input.id) {
    throw new Error("Subscriber id is required.");
  }

  const { error } = await supabase
    .from("newsletter_subscribers")
    .delete()
    .eq("id", input.id);

  if (error) {
    throw new Error(formatError(error));
  }
}
