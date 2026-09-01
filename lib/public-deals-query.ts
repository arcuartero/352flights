import { getDestinationTheme } from "@/lib/destination-content";
import { getMatchingLuxSchoolHoliday } from "@/lib/lux-school-holidays";
import type { PublicDealsPageData } from "@/lib/ops";
import type { CampaignPreviewDeal } from "@/lib/ops-shared";
import {
  doesTripIncludeWeekend,
  getWhenFilterDateRange,
  isTripInCurrentWeekend,
  type DealSearchFilters,
  type DealSearchSort,
  type DepartureWeekdayFilter,
  type DurationFilter,
  type ThemeFilter,
  type TripFilter,
  type WhenFilter,
} from "@/lib/public-deals-search";

export const PUBLIC_DEALS_SEARCH_PAGE_SIZE = 10;
export const PUBLIC_DEALS_SEARCH_MAX_LIMIT = 200;

export type PublicDealsSearchQuickChip =
  | "this_weekend"
  | "weeklong"
  | "school_holidays"
  | "under_50"
  | "direct"
  | "beach"
  | "city"
  | "nature";

export type PublicDealsSearchMapFare = Pick<
  CampaignPreviewDeal,
  | "id"
  | "routeLabel"
  | "departureDate"
  | "returnDate"
  | "airlineSummary"
  | "primaryAirlineCode"
  | "dealPrice"
>;

export type PublicDealsSearchMapCity = {
  key: string;
  city: string;
  airport: string;
  deals: PublicDealsSearchMapFare[];
  lowestPrice: number;
};

export type PublicDealsSearchFacets = {
  destinations: Array<{
    value: string;
    label: string;
    airport: string;
    count: number;
    disabled: boolean;
  }>;
  popularDestinationValues: string[];
  departureWeekdays: DepartureWeekdayFilter[];
  whenValues: WhenFilter[];
  tripValues: TripFilter[];
  durationValues: Exclude<DurationFilter, "any">[];
  airlines: Array<{ key: string; label: string }>;
  prices: number[];
  directOnlyAvailable: boolean;
  quickChips: Record<PublicDealsSearchQuickChip, boolean>;
};

export type PublicDealsSearchResult = {
  configured: boolean;
  schemaReady: boolean;
  onboardingMessage: string | null;
  deals: CampaignPreviewDeal[];
  total: number;
  limit: number;
  updatedAt: string | null;
  destinationCounts: Record<string, number>;
  mapCities: PublicDealsSearchMapCity[];
  facets: PublicDealsSearchFacets;
  queryKey: string;
};

const WHEN_VALUES: WhenFilter[] = [
  "any",
  "this_weekend",
  "weekends",
  "next_30",
  "this_month",
  "next_month",
  "this_year",
  "next_year",
  "school_holidays",
];
const TRIP_VALUES: TripFilter[] = ["any", "weekend", "weeklong", "long_stay"];
const DEPARTURE_WEEKDAYS: DepartureWeekdayFilter[] = [
  "any",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
const DURATION_VALUES: Exclude<DurationFilter, "any">[] = ["1", "2", "3", "4_plus"];
const QUICK_CHIPS: PublicDealsSearchQuickChip[] = [
  "this_weekend",
  "weeklong",
  "school_holidays",
  "under_50",
  "direct",
  "beach",
  "city",
  "nature",
];
const BEST_DEAL_PREFERRED_STAY_HOURS = 48;
const BEST_DEAL_FRESHNESS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeDestination(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function normalizeAirline(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ");
}

function getAirlineNames(deal: CampaignPreviewDeal) {
  return [
    ...new Set(
      (deal.airlineSummary ?? "")
        .split(/,|\+/)
        .map((item) => item.trim())
        .filter((item) => item && !/^\d+\s+more$/i.test(item)),
    ),
  ];
}

function getStayDurationDays(deal: CampaignPreviewDeal) {
  if (deal.destinationStayHours !== null) {
    return Math.max(1, Math.floor(deal.destinationStayHours / 24));
  }
  return Math.max(1, deal.tripNights);
}

function getDurationValue(deal: CampaignPreviewDeal): Exclude<DurationFilter, "any"> {
  const days = getStayDurationDays(deal);
  return days >= 4 ? "4_plus" : (String(days) as Exclude<DurationFilter, "any">);
}

function getDepartureWeekday(value: string | null): DepartureWeekdayFilter {
  if (!value) return "any";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "any";
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Luxembourg",
    weekday: "long",
  })
    .format(date)
    .toLowerCase();
  return DEPARTURE_WEEKDAYS.includes(weekday as DepartureWeekdayFilter)
    ? (weekday as DepartureWeekdayFilter)
    : "any";
}

