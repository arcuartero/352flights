import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase";
import {
  type CustomAlertRuleValue,
  defaultPreferenceValues,
  type DeliveryModeValue,
  makeRouteSelectionKey,
  type MaxStopsPreferenceValue,
  normalizeBucketValue,
  routePreferenceMap,
  type PreferencesBundle,
  type PreferencePayload,
  type WeekdayValue,
} from "@/lib/preferences-shared";

function formatError(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "Unknown error";
}

function unique<T>(values: readonly T[]) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function normalizeDeliveryModes(
  values: DeliveryModeValue[] | null | undefined,
  legacyValue: DeliveryModeValue | null | undefined,
) {
  if (values && values.length > 0) {
    return unique(values);
  }

  if (legacyValue) {
    return [legacyValue];
  }

  return [...defaultPreferenceValues.deliveryModes];
}

function normalizeMaxStopsPreferences(
  values: MaxStopsPreferenceValue[] | null | undefined,
  legacyValue: MaxStopsPreferenceValue | null | undefined,
) {
  if (values && values.length > 0) {
    return unique(values);
  }

  if (legacyValue) {
    return [legacyValue];
  }

  return [...defaultPreferenceValues.maxStopsPreferences];
}

function deriveLegacyDeliveryMode(values: DeliveryModeValue[]) {
  if (values.includes("daily_digest")) {
    return "daily_digest" as const;
  }

  if (values.includes("flash_only")) {
    return "flash_only" as const;
  }

  return "weekly_best_of" as const;
}

function deriveLegacyMaxStopsPreference(values: MaxStopsPreferenceValue[]) {
  if (values.includes("ANY")) {
    return "ANY" as const;
  }

  if (values.includes("ONE_STOP_OR_FEWER")) {
    return "ONE_STOP_OR_FEWER" as const;
  }

  return "NON_STOP" as const;
}

function normalizeDepartureWeekdays(
  values: WeekdayValue[] | null | undefined,
) {
  if (values && values.length > 0) {
    return unique(values);
  }

  return [...defaultPreferenceValues.departureWeekdays];
}

function normalizeCustomRuleMaxStops(
  values: MaxStopsPreferenceValue[] | null | undefined,
) {
  if (values && values.length > 0) {
    return unique(values);
  }

  return [...defaultPreferenceValues.maxStopsPreferences];
}

function normalizeCustomRuleWeekdays(
  values: WeekdayValue[] | null | undefined,
) {
  if (values && values.length > 0) {
    return unique(values);
  }

  return [...defaultPreferenceValues.departureWeekdays];
}

