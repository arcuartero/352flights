import "server-only";
import { normalizeEmailLocale } from "@/lib/email";
import {
  defaultPreferenceValues,
  normalizeBucketValue,
} from "@/lib/preferences-shared";
import {
  makeRouteKey,
  normalizeComfortHour,
  normalizeDeliveryModes,
  normalizeDepartureWeekdays,
  normalizeMaxStopsPreferences,
  normalizeMinDestinationStayHours,
} from "@/lib/ops/shared";
import {
  type SubscriberCustomAlertRow,
  type SubscriberPreferenceRow,
  type SubscriberRoutePreferenceRow,
  type SubscriberRow,
} from "@/lib/ops/types";

export function buildSubscriberSummaries(
  subscribers: SubscriberRow[],
  preferences: SubscriberPreferenceRow[],
  routePreferences: SubscriberRoutePreferenceRow[],
  customAlertRules: SubscriberCustomAlertRow[],
) {
  const preferenceMap = new Map(
    preferences.map((item) => [item.subscriber_id, item]),
  );
  const routeMap = new Map<string, SubscriberRoutePreferenceRow[]>();
  const customRuleMap = new Map<string, SubscriberCustomAlertRow[]>();

  for (const routePreference of routePreferences) {
    if (!routePreference.is_enabled) {
      continue;
    }

    const bucket = routeMap.get(routePreference.subscriber_id) ?? [];
    bucket.push(routePreference);
    routeMap.set(routePreference.subscriber_id, bucket);
  }

  for (const customRule of customAlertRules) {
    const bucket = customRuleMap.get(customRule.subscriber_id) ?? [];
    bucket.push(customRule);
    customRuleMap.set(customRule.subscriber_id, bucket);
  }

  return subscribers.map((subscriber) => {
    const preference = preferenceMap.get(subscriber.id);
    const selectedRoutes = (routeMap.get(subscriber.id) ?? []).sort(
      (left, right) =>
        left.destination_city.localeCompare(right.destination_city),
    );
    const activeCustomRules = (customRuleMap.get(subscriber.id) ?? [])
      .slice()
      .sort((left, right) => left.sort_order - right.sort_order);

    const preferredBuckets =
      preference?.preferred_buckets && preference.preferred_buckets.length > 0
        ? preference.preferred_buckets
            .map((bucket: string) => normalizeBucketValue(bucket))
            .filter(
              (
                bucket: ReturnType<typeof normalizeBucketValue>,
              ): bucket is Exclude<
                ReturnType<typeof normalizeBucketValue>,
                null
              > => bucket !== null,
            )
        : defaultPreferenceValues.preferredBuckets;

    return {
      id: subscriber.id,
      email: subscriber.email,
      source: subscriber.source,
      status: subscriber.status,
      createdAt: subscriber.created_at,
      homeAirport: subscriber.home_airport,
      managePreferencesPath: `/preferences?token=${subscriber.preference_token}`,
      onboardingCompleted: subscriber.onboarding_completed,
      emailConfirmed: subscriber.email_confirmed,
      preferredLocale: normalizeEmailLocale(subscriber.preferred_locale),
      preferenceToken: subscriber.preference_token,
      unsubscribeToken: subscriber.unsubscribe_token,
      deliveryModes: normalizeDeliveryModes(
        preference?.delivery_modes,
        preference?.delivery_mode,
      ),
      maxStopsPreferences: normalizeMaxStopsPreferences(
        preference?.max_stops_preferences,
        preference?.max_stops_preference,
      ),
      departureWeekdays: normalizeDepartureWeekdays(
        preference?.departure_weekdays,
      ),
      minTripNights:
        preference?.min_trip_nights ?? defaultPreferenceValues.minTripNights,
      maxTripNights:
        preference?.max_trip_nights ?? defaultPreferenceValues.maxTripNights,
      budgetCeilingEur:
        preference?.budget_ceiling_eur ??
        defaultPreferenceValues.budgetCeilingEur,
      earliestDepartureHour:
        normalizeComfortHour(preference?.earliest_departure_hour) ??
        defaultPreferenceValues.earliestDepartureHour,
      latestArrivalHour:
        normalizeComfortHour(preference?.latest_arrival_hour) ??
        defaultPreferenceValues.latestArrivalHour,
      minDestinationStayHours:
        normalizeMinDestinationStayHours(
          preference?.min_destination_stay_hours,
        ) ?? defaultPreferenceValues.minDestinationStayHours,
      preferredBuckets,
      selectedRouteLabels: selectedRoutes.map(
        (item) => `${item.destination_city} (${item.destination_airport})`,
      ),
      customAlertRules: activeCustomRules.map((rule) => ({
        id: rule.id,
        name: rule.name,
        destinationCity: rule.destination_city,
        bucket: normalizeBucketValue(rule.bucket),
        maxStopsPreferences: normalizeMaxStopsPreferences(
          rule.max_stops_preferences,
          null,
        ),
        budgetCeilingEur: rule.budget_ceiling_eur,
        departureWeekdays: normalizeDepartureWeekdays(rule.departure_weekdays),
        minTripNights: rule.min_trip_nights,
        maxTripNights: rule.max_trip_nights,
        isActive: rule.is_active,
      })),
      selectedRouteKeys: new Set(
        selectedRoutes.map((item) =>
          makeRouteKey(item.destination_airport, item.bucket),
        ),
      ),
    };
  });
}
