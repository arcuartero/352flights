export type WhenFilter = "any" | "next_30" | "may_aug" | "school_holidays" | "this_weekend";
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
};

export const DEFAULT_DEAL_SEARCH_FILTERS: DealSearchFilters = {
  whenFilter: "any",
  tripFilter: "any",
  budgetFilter: "any",
  directOnly: false,
  themeFilter: "any",
  destinationFilter: "any",
  departureWeekdayFilter: "any",
  durationFilter: "any",
};

const WHEN_FILTERS = new Set<WhenFilter>([
  "any",
  "next_30",
  "may_aug",
  "school_holidays",
  "this_weekend",
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

  return {
    whenFilter: WHEN_FILTERS.has((whenValue as WhenFilter) ?? "any")
      ? ((whenValue as WhenFilter) ?? "any")
      : "any",
    tripFilter: TRIP_FILTERS.has((tripValue as TripFilter) ?? "any")
      ? ((tripValue as TripFilter) ?? "any")
      : "any",
    budgetFilter: BUDGET_FILTERS.has((budgetValue as BudgetFilter) ?? "any")
      ? ((budgetValue as BudgetFilter) ?? "any")
      : "any",
    directOnly: directValue === "1" || directValue === "true",
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

  if (filters.whenFilter !== "any") {
    params.set("when", filters.whenFilter);
  }

  if (filters.tripFilter !== "any") {
    params.set("trip", filters.tripFilter);
  }

  if (filters.budgetFilter !== "any") {
    params.set("budget", filters.budgetFilter);
  }

  if (filters.directOnly) {
    params.set("direct", "1");
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
    filters.durationFilter !== "any"
  );
}
