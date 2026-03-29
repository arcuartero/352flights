import { z } from "zod";

import routes from "@/data/lux-routes.json";
import { formatRouteStayLabel } from "@/lib/route-stay";

export const bucketValues = ["weekend_europe", "sun_breaks", "long_haul"] as const;
export const maxStopsPreferenceValues = ["ANY", "NON_STOP", "ONE_STOP_OR_FEWER"] as const;
export const deliveryModeValues = ["daily_digest", "flash_only", "weekly_best_of"] as const;
export const weekdayValues = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

export type BucketValue = (typeof bucketValues)[number];
export type MaxStopsPreferenceValue = (typeof maxStopsPreferenceValues)[number];
export type DeliveryModeValue = (typeof deliveryModeValues)[number];
export type WeekdayValue = (typeof weekdayValues)[number];

export const bucketOptionMap: Record<
  BucketValue,
  { label: string; description: string }
> = {
  weekend_europe: {
    label: "City breaks",
    description: "Short European escapes and weekend city fares from Luxembourg.",
  },
  sun_breaks: {
    label: "Beach escapes",
    description: "Sunny Mediterranean and Iberian trips that are worth watching.",
  },
  long_haul: {
    label: "Long Haul",
    description: "Bigger long-haul swings with stronger headline upside.",
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

export const weekdayOptions: Array<{
  value: WeekdayValue;
  shortLabel: string;
  label: string;
}> = [
  { value: "MON", shortLabel: "Mon", label: "Monday" },
  { value: "TUE", shortLabel: "Tue", label: "Tuesday" },
  { value: "WED", shortLabel: "Wed", label: "Wednesday" },
  { value: "THU", shortLabel: "Thu", label: "Thursday" },
  { value: "FRI", shortLabel: "Fri", label: "Friday" },
  { value: "SAT", shortLabel: "Sat", label: "Saturday" },
  { value: "SUN", shortLabel: "Sun", label: "Sunday" },
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

export const destinationCityOptions = Array.from(
  routePreferenceOptions.reduce(
    (map, route) => {
      const existing = map.get(route.destinationCity);
      if (existing) {
        existing.airports = unique([...existing.airports, route.destinationAirport]);
        return map;
      }

      map.set(route.destinationCity, {
        value: route.destinationCity,
        label: route.destinationCity,
        airports: [route.destinationAirport],
      });
      return map;
    },
    new Map<string, { value: string; label: string; airports: string[] }>(),
  ).values(),
).sort((left, right) => left.label.localeCompare(right.label));

export function deriveSelectedRoutesFromBuckets(preferredBuckets: BucketValue[]) {
  return routePreferenceOptions
    .filter((route) => preferredBuckets.includes(route.bucket))
    .map((route) => route.key);
}

function unique<T>(values: readonly T[]) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

export const customAlertRuleSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(80),
    destinationCity: z.string().trim().min(1).max(120).nullable(),
    bucket: z.enum(bucketValues).nullable(),
    maxStopsPreferences: z.array(z.enum(maxStopsPreferenceValues)).min(1),
    budgetCeilingEur: z.number().int().positive().max(5000).nullable(),
    departureWeekdays: z.array(z.enum(weekdayValues)).min(1),
    minTripNights: z.number().int().positive().max(30).nullable(),
    maxTripNights: z.number().int().positive().max(30).nullable(),
    isActive: z.boolean(),
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
  });

export type CustomAlertRuleValue = z.infer<typeof customAlertRuleSchema>;

export const defaultPreferenceValues = {
  preferredBuckets: [...bucketValues] as BucketValue[],
  selectedRoutes: deriveSelectedRoutesFromBuckets([...bucketValues] as BucketValue[]),
  maxStopsPreferences: ["ONE_STOP_OR_FEWER"] as MaxStopsPreferenceValue[],
  departureWeekdays: [...weekdayValues] as WeekdayValue[],
  minTripNights: null as number | null,
  maxTripNights: null as number | null,
  budgetCeilingEur: null as number | null,
  deliveryModes: ["daily_digest"] as DeliveryModeValue[],
  customAlertRules: [] as CustomAlertRuleValue[],
};

export const preferencePayloadSchema = z
  .object({
    token: z.string().uuid(),
    preferredBuckets: z.array(z.enum(bucketValues)).min(1),
    selectedRoutes: z.array(z.string()).min(1),
    maxStopsPreferences: z.array(z.enum(maxStopsPreferenceValues)).min(1),
    departureWeekdays: z.array(z.enum(weekdayValues)).min(1),
    minTripNights: z.number().int().positive().max(30).nullable(),
    maxTripNights: z.number().int().positive().max(30).nullable(),
    budgetCeilingEur: z.number().int().positive().max(5000).nullable(),
    deliveryModes: z.array(z.enum(deliveryModeValues)).min(1),
    customAlertRules: z.array(customAlertRuleSchema).max(8),
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
  emailConfirmed: boolean;
  status: string;
  unsubscribePath: string;
  form: Omit<PreferencePayload, "token">;
};