function isWeekendDeal(deal: CampaignPreviewDeal) {
  return normalizeDestination(deal.routeBucket).includes("weekend") || deal.tripNights <= 4;
}

function matchesWhen(deal: CampaignPreviewDeal, filters: DealSearchFilters, now: Date) {
  const departure = deal.departureDate ? new Date(deal.departureDate) : null;
  if (!departure || Number.isNaN(departure.getTime())) return filters.whenFilter === "any";

  switch (filters.whenFilter) {
    case "next_30":
    case "this_month":
    case "next_month":
    case "this_year":
    case "next_year": {
      const departureDateKey = deal.departureDate?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
      const range = getWhenFilterDateRange(filters.whenFilter, now);
      return Boolean(
        departureDateKey &&
          range &&
          departureDateKey >= range.dateFrom &&
          departureDateKey <= range.dateTo,
      );
    }
    case "school_holidays":
      return Boolean(getMatchingLuxSchoolHoliday(deal.departureDate, deal.returnDate));
    case "this_weekend":
      return isTripInCurrentWeekend(deal.departureDate, deal.returnDate, now);
    case "weekends":
      return doesTripIncludeWeekend(deal.departureDate, deal.returnDate);
    case "custom": {
      const departureDateKey = deal.departureDate?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
      return Boolean(
        departureDateKey &&
          filters.dateFrom &&
          filters.dateTo &&
          departureDateKey >= filters.dateFrom &&
          departureDateKey <= filters.dateTo,
      );
    }
    default:
      return true;
  }
}

function matchesTrip(deal: CampaignPreviewDeal, tripFilter: TripFilter) {
  if (tripFilter === "weekend") return isWeekendDeal(deal);
  if (tripFilter === "weeklong") return deal.tripNights >= 5 && deal.tripNights <= 7;
  if (tripFilter === "long_stay") return deal.tripNights > 4;
  return true;
}

export function matchesPublicDealSearchFilters(
  deal: CampaignPreviewDeal,
  filters: DealSearchFilters,
  now: Date,
) {
  if (deal.dealPrice <= 0 || !matchesWhen(deal, filters, now)) return false;
  if (!matchesTrip(deal, filters.tripFilter)) return false;
  if (filters.budgetFilter !== "any" && deal.dealPrice > Number(filters.budgetFilter)) return false;
  if (filters.priceMin !== null && deal.dealPrice < filters.priceMin) return false;
  if (filters.priceMax !== null && deal.dealPrice > filters.priceMax) return false;

  const airlineKeys = getAirlineNames(deal).map(normalizeAirline);
  if (filters.excludedAirlines.some((airline) => airlineKeys.includes(airline))) return false;
  if (filters.durationFilter !== "any" && getDurationValue(deal) !== filters.durationFilter) {
    return false;
  }
  if (filters.directOnly && deal.maxStops !== "NON_STOP") return false;
  if (
    filters.destinationFilter !== "any" &&
    normalizeDestination(deal.destinationCity) !== filters.destinationFilter
  ) {
    return false;
  }
  if (
    filters.departureWeekdayFilter !== "any" &&
    getDepartureWeekday(deal.departureDate) !== filters.departureWeekdayFilter
  ) {
    return false;
  }
  return filters.themeFilter === "any" || getDestinationTheme(deal.destinationCity) === filters.themeFilter;
}

function compareByPrice(left: CampaignPreviewDeal, right: CampaignPreviewDeal) {
  return left.dealPrice !== right.dealPrice
    ? left.dealPrice - right.dealPrice
    : right.score - left.score;
}

