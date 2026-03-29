import { z } from "zod";

import routes from "@/data/lux-routes.json";
import { formatRouteStayLabel } from "@/lib/route-stay";

export const bucketValues = ["weekend_europe", "sun_breaks", "long_haul"] as const;
export const maxStopsPreferenceValues = ["ANY", "NON_STOP", "ONE_STOP_OR_FEWER"] as const;
export const deliveryModeValues = ["daily_digest", "flash_only", "weekly_best_of"] as const;

export type BucketValue = (typeof bucketValues)[number];
export type MaxStopsPreferenceValue = (typeof maxStopsPreferenceValues)[number];
export type DeliveryModeValue = (typeof deliveryModeValues)[number];

export const bucketOptionMap: Record<
  BucketValue,
  { label: string; description: string }
> = {
  weekend_europe: {
    label: "Weekend Europe",
    description: "Short city breaks and long weekends from Luxembourg.",
  },
  sun_breaks: {
    label: "Sun Breaks",
    description: "Mediterranean and Iberian leisure routes worth watching.",
  },
  long_haul: {
    label: "Long Haul",
    description: "Bigger drops, slower cadence, stronger headline deals.",
  },
};

export const maxStopsPreferenceOptions: Array<{
  value: MaxStopsPreferenceValue;
  label: string;
  description: string;
}> = [
  {
    value: "NON_STOP",
    label: "Non-stop only",
    description: "Only show the cleanest itineraries from Luxembourg.",
  },
  {
    value: "ONE_STOP_OR_FEWER",
    label: "Up to 1 stop",
    description: "Balance convenience and price on most routes.",
  },
  {
    value: "ANY",
    label: "Any routing",
    description: "Prioritize price even if the itinerary gets messier.",
  },
];

export const deliveryModeOptions: Array<{
  value: DeliveryModeValue;
  label: string;
  description: string;
}> = [
  {
    value: "daily_digest",
    label: "Daily digest",
    description: "A regular shortlist when relevant fares appear.",
  },
  {
    value: "flash_only",
    label: "Flash alerts only",
    description: "Only the strongest drops and most urgent fares.",
  },
  {
    value: "weekly_best_of",
    label: "Weekly best-of",
    description: "One calmer roundup with the top routes of the week.",
  },
];

export function makeRouteSelectionKey(route: {
  destination_airport: string;
  bucket: string;
}) {
  return `${route.destination_airport}:${route.bucket}`;
}

export const routePreferenceOptions = routes.map((route) => ({
  key: makeRouteSelectionKey(route),
  destinationAirport: route.destination_airport,
  destinationCity: route.destination_city,
  bucket: route.bucket as BucketValue,
  tripNights: route.trip_nights,
  minTripNights: route.min_trip_nights ?? null,
  maxTripNights: route.max_trip_nights ?? null,
  stayLabel: formatRouteStayLabel({
    tripNights: route.trip_nights,
    minTripNights: route.min_trip_nights ?? null,
    maxTripNights: route.max_trip_nights ?? null,
  }),
  teaser: route.teaser,
}));

export const routePreferenceGroups = bucketValues.map((bucket) => ({
  bucket,
  label: bucketOptionMap[bucket].label,
  description: bucketOptionMap[bucket].description,
  routes: routePreferenceOptions.filter((route) => route.bucket === bucket),
}));

export const routePreferenceMap = new Map(
  routePreferenceOptions.map((route) => [route.key, route]),
);

export const defaultPreferenceValues = {
  preferredBuckets: [...bucketValues] as BucketValue[],
  selectedRoutes: routePreferenceOptions.map((route) => route.key),
  maxStopsPreference: "ONE_STOP_OR_FEWER" as MaxStopsPreferenceValue,
  minTripNights: null as number | null,
  maxTripNights: null as number | null,
  budgetCeilingEur: null as number | null,
  deliveryMode: "daily_digest" as DeliveryModeValue,
};

export const preferencePayloadSchema = z
  .object({
    token: z.string().uuid(),
    preferredBuckets: z.array(z.enum(bucketValues)).min(1),
    selectedRoutes: z.array(z.string()).min(1),
    maxStopsPreference: z.enum(maxStopsPreferenceValues),
    minTripNights: z.number().int().positive().max(30).nullable(),
    maxTripNights: z.number().int().positive().max(30).nullable(),
    budgetCeilingEur: z.number().int().positive().max(5000).nullable(),
    deliveryMode: z.enum(deliveryModeValues),
  })
  .superRefine((value, context) => {
    if (
      value.minTripNights !== null &&
      value.maxTripNights !== null &&
      value.minTripNights > value.maxTripNights
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Minimum nights cannot exceed maximum nights.",
        path: ["minTripNights"],
      });
    }

    for (const routeKey of value.selectedRoutes) {
      const route = routePreferenceMap.get(routeKey);
      if (!route) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown route preference: ${routeKey}`,
          path: ["selectedRoutes"],
        });
        continue;
      }

      if (!value.preferredBuckets.includes(route.bucket)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Selected routes must belong to an enabled bucket.",
          path: ["selectedRoutes"],
        });
      }
    }
  });

export type PreferencePayload = z.infer<typeof preferencePayloadSchema>;

export type PreferencesBundle = {
  token: string;
  email: string;
  homeAirport: string;
  onboardingCompleted: boolean;
  form: Omit<PreferencePayload, "token">;
};