function mapBucketToLegacyStorage(bucket: ReturnType<typeof normalizeBucketValue>) {
  if (bucket === "long_stay") {
    return "long_haul" as const;
  }

  if (bucket === "weekend") {
    return "weekend_europe" as const;
  }

  return null;
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
    .select("id,email,home_airport,preference_token,onboarding_completed,email_confirmed,status,unsubscribe_token")
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

  if (subscriberQuery.data.status !== "unsubscribed" && !subscriberQuery.data.email_confirmed) {
    const confirmQuery = await supabase
      .from("newsletter_subscribers")
      .update({
        email_confirmed: true,
        confirmed_at: new Date().toISOString(),
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriberQuery.data.id);

    if (confirmQuery.error) {
      return {
        ok: false,
        status: 500,
        error: formatError(confirmQuery.error),
      };
    }

    subscriberQuery.data.email_confirmed = true;
    subscriberQuery.data.status = "active";
  }

  const [preferencesQuery, routePreferencesQuery] = await Promise.all([
    supabase
      .from("subscriber_preferences")
      .select("*")
      .eq("subscriber_id", subscriberQuery.data.id)
      .maybeSingle(),
    supabase
      .from("subscriber_route_preferences")
      .select("destination_airport,bucket")
      .eq("subscriber_id", subscriberQuery.data.id)
      .eq("is_enabled", true),
  ]);

  const customRulesQuery = await supabase
    .from("subscriber_custom_alerts")
    .select("*")
    .eq("subscriber_id", subscriberQuery.data.id)
    .order("sort_order", { ascending: true });

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

  if (customRulesQuery.error) {
    return {
      ok: false,
      status: 500,
      error: formatError(customRulesQuery.error),
    };
  }

  const selectedRoutes =
    routePreferencesQuery.data && routePreferencesQuery.data.length > 0
      ? routePreferencesQuery.data
          .map((item) =>
            makeRouteSelectionKey({
              destination_airport: item.destination_airport,
            }),
          )
          .filter((key) => routePreferenceMap.has(key))
      : defaultPreferenceValues.selectedRoutes;

  const preferredBuckets =
    preferencesQuery.data?.preferred_buckets && preferencesQuery.data.preferred_buckets.length > 0
      ? preferencesQuery.data.preferred_buckets
          .map((bucket: string) => normalizeBucketValue(bucket))
          .filter(
            (
              bucket: ReturnType<typeof normalizeBucketValue>,
            ): bucket is Exclude<ReturnType<typeof normalizeBucketValue>, null> =>
              bucket !== null,
          )
      : defaultPreferenceValues.preferredBuckets;

  const deliveryModes = normalizeDeliveryModes(
    preferencesQuery.data?.delivery_modes,
    preferencesQuery.data?.delivery_mode,
  );

  const maxStopsPreferences = normalizeMaxStopsPreferences(
    preferencesQuery.data?.max_stops_preferences,
    preferencesQuery.data?.max_stops_preference,
  );

  const departureWeekdays = normalizeDepartureWeekdays(
    preferencesQuery.data?.departure_weekdays,
  );

  const customAlertRules: CustomAlertRuleValue[] = (customRulesQuery.data ?? []).map((rule) => ({
    id: rule.id,
    name: rule.name,
    destinationCity: rule.destination_city,
    bucket: normalizeBucketValue(rule.bucket),
    maxStopsPreferences: normalizeCustomRuleMaxStops(rule.max_stops_preferences),
    budgetCeilingEur: rule.budget_ceiling_eur,
    departureWeekdays: normalizeCustomRuleWeekdays(rule.departure_weekdays),
    minTripNights: rule.min_trip_nights,
    maxTripNights: rule.max_trip_nights,
    isActive: rule.is_active,
  }));

  return {
    ok: true,
    bundle: {
      token: subscriberQuery.data.preference_token,
      email: subscriberQuery.data.email,
      homeAirport: subscriberQuery.data.home_airport,
      onboardingCompleted: subscriberQuery.data.onboarding_completed,
      emailConfirmed: subscriberQuery.data.email_confirmed,
      status: subscriberQuery.data.status,
      unsubscribePath: `/unsubscribe?token=${subscriberQuery.data.unsubscribe_token}`,
      form: {
        preferredBuckets,
        selectedRoutes,
        maxStopsPreferences,
        departureWeekdays,
        minTripNights:
          preferencesQuery.data?.min_trip_nights ?? defaultPreferenceValues.minTripNights,
        maxTripNights:
          preferencesQuery.data?.max_trip_nights ?? defaultPreferenceValues.maxTripNights,
        budgetCeilingEur:
          preferencesQuery.data?.budget_ceiling_eur ?? defaultPreferenceValues.budgetCeilingEur,
        earliestDepartureHour:
          preferencesQuery.data?.earliest_departure_hour ?? defaultPreferenceValues.earliestDepartureHour,
        latestArrivalHour:
          preferencesQuery.data?.latest_arrival_hour ?? defaultPreferenceValues.latestArrivalHour,
        minDestinationStayHours:
          preferencesQuery.data?.min_destination_stay_hours ?? defaultPreferenceValues.minDestinationStayHours,
        deliveryModes,
        customAlertRules,
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
    .select("id,status,email_confirmed")
    .eq("preference_token", input.token)
    .single();

  if (subscriberQuery.error) {
    throw new Error(formatError(subscriberQuery.error));
  }

  const subscriberId = subscriberQuery.data.id;
  const normalizedMaxStopsPreferences = unique(input.maxStopsPreferences);
  const normalizedDeliveryModes = unique(input.deliveryModes);
  const normalizedDepartureWeekdays = unique(input.departureWeekdays);

  if (subscriberQuery.data.status === "unsubscribed") {
    throw new Error("This subscription has been unsubscribed and cannot be updated.");
  }

  const preferenceUpsert = await supabase.from("subscriber_preferences").upsert(
    {
      subscriber_id: subscriberId,
      preferred_buckets: input.preferredBuckets,
      max_stops_preference: deriveLegacyMaxStopsPreference(normalizedMaxStopsPreferences),
      max_stops_preferences: normalizedMaxStopsPreferences,
      departure_weekdays: normalizedDepartureWeekdays,
      min_trip_nights: input.minTripNights,
      max_trip_nights: input.maxTripNights,
      budget_ceiling_eur: input.budgetCeilingEur,
      earliest_departure_hour: input.earliestDepartureHour,
      latest_arrival_hour: input.latestArrivalHour,
      min_destination_stay_hours: input.minDestinationStayHours,
      delivery_mode: deriveLegacyDeliveryMode(normalizedDeliveryModes),
      delivery_modes: normalizedDeliveryModes,
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

  const deleteCustomRulesQuery = await supabase
    .from("subscriber_custom_alerts")
    .delete()
    .eq("subscriber_id", subscriberId);

  if (deleteCustomRulesQuery.error) {
    throw new Error(formatError(deleteCustomRulesQuery.error));
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
      bucket: mapBucketToLegacyStorage(route.bucket),
      is_enabled: true,
    };
  });

  const insertRoutesQuery = await supabase
    .from("subscriber_route_preferences")
    .insert(selectedRouteRows);

  if (insertRoutesQuery.error) {
    throw new Error(formatError(insertRoutesQuery.error));
  }

  if (input.customAlertRules.length > 0) {
    const customRulesInsert = await supabase
      .from("subscriber_custom_alerts")
      .insert(
        input.customAlertRules.map((rule, index) => ({
          subscriber_id: subscriberId,
          name: rule.name,
          destination_city: rule.destinationCity,
          bucket: mapBucketToLegacyStorage(rule.bucket),
          max_stops_preferences: unique(rule.maxStopsPreferences),
          budget_ceiling_eur: rule.budgetCeilingEur,
          departure_weekdays: unique(rule.departureWeekdays),
          min_trip_nights: rule.minTripNights,
          max_trip_nights: rule.maxTripNights,
          is_active: rule.isActive,
          sort_order: index,
        })),
      );

    if (customRulesInsert.error) {
      throw new Error(formatError(customRulesInsert.error));
    }
  }

  const subscriberUpdate = await supabase
    .from("newsletter_subscribers")
    .update({
      onboarding_completed: true,
      status: subscriberQuery.data.email_confirmed ? "active" : "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscriberId);

  if (subscriberUpdate.error) {
    throw new Error(formatError(subscriberUpdate.error));
  }

  return {
    emailConfirmed: subscriberQuery.data.email_confirmed,
  };
}