function getDepartureTimestamp(deal: CampaignPreviewDeal) {
  const timestamp = deal.departureDate ? new Date(deal.departureDate).getTime() : Number.NaN;
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function getDestinationStayHours(deal: CampaignPreviewDeal) {
  return deal.destinationStayHours ?? Math.max(0, deal.tripNights * 24);
}

function compareBest(left: CampaignPreviewDeal, right: CampaignPreviewDeal, now: Date) {
  const leftPreferred = getDestinationStayHours(left) > BEST_DEAL_PREFERRED_STAY_HOURS;
  const rightPreferred = getDestinationStayHours(right) > BEST_DEAL_PREFERRED_STAY_HOURS;
  if (leftPreferred !== rightPreferred) return leftPreferred ? -1 : 1;

  const score = (deal: CampaignPreviewDeal) => {
    const priceScore = 35 / (1 + Math.max(0, deal.dealPrice) / 120);
    const verifiedAt = deal.verifiedAt ? new Date(deal.verifiedAt).getTime() : Number.NaN;
    const verifiedAge = Number.isFinite(verifiedAt)
      ? Math.max(0, now.getTime() - verifiedAt)
      : BEST_DEAL_FRESHNESS_WINDOW_MS;
    const freshnessScore =
      12 * (1 - Math.min(verifiedAge, BEST_DEAL_FRESHNESS_WINDOW_MS) / BEST_DEAL_FRESHNESS_WINDOW_MS);
    const directScore = deal.maxStops === "NON_STOP" ? 15 : 0;
    const verifiedDiscount =
      deal.pricePosition !== "new_price" &&
      deal.baselinePrice !== null &&
      deal.baselinePrice > 0 &&
      deal.dropRatio !== null
        ? Math.max(0, Math.min(0.5, 1 - deal.dropRatio))
        : 0;
    const discountScore = (verifiedDiscount / 0.5) * 30;
    const usefulStayScore =
      10 * Math.min(1, Math.max(0, getDestinationStayHours(deal) - BEST_DEAL_PREFERRED_STAY_HOURS) / 120);
    return priceScore + freshnessScore + directScore + discountScore + usefulStayScore;
  };

  const difference = score(right) - score(left);
  return Math.abs(difference) > Number.EPSILON ? difference : compareByPrice(left, right);
}

export function comparePublicDealsBySort(
  left: CampaignPreviewDeal,
  right: CampaignPreviewDeal,
  sort: DealSearchSort,
  now: Date,
) {
  if (sort === "best") return compareBest(left, right, now);
  if (sort === "price_desc" && left.dealPrice !== right.dealPrice) return right.dealPrice - left.dealPrice;
  if (sort === "departure_soonest" || sort === "departure_latest") {
    const difference = getDepartureTimestamp(left) - getDepartureTimestamp(right);
    if (difference !== 0) return sort === "departure_soonest" ? difference : -difference;
  }
  if (sort === "trip_shortest" && left.tripNights !== right.tripNights) {
    return left.tripNights - right.tripNights;
  }
  if (sort === "trip_longest" && left.tripNights !== right.tripNights) {
    return right.tripNights - left.tripNights;
  }
  if (sort === "price_asc" && left.dealPrice !== right.dealPrice) {
    return left.dealPrice - right.dealPrice;
  }
  return compareByPrice(left, right);
}

function applyQuickChip(chip: PublicDealsSearchQuickChip, filters: DealSearchFilters) {
  if (chip === "this_weekend" || chip === "school_holidays") {
    return { ...filters, whenFilter: chip, dateFrom: null, dateTo: null } as DealSearchFilters;
  }
  if (chip === "weeklong") return { ...filters, tripFilter: "weeklong" as const };
  if (chip === "under_50") {
    return { ...filters, budgetFilter: "50" as const, priceMin: null, priceMax: null };
  }
  if (chip === "direct") return { ...filters, directOnly: true };
  if (chip === "beach" || chip === "city" || chip === "nature") {
    return { ...filters, themeFilter: chip } as DealSearchFilters;
  }
  return filters;
}

function isQuickChipActive(chip: PublicDealsSearchQuickChip, filters: DealSearchFilters) {
  if (chip === "this_weekend") return filters.whenFilter === "this_weekend";
  if (chip === "weeklong") return filters.tripFilter === "weeklong";
  if (chip === "school_holidays") return filters.whenFilter === "school_holidays";
  if (chip === "under_50") return filters.budgetFilter === "50";
  if (chip === "direct") return filters.directOnly;
  if (chip === "beach" || chip === "city" || chip === "nature") {
    return filters.themeFilter === chip;
  }
  return false;
}

function getDestinationCountKey(deal: CampaignPreviewDeal) {
  return `${deal.destinationAirport}-${normalizeDestination(deal.destinationCity)}`;
}

export function getPublicDealsSearchQueryKey(
  filters: DealSearchFilters,
  sort: DealSearchSort,
  limit: number,
) {
  return JSON.stringify({
    filters: { ...filters, excludedAirlines: [...filters.excludedAirlines].sort() },
    sort,
    limit,
  });
}

export function buildPublicDealsSearchResult(
  data: PublicDealsPageData,
  filters: DealSearchFilters,
  sort: DealSearchSort,
  requestedLimit: number = PUBLIC_DEALS_SEARCH_PAGE_SIZE,
  now: Date = new Date(),
): PublicDealsSearchResult {
  const limit = Math.min(
    PUBLIC_DEALS_SEARCH_MAX_LIMIT,
    Math.max(PUBLIC_DEALS_SEARCH_PAGE_SIZE, Math.round(requestedLimit)),
  );
  const allDeals = data.deals.filter((deal) => deal.dealPrice > 0);
  const filteredDeals = allDeals
    .filter((deal) => matchesPublicDealSearchFilters(deal, filters, now))
    .sort((left, right) => comparePublicDealsBySort(left, right, sort, now));

  const destinationCounts = filteredDeals.reduce<Record<string, number>>((counts, deal) => {
    const key = getDestinationCountKey(deal);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

  const mapGroups = new Map<string, PublicDealsSearchMapCity>();
  filteredDeals.forEach((deal) => {
    const city = deal.destinationCity.trim();
    if (!city) return;
    const key = `${deal.destinationAirport}-${normalizeDestination(city)}`;
    const fare: PublicDealsSearchMapFare = {
      id: deal.id,
      routeLabel: deal.routeLabel,
      departureDate: deal.departureDate,
      returnDate: deal.returnDate,
      airlineSummary: deal.airlineSummary,
      primaryAirlineCode: deal.primaryAirlineCode,
      dealPrice: deal.dealPrice,
    };
    const group = mapGroups.get(key);
    if (group) {
      group.lowestPrice = Math.min(group.lowestPrice, deal.dealPrice);
      if (group.deals.length < 4) group.deals.push(fare);
      return;
    }
    mapGroups.set(key, {
      key,
      city,
      airport: deal.destinationAirport,
      deals: [fare],
      lowestPrice: deal.dealPrice,
    });
  });

  const facetFilters: DealSearchFilters = {
    ...filters,
    budgetFilter: "any",
    priceMin: null,
    priceMax: null,
    excludedAirlines: [],
  };
  const facetDeals = allDeals.filter((deal) =>
    matchesPublicDealSearchFilters(deal, facetFilters, now),
  );
  const cityCatalog = new Map<string, { label: string; airport: string; globalCount: number }>();
  allDeals.forEach((deal) => {
    const label = deal.destinationCity.trim();
    if (!label) return;
    const value = normalizeDestination(label);
    const existing = cityCatalog.get(value);
    if (existing) {
      existing.globalCount += 1;
    } else {
      cityCatalog.set(value, { label, airport: deal.destinationAirport, globalCount: 1 });
    }
  });

  const destinations = [...cityCatalog.entries()]
    .map(([value, city]) => {
      const destinationFilters = { ...filters, destinationFilter: value };
      const count = allDeals.reduce(
        (total, deal) =>
          total + (matchesPublicDealSearchFilters(deal, destinationFilters, now) ? 1 : 0),
        0,
      );
      return { value, label: city.label, airport: city.airport, count, disabled: count === 0 };
    })
    .sort((left, right) => left.label.localeCompare(right.label, "en"));

  const popularDestinationValues = [...cityCatalog.entries()]
    .sort((left, right) => right[1].globalCount - left[1].globalCount || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([value]) => value);

  const labelsByAirline = new Map<string, string>();
  facetDeals.forEach((deal) => {
    getAirlineNames(deal).forEach((label) => {
      const key = normalizeAirline(label);
      if (key && !labelsByAirline.has(key)) labelsByAirline.set(key, label);
    });
  });
  const hasMatches = (nextFilters: DealSearchFilters) =>
    allDeals.some((deal) => matchesPublicDealSearchFilters(deal, nextFilters, now));

  return {
    configured: data.configured,
    schemaReady: data.schemaReady,
    onboardingMessage: data.onboardingMessage,
    deals: filteredDeals.slice(0, limit),
    total: filteredDeals.length,
    limit,
    updatedAt: data.updatedAt,
    destinationCounts,
    mapCities: [...mapGroups.values()],
    facets: {
      destinations,
      popularDestinationValues,
      departureWeekdays: DEPARTURE_WEEKDAYS.filter(
        (value) => value === "any" || hasMatches({ ...filters, departureWeekdayFilter: value }),
      ),
      whenValues: WHEN_VALUES.filter(
        (value) =>
          value === "any" ||
          hasMatches({ ...filters, whenFilter: value, dateFrom: null, dateTo: null }),
      ),
      tripValues: TRIP_VALUES.filter(
        (value) => value === "any" || hasMatches({ ...filters, tripFilter: value }),
      ),
      durationValues: DURATION_VALUES.filter((value) =>
        hasMatches({ ...filters, durationFilter: value }),
      ),
      airlines: [...labelsByAirline]
        .map(([key, label]) => ({ key, label }))
        .sort((left, right) => left.label.localeCompare(right.label, "en")),
      prices: facetDeals.map((deal) => deal.dealPrice),
      directOnlyAvailable: filters.directOnly || hasMatches({ ...filters, directOnly: true }),
      quickChips: Object.fromEntries(
        QUICK_CHIPS.map((chip) => [
          chip,
          isQuickChipActive(chip, filters) || hasMatches(applyQuickChip(chip, filters)),
        ]),
      ) as Record<PublicDealsSearchQuickChip, boolean>,
    },
    queryKey: getPublicDealsSearchQueryKey(filters, sort, limit),
  };
}
