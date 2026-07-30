export type WhenFilter =
  | "any"
  | "next_30"
  | "school_holidays"
  | "this_weekend"
  | "weekends"
  | "custom";
export type TripFilter = "any" | "weekend" | "weeklong" | "long_stay";
export type BudgetFilter = "any" | "50" | "80" | "120" | "200";
export type ThemeFilter = "any" | "beach" | "city" | "nature";
export type DurationFilter = "any" | "1" | "2" | "3" | "4_plus";
export type DepartureWeekdayFilter =
  | "any"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";
export type DealSearchSort =
  | "price_asc"
  | "price_desc"
  | "departure_soonest"
  | "departure_latest"
  | "trip_shortest"
  | "trip_longest";

export type DealSearchFilters = {
  whenFilter: WhenFilter;
  tripFilter: TripFilter;
  budgetFilter: BudgetFilter;
  directOnly: boolean;
  themeFilter: ThemeFilter;
  destinationFilter: string;
  departureWeekdayFilter: DepartureWeekdayFilter;
  durationFilter: DurationFilter;
  dateFrom: string | null;
  dateTo: string | null;
};

export const DEFAULT_DEAL_SEARCH_FILTERS: DealSearchFilters = {
  whenFilter: "any",
  tripFilter: "any",
  budgetFilter: "any",
  directOnly: true,
  themeFilter: "any",
  destinationFilter: "any",
  departureWeekdayFilter: "any",
  durationFilter: "any",
  dateFrom: null,
  dateTo: null,
};

const WHEN_FILTERS = new Set<WhenFilter>([
  "any",
  "next_30",
  "school_holidays",
  "this_weekend",
  "weekends",
  "custom",
]);

const TRIP_FILTERS = new Set<TripFilter>(["any", "weekend", "weeklong", "long_stay"]);
const BUDGET_FILTERS = new Set<BudgetFilter>(["any", "50", "80", "120", "200"]);
const THEME_FILTERS = new Set<ThemeFilter>(["any", "beach", "city", "nature"]);
const DURATION_FILTERS = new Set<DurationFilter>(["any", "1", "2", "3", "4_plus"]);
const DEPARTURE_WEEKDAY_FILTERS = new Set<DepartureWeekdayFilter>([
  "any",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);
const DEAL_SEARCH_SORTS = new Set<DealSearchSort>([
  "price_asc",
  "price_desc",
  "departure_soonest",
  "departure_latest",
  "trip_shortest",
  "trip_longest",
]);
export const DEFAULT_DEAL_SEARCH_SORT: DealSearchSort = "price_asc";

function extractDateKey(value: string | null | undefined) {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}

function addUtcDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function isTripInCurrentWeekend(
  departureDate: string | null | undefined,
  returnDate: string | null | undefined,
  now: Date,
) {
  const departureDateKey = extractDateKey(departureDate);
  if (!departureDateKey || Number.isNaN(now.getTime())) {
    return false;
  }

  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12));
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  const monday = addUtcDays(today, -daysSinceMonday);
  const saturdayDateKey = addUtcDays(monday, 5).toISOString().slice(0, 10);
  const sundayDateKey = addUtcDays(monday, 6).toISOString().slice(0, 10);
  const parsedReturnDateKey = extractDateKey(returnDate);
  const returnDateKey =
    parsedReturnDateKey && parsedReturnDateKey >= departureDateKey
      ? parsedReturnDateKey
      : departureDateKey;

  return departureDateKey <= sundayDateKey && returnDateKey >= saturdayDateKey;
}

export function doesTripIncludeWeekend(
  departureDate: string | null | undefined,
  returnDate: string | null | undefined,
) {
  const departureDateKey = extractDateKey(departureDate);
  if (!departureDateKey) {
    return false;
  }

  const parsedReturnDateKey = extractDateKey(returnDate);
  const returnDateKey =
    parsedReturnDateKey && parsedReturnDateKey >= departureDateKey
      ? parsedReturnDateKey
      : departureDateKey;
  const departure = new Date(`${departureDateKey}T12:00:00Z`);
  const tripEnd = new Date(`${returnDateKey}T12:00:00Z`);

  if (Number.isNaN(departure.getTime()) || Number.isNaN(tripEnd.getTime())) {
    return false;
  }

  for (let date = departure; date <= tripEnd; date = addUtcDays(date, 1)) {
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) {
      return true;
    }
  }

  return false;
}

function normalizeDestinationFilterValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function getParamValue(
  source: Record<string, string | string[] | undefined> | URLSearchParams,
  key: string,
) {
  if (source instanceof URLSearchParams) {
    return source.get(key) ?? undefined;
  }

  const value = source[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseDateParam(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

export function parseDealSearchFilters(
  source: Record<string, string | string[] | undefined> | URLSearchParams,
): DealSearchFilters {
  const whenValue = getParamValue(source, "when");
  const tripValue = getParamValue(source, "trip");
  const budgetValue = getParamValue(source, "budget");
  const directValue = getParamValue(source, "direct");
  const themeValue = getParamValue(source, "theme");
  const destinationValue = getParamValue(source, "destination");
  const departureWeekdayValue = getParamValue(source, "departure_weekday");
  const durationValue = getParamValue(source, "duration");
  const dateFrom = parseDateParam(getParamValue(source, "date_from"));
  const dateTo = parseDateParam(getParamValue(source, "date_to"));
  const parsedWhenFilter = WHEN_FILTERS.has((whenValue as WhenFilter) ?? "any")
    ? ((whenValue as WhenFilter) ?? "any")
    : "any";
  const hasValidCustomRange = Boolean(dateFrom && dateTo && dateFrom <= dateTo);
  const hasSelectedCustomRange = parsedWhenFilter === "custom" && hasValidCustomRange;

  return {
    whenFilter: parsedWhenFilter === "custom" && !hasValidCustomRange ? "any" : parsedWhenFilter,
    tripFilter: TRIP_FILTERS.has((tripValue as TripFilter) ?? "any")
      ? ((tripValue as TripFilter) ?? "any")
      : "any",
    budgetFilter: BUDGET_FILTERS.has((budgetValue as BudgetFilter) ?? "any")
      ? ((budgetValue as BudgetFilter) ?? "any")
      : "any",
    directOnly:
      directValue === undefined
        ? DEFAULT_DEAL_SEARCH_FILTERS.directOnly
        : directValue === "1" || directValue === "true",
    themeFilter: THEME_FILTERS.has((themeValue as ThemeFilter) ?? "any")
      ? ((themeValue as ThemeFilter) ?? "any")
      : "any",
    destinationFilter:
      destinationValue && destinationValue.trim().length > 0
        ? normalizeDestinationFilterValue(destinationValue)
        : "any",
    departureWeekdayFilter: DEPARTURE_WEEKDAY_FILTERS.has(
      (departureWeekdayValue as DepartureWeekdayFilter) ?? "any",
    )
      ? ((departureWeekdayValue as DepartureWeekdayFilter) ?? "any")
      : "any",
    durationFilter: DURATION_FILTERS.has((durationValue as DurationFilter) ?? "any")
      ? ((durationValue as DurationFilter) ?? "any")
      : "any",
    dateFrom: hasSelectedCustomRange ? dateFrom : null,
    dateTo: hasSelectedCustomRange ? dateTo : null,
  };
}

export function parseDealSearchSort(
  source: Record<string, string | string[] | undefined> | URLSearchParams,
): DealSearchSort {
  const sortValue = getParamValue(source, "sort");
  return DEAL_SEARCH_SORTS.has((sortValue as DealSearchSort) ?? DEFAULT_DEAL_SEARCH_SORT)
    ? ((sortValue as DealSearchSort) ?? DEFAULT_DEAL_SEARCH_SORT)
    : DEFAULT_DEAL_SEARCH_SORT;
}

export function buildDealsSearchHref(
  filters: DealSearchFilters,
  pathname: string = "/deals/search",
  sort: DealSearchSort = DEFAULT_DEAL_SEARCH_SORT,
) {
  const params = new URLSearchParams();

  if (
    filters.whenFilter !== "any" &&
    (filters.whenFilter !== "custom" || (filters.dateFrom && filters.dateTo))
  ) {
    params.set("when", filters.whenFilter);
  }

  if (filters.whenFilter === "custom" && filters.dateFrom && filters.dateTo) {
    params.set("date_from", filters.dateFrom);
    params.set("date_to", filters.dateTo);
  }

  if (filters.tripFilter !== "any") {
    params.set("trip", filters.tripFilter);
  }

  if (filters.budgetFilter !== "any") {
    params.set("budget", filters.budgetFilter);
  }

  if (filters.directOnly !== DEFAULT_DEAL_SEARCH_FILTERS.directOnly) {
    params.set("direct", filters.directOnly ? "1" : "0");
  }

  if (filters.themeFilter !== "any") {
    params.set("theme", filters.themeFilter);
  }

  if (filters.destinationFilter !== "any") {
    params.set("destination", normalizeDestinationFilterValue(filters.destinationFilter));
  }

  if (filters.departureWeekdayFilter !== "any") {
    params.set("departure_weekday", filters.departureWeekdayFilter);
  }

  if (filters.durationFilter !== "any") {
    params.set("duration", filters.durationFilter);
  }

  if (sort !== DEFAULT_DEAL_SEARCH_SORT) {
    params.set("sort", sort);
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function hasActiveDealSearchFilters(filters: DealSearchFilters) {
  return (
    filters.whenFilter !== "any" ||
    filters.tripFilter !== "any" ||
    filters.budgetFilter !== "any" ||
    filters.directOnly ||
    filters.themeFilter !== "any" ||
    filters.destinationFilter !== "any" ||
    filters.departureWeekdayFilter !== "any" ||
    filters.durationFilter !== "any" ||
    Boolean(filters.dateFrom && filters.dateTo)
  );
}
