import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase";
import {
  defaultPreferenceValues,
  makeRouteSelectionKey,
  routePreferenceMap,
  type PreferencesBundle,
  type PreferencePayload,
} from "@/lib/preferences-shared";

function formatError(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "Unknown error";
}

export type PreferenceLookupResult =
  | {
      ok: true;
      bundle: PreferencesBundle;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export async function getPreferencesByToken(token: string): Promise<PreferenceLookupResult> {
  const supabase = getSupabaseAdminClient();

  const subscriberQuery = await supabase
    .from("newsletter_subscribers")
    .select("id,email,home_airport,preference_token,onboarding_completed")
    .eq("preference_token", token)
    .maybeSingle();

  if (subscriberQuery.error) {
    return {
      ok: false,
      status: 500,
      error: formatError(subscriberQuery.error),
    };
  }

  if (!subscriberQuery.data) {
    return {
      ok: false,
      status: 404,
      error: "We could not find that preference link. Subscribe again from the homepage.",
    };
  }

  const [preferencesQuery, routePreferencesQuery] = await Promise.all([
    supabase
      .from("subscriber_preferences")
      .select(
        "preferred_buckets,max_stops_preference,min_trip_nights,max_trip_nights,budget_ceiling_eur,delivery_mode",
      )
      .eq("subscriber_id", subscriberQuery.data.id)
      .maybeSingle(),
    supabase
      .from("subscriber_route_preferences")
      .select("destination_airport,bucket")
      .eq("subscriber_id", subscriberQuery.data.id)
      .eq("is_enabled", true),
  ]);

  if (preferencesQuery.error) {
    return {
      ok: false,
      status: 500,
      error: formatError(preferencesQuery.error),
    };
  }

  if (routePreferencesQuery.error) {
    return {
      ok: false,
      status: 500,
      error: formatError(routePreferencesQuery.error),
    };
  }

  const selectedRoutes =
    routePreferencesQuery.data && routePreferencesQuery.data.length > 0
      ? routePreferencesQuery.data
          .map((item) =>
            makeRouteSelectionKey({
              destination_airport: item.destination_airport,
              bucket: item.bucket,
            }),
          )
          .filter((key) => routePreferenceMap.has(key))
      : defaultPreferenceValues.selectedRoutes;

  const preferredBuckets =
    preferencesQuery.data?.preferred_buckets && preferencesQuery.data.preferred_buckets.length > 0
      ? preferencesQuery.data.preferred_buckets
      : defaultPreferenceValues.preferredBuckets;

  return {
    ok: true,
    bundle: {
      token: subscriberQuery.data.preference_token,
      email: subscriberQuery.data.email,
      homeAirport: subscriberQuery.data.home_airport,
      onboardingCompleted: subscriberQuery.data.onboarding_completed,
      form: {
        preferredBuckets,
        selectedRoutes,
        maxStopsPreference:
          preferencesQuery.data?.max_stops_preference ?? defaultPreferenceValues.maxStopsPreference,
        minTripNights:
          preferencesQuery.data?.min_trip_nights ?? defaultPreferenceValues.minTripNights,
        maxTripNights:
          preferencesQuery.data?.max_trip_nights ?? defaultPreferenceValues.maxTripNights,
        budgetCeilingEur:
          preferencesQuery.data?.budget_ceiling_eur ?? defaultPreferenceValues.budgetCeilingEur,
        deliveryMode:
          preferencesQuery.data?.delivery_mode ?? defaultPreferenceValues.deliveryMode,
      },
    },
  };
}

export async function savePreferencesByToken(input: PreferencePayload) {
  const lookup = await getPreferencesByToken(input.token);
  if (!lookup.ok) {
    throw new Error(lookup.error);
  }

  const supabase = getSupabaseAdminClient();
  const subscriberQuery = await supabase
    .from("newsletter_subscribers")
    .select("id")
    .eq("preference_token", input.token)
    .single();

  if (subscriberQuery.error) {
    throw new Error(formatError(subscriberQuery.error));
  }

  const subscriberId = subscriberQuery.data.id;

  const preferenceUpsert = await supabase.from("subscriber_preferences").upsert(
    {
      subscriber_id: subscriberId,
      preferred_buckets: input.preferredBuckets,
      max_stops_preference: input.maxStopsPreference,
      min_trip_nights: input.minTripNights,
      max_trip_nights: input.maxTripNights,
      budget_ceiling_eur: input.budgetCeilingEur,
      delivery_mode: input.deliveryMode,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "subscriber_id",
      ignoreDuplicates: false,
    },
  );

  if (preferenceUpsert.error) {
    throw new Error(formatError(preferenceUpsert.error));
  }

  const deleteQuery = await supabase
    .from("subscriber_route_preferences")
    .delete()
    .eq("subscriber_id", subscriberId);

  if (deleteQuery.error) {
    throw new Error(formatError(deleteQuery.error));
  }

  const selectedRouteRows = input.selectedRoutes.map((routeKey) => {
    const route = routePreferenceMap.get(routeKey);
    if (!route) {
      throw new Error(`Unknown route preference: ${routeKey}`);
    }

    return {
      subscriber_id: subscriberId,
      destination_airport: route.destinationAirport,
      destination_city: route.destinationCity,
      bucket: route.bucket,
      is_enabled: true,
    };
  });

  const insertRoutesQuery = await supabase
    .from("subscriber_route_preferences")
    .insert(selectedRouteRows);

  if (insertRoutesQuery.error) {
    throw new Error(formatError(insertRoutesQuery.error));
  }

  const subscriberUpdate = await supabase
    .from("newsletter_subscribers")
    .update({
      onboarding_completed: true,
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscriberId);

  if (subscriberUpdate.error) {
    throw new Error(formatError(subscriberUpdate.error));
  }
}
