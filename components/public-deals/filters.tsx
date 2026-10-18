"use client";

import { type PublicDealsSelectOption as SelectOption } from "@/components/public-deals-select";
import { getAirportCountryCode } from "@/lib/airport-countries";
import { getDestinationTheme } from "@/lib/destination-content";
import { toDestinationSlug } from "@/lib/destination-slugs";
import { type Locale } from "@/lib/i18n";
import { getLocalizedDestinationPath } from "@/lib/locales";
import type { CampaignPreviewDeal } from "@/lib/ops-shared";
import { getMatchingLuxSchoolHoliday } from "@/lib/lux-school-holidays";
import {
  getSelectedDepartureWeekdayFilters,
  getSelectedDurationFilters,
  getWhenFilterDateRange,
  doesTripIncludeWeekend,
  isTripInCurrentWeekend,
  type BudgetFilter,
  type DealSearchSort,
  type DurationFilter,
  type DealSearchFilters,
  type ThemeFilter,
  type TripFilter,
} from "@/lib/public-deals-search";
import {
  type DestinationPhotoUrlMap,
  type QuickChip,
  type SearchCityGroup,
  type Translate,
} from "@/components/public-deals/types";
import {
  BEST_DEAL_FRESHNESS_WINDOW_MS,
  BEST_DEAL_PREFERRED_STAY_HOURS,
  DURATION_FILTER_VALUES,
  LANDMARK_TITLE_BY_DESTINATION,
  QUICK_CHIP_OPTIONS,
} from "@/components/public-deals/constants";
import {
  getDealAirlineNames,
  getDepartureWeekdayFilterValue,
  getDurationFilterValue,
  normalizeAirlineName,
  normalizeDestinationKey,
} from "@/components/public-deals/formatters";

export function getDestinationPhotoSrc(
  destinationPhotoUrls: DestinationPhotoUrlMap | undefined,
  city: string,
) {
  return destinationPhotoUrls?.[toDestinationSlug(city)] ?? undefined;
}

export function getQuickChipState(chip: QuickChip, filters: DealSearchFilters) {
  switch (chip) {
    case "this_weekend":
      return filters.whenFilter === "this_weekend";
    case "weekend":
      return filters.tripFilter === "weekend";
    case "weeklong":
      return filters.tripFilter === "weeklong";
    case "school_holidays":
      return filters.whenFilter === "school_holidays";
    case "under_50":
      return filters.budgetFilter === "50";
    case "cheap_direct":
      return filters.budgetFilter === "80" && filters.directOnly;
    case "direct":
      return filters.directOnly;
    case "beach":
      return filters.themeFilter === "beach";
    case "city":
      return filters.themeFilter === "city";
    case "nature":
      return filters.themeFilter === "nature";
  }
}

export function resetQuickChip(
  chip: QuickChip,
  filters: DealSearchFilters,
): DealSearchFilters {
  switch (chip) {
    case "this_weekend":
    case "school_holidays":
      return { ...filters, whenFilter: "any", dateFrom: null, dateTo: null };
    case "weekend":
    case "weeklong":
      return { ...filters, tripFilter: "any" };
    case "under_50":
    case "cheap_direct":
      return {
        ...filters,
        budgetFilter: "any",
        priceMin: null,
        priceMax: null,
        directOnly: false,
      };
    case "direct":
      return { ...filters, directOnly: false };
    case "beach":
    case "city":
    case "nature":
      return { ...filters, themeFilter: "any" };
  }
}

export function getLuxDateKey(value: Date | string | null) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Luxembourg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function compareDealsByPrice(
  left: CampaignPreviewDeal,
  right: CampaignPreviewDeal,
) {
  if (left.dealPrice !== right.dealPrice) {
    return left.dealPrice - right.dealPrice;
  }

  return right.score - left.score;
}

export function getDepartureTimestamp(deal: CampaignPreviewDeal) {
  const timestamp = deal.departureDate
    ? new Date(deal.departureDate).getTime()
    : Number.NaN;
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

export function getDestinationStayHoursForSort(deal: CampaignPreviewDeal) {
  return deal.destinationStayHours ?? Math.max(0, deal.tripNights * 24);
}

export function hasPreferredDestinationStay(deal: CampaignPreviewDeal) {
  return getDestinationStayHoursForSort(deal) > BEST_DEAL_PREFERRED_STAY_HOURS;
}

export function getBestDealSortScore(deal: CampaignPreviewDeal, now: Date) {
  const priceScore = 35 / (1 + Math.max(0, deal.dealPrice) / 120);
  const verifiedTimestamp = deal.verifiedAt
    ? new Date(deal.verifiedAt).getTime()
    : Number.NaN;
  const verifiedAge = Number.isFinite(verifiedTimestamp)
    ? Math.max(0, now.getTime() - verifiedTimestamp)
    : BEST_DEAL_FRESHNESS_WINDOW_MS;
  const freshnessScore =
    12 *
    (1 -
      Math.min(verifiedAge, BEST_DEAL_FRESHNESS_WINDOW_MS) /
        BEST_DEAL_FRESHNESS_WINDOW_MS);
  const directScore = deal.maxStops === "NON_STOP" ? 15 : 0;
  const verifiedDiscount =
    deal.pricePosition !== "new_price" &&
    deal.baselinePrice !== null &&
    deal.baselinePrice > 0 &&
    deal.dropRatio !== null
      ? Math.max(0, Math.min(0.5, 1 - deal.dropRatio))
      : 0;
  const discountScore = (verifiedDiscount / 0.5) * 30;
  const destinationStayHours = getDestinationStayHoursForSort(deal);
  const usefulStayScore =
    10 *
    Math.min(
      1,
      Math.max(0, destinationStayHours - BEST_DEAL_PREFERRED_STAY_HOURS) / 120,
    );

  return (
    priceScore + freshnessScore + directScore + discountScore + usefulStayScore
  );
}

export function compareBestDeals(
  left: CampaignPreviewDeal,
  right: CampaignPreviewDeal,
  now: Date,
) {
  const leftHasPreferredStay = hasPreferredDestinationStay(left);
  const rightHasPreferredStay = hasPreferredDestinationStay(right);
  if (leftHasPreferredStay !== rightHasPreferredStay) {
    return leftHasPreferredStay ? -1 : 1;
  }

  const scoreDifference =
    getBestDealSortScore(right, now) - getBestDealSortScore(left, now);
  if (Math.abs(scoreDifference) > Number.EPSILON) {
    return scoreDifference;
  }

  return compareDealsByPrice(left, right);
}

export function compareDealsBySort(
  left: CampaignPreviewDeal,
  right: CampaignPreviewDeal,
  sort: DealSearchSort,
  now: Date,
) {
  switch (sort) {
    case "best":
      return compareBestDeals(left, right, now);
    case "price_desc":
      if (left.dealPrice !== right.dealPrice) {
        return right.dealPrice - left.dealPrice;
      }
      break;
    case "departure_soonest": {
      const leftDeparture = getDepartureTimestamp(left);
      const rightDeparture = getDepartureTimestamp(right);
      if (leftDeparture !== rightDeparture) {
        return leftDeparture - rightDeparture;
      }
      break;
    }
    case "departure_latest": {
      const leftDeparture = getDepartureTimestamp(left);
      const rightDeparture = getDepartureTimestamp(right);
      if (leftDeparture !== rightDeparture) {
        return rightDeparture - leftDeparture;
      }
      break;
    }
    case "trip_shortest":
      if (left.tripNights !== right.tripNights) {
        return left.tripNights - right.tripNights;
      }
      break;
    case "trip_longest":
      if (left.tripNights !== right.tripNights) {
        return right.tripNights - left.tripNights;
      }
      break;
    case "price_asc":
    default:
      if (left.dealPrice !== right.dealPrice) {
        return left.dealPrice - right.dealPrice;
      }
      break;
  }

  return compareDealsByPrice(left, right);
}

export function takeLimitedDeals(
  candidates: CampaignPreviewDeal[],
  limit: number,
  maxPerDestination: number = 2,
) {
  const sorted = [...candidates].sort(compareDealsByPrice);
  const items: CampaignPreviewDeal[] = [];
  const destinationCounts = new Map<string, number>();

  for (const deal of sorted) {
    const destinationKey =
      deal.destinationAirport?.trim().toUpperCase() ||
      deal.destinationCity?.trim().toLowerCase() ||
      deal.routeLabel;
    const seenForDestination = destinationCounts.get(destinationKey) ?? 0;

    if (seenForDestination >= maxPerDestination) {
      continue;
    }

    items.push(deal);
    destinationCounts.set(destinationKey, seenForDestination + 1);

    if (items.length >= limit) {
      break;
    }
  }

  return items;
}

export function getDealTheme(deal: CampaignPreviewDeal): ThemeFilter {
  return getThemeForDestinationCity(deal.destinationCity);
}

export function getLandmarkTitle(deal: CampaignPreviewDeal) {
  const cityKey = normalizeDestinationKey(deal.destinationCity);
  return LANDMARK_TITLE_BY_DESTINATION[cityKey] ?? deal.destinationCity;
}

export function getThemeForDestinationCity(
  city: string,
): Exclude<ThemeFilter, "any"> {
  return getDestinationTheme(city);
}

export function getDestinationHeroDescription(
  city: string,
  t: Translate,
  displayCity = city,
) {
  const theme = getThemeForDestinationCity(city);
  return t("deals.cityHeroDesc", {
    city: displayCity,
    escapeLabel: t(`deals.escape.${theme}`),
  });
}

export function isWeekendDeal(deal: CampaignPreviewDeal) {
  return (
    normalizeDestinationKey(deal.routeBucket).includes("weekend") ||
    deal.tripNights <= 4
  );
}

export function isWeeklongDeal(deal: CampaignPreviewDeal) {
  return deal.tripNights >= 5 && deal.tripNights <= 7;
}

export function matchesWhenFilter(
  deal: CampaignPreviewDeal,
  filters: DealSearchFilters,
  now: Date,
) {
  const departure = deal.departureDate ? new Date(deal.departureDate) : null;
  if (!departure || Number.isNaN(departure.getTime())) {
    return filters.whenFilter === "any";
  }

  switch (filters.whenFilter) {
    case "next_30":
    case "this_month":
    case "next_month":
    case "this_year":
    case "next_year": {
      const departureDateKey =
        deal.departureDate?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
      const range = getWhenFilterDateRange(filters.whenFilter, now);
      return Boolean(
        departureDateKey &&
          range &&
          departureDateKey >= range.dateFrom &&
          departureDateKey <= range.dateTo,
      );
    }
    case "school_holidays":
      return Boolean(
        getMatchingLuxSchoolHoliday(deal.departureDate, deal.returnDate),
      );
    case "this_weekend":
      return isTripInCurrentWeekend(deal.departureDate, deal.returnDate, now);
    case "weekends":
      return doesTripIncludeWeekend(deal.departureDate, deal.returnDate);
    case "custom": {
      const departureDateKey =
        deal.departureDate?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
      return Boolean(
        departureDateKey &&
          filters.dateFrom &&
          filters.dateTo &&
          departureDateKey >= filters.dateFrom &&
          departureDateKey <= filters.dateTo,
      );
    }
    case "any":
    default:
      return true;
  }
}

export function matchesTripFilter(
  deal: CampaignPreviewDeal,
  tripFilter: TripFilter,
) {
  switch (tripFilter) {
    case "weekend":
      return isWeekendDeal(deal);
    case "weeklong":
      return isWeeklongDeal(deal);
    case "long_stay":
      return deal.tripNights > 4;
    case "any":
    default:
      return true;
  }
}

export function matchesBudgetFilter(
  deal: CampaignPreviewDeal,
  budgetFilter: BudgetFilter,
) {
  if (budgetFilter === "any") {
    return true;
  }

  return deal.dealPrice <= Number(budgetFilter);
}

export function matchesPriceRange(
  deal: CampaignPreviewDeal,
  filters: DealSearchFilters,
) {
  if (filters.priceMin !== null && deal.dealPrice < filters.priceMin) {
    return false;
  }

  return filters.priceMax === null || deal.dealPrice <= filters.priceMax;
}

export function matchesDurationFilter(
  deal: CampaignPreviewDeal,
  filters: DealSearchFilters,
) {
  const durationFilters = getSelectedDurationFilters(filters);
  if (durationFilters.length === 0) {
    return true;
  }

  return durationFilters.includes(getDurationFilterValue(deal));
}

export function matchesDealSearchFilters(
  deal: CampaignPreviewDeal,
  filters: DealSearchFilters,
  now: Date,
) {
  if (deal.dealPrice <= 0) {
    return false;
  }

  if (!matchesWhenFilter(deal, filters, now)) {
    return false;
  }

  if (!matchesTripFilter(deal, filters.tripFilter)) {
    return false;
  }

  if (!matchesBudgetFilter(deal, filters.budgetFilter)) {
    return false;
  }

  if (!matchesPriceRange(deal, filters)) {
    return false;
  }

  const airlineKeys = getDealAirlineNames(deal).map(normalizeAirlineName);
  if (
    filters.excludedAirlines.some((airline) => airlineKeys.includes(airline))
  ) {
    return false;
  }

  if (!matchesDurationFilter(deal, filters)) {
    return false;
  }

  if (filters.directOnly && deal.maxStops !== "NON_STOP") {
    return false;
  }

  if (
    filters.destinationFilter !== "any" &&
    normalizeDestinationKey(deal.destinationCity) !== filters.destinationFilter
  ) {
    return false;
  }

  const departureWeekdayFilters = getSelectedDepartureWeekdayFilters(filters);
  const departureWeekday = getDepartureWeekdayFilterValue(deal.departureDate);
  if (
    departureWeekdayFilters.length > 0 &&
    (departureWeekday === "any" ||
      !departureWeekdayFilters.includes(departureWeekday))
  ) {
    return false;
  }

  if (
    filters.themeFilter !== "any" &&
    getDealTheme(deal) !== filters.themeFilter
  ) {
    return false;
  }

  return true;
}

export function hasMatchingDealsForFilters(
  deals: CampaignPreviewDeal[],
  filters: DealSearchFilters,
  now: Date,
) {
  return deals.some((deal) => matchesDealSearchFilters(deal, filters, now));
}

export function areDealSearchFiltersEqual(
  left: DealSearchFilters,
  right: DealSearchFilters,
) {
  return (
    left.whenFilter === right.whenFilter &&
    left.tripFilter === right.tripFilter &&
    left.budgetFilter === right.budgetFilter &&
    left.priceMin === right.priceMin &&
    left.priceMax === right.priceMax &&
    left.excludedAirlines.length === right.excludedAirlines.length &&
    left.excludedAirlines.every((airline) =>
      right.excludedAirlines.includes(airline),
    ) &&
    left.directOnly === right.directOnly &&
    left.themeFilter === right.themeFilter &&
    left.destinationFilter === right.destinationFilter &&
    getSelectedDepartureWeekdayFilters(left).length ===
      getSelectedDepartureWeekdayFilters(right).length &&
    getSelectedDepartureWeekdayFilters(left).every((value) =>
      getSelectedDepartureWeekdayFilters(right).includes(value),
    ) &&
    getSelectedDurationFilters(left).length ===
      getSelectedDurationFilters(right).length &&
    getSelectedDurationFilters(left).every((value) =>
      getSelectedDurationFilters(right).includes(value),
    ) &&
    left.dateFrom === right.dateFrom &&
    left.dateTo === right.dateTo
  );
}

export function getChipTitle(chip: QuickChip, t?: Translate) {
  const translate = t ?? ((key: string) => key);
  switch (chip) {
    case "weekend":
      return translate("deals.chip.weekendTrips");
    case "this_weekend":
      return translate("common.thisWeekend");
    case "weeklong":
      return translate("deals.chip.oneWeek");
    case "school_holidays":
      return translate("common.schoolHolidays");
    case "under_50":
      return translate("common.under50");
    case "cheap_direct":
      return translate("deals.chip.cheapDirect");
    case "direct":
      return translate("common.directOnly");
    case "beach":
      return translate("deals.chip.beach");
    case "city":
      return translate("deals.chip.city");
    case "nature":
      return translate("deals.chip.nature");
  }
}

export function getSearchResultsCopy(filters: DealSearchFilters, t: Translate) {
  if (filters.tripFilter === "weekend") {
    return {
      title: t("deals.results.weekendTitle"),
      description: t("deals.results.weekendDesc"),
    };
  }

  if (filters.tripFilter === "weeklong") {
    return {
      title: t("deals.results.weeklongTitle"),
      description: t("deals.results.weeklongDesc"),
    };
  }

  if (filters.whenFilter === "school_holidays") {
    return {
      title: t("deals.results.schoolTitle"),
      description: t("deals.results.schoolDesc"),
    };
  }

  if (filters.themeFilter === "beach") {
    return {
      title: t("deals.results.beachTitle"),
      description: t("deals.results.beachDesc"),
    };
  }

  return {
    title: t("deals.results.defaultTitle"),
    description: t("deals.results.defaultDesc"),
  };
}

export function buildAvailabilityOptions(
  options: readonly SelectOption[],
  deals: CampaignPreviewDeal[],
  filters: DealSearchFilters,
  now: Date,
  getNextFilters: (value: string) => DealSearchFilters,
) {
  return options.map((option) => ({
    ...option,
    disabled: !hasMatchingDealsForFilters(
      deals,
      getNextFilters(option.value),
      now,
    ),
  }));
}

export function buildDestinationOptions(
  deals: CampaignPreviewDeal[],
  filters: DealSearchFilters,
  now: Date,
) {
  const seen = new Set<string>();
  const countryCodeByCity = new Map<string, string>();
  for (const deal of deals) {
    const city = deal.destinationCity?.trim();
    const countryCode = getAirportCountryCode(deal.destinationAirport);
    if (!city || !countryCode) continue;
    const cityKey = normalizeDestinationKey(city);
    if (!countryCodeByCity.has(cityKey))
      countryCodeByCity.set(cityKey, countryCode);
  }
  const cityOptions = deals
    .map((deal) => deal.destinationCity?.trim() ?? "")
    .filter((city) => city.length > 0)
    .sort((left, right) => left.localeCompare(right, "en"))
    .filter((city) => {
      const key = normalizeDestinationKey(city);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .map((city) => {
      const normalizedCity = normalizeDestinationKey(city);
      return {
        value: normalizedCity,
        label: city,
        countryCode: countryCodeByCity.get(normalizedCity),
        disabled: !hasMatchingDealsForFilters(
          deals,
          {
            ...filters,
            destinationFilter: normalizedCity,
          },
          now,
        ),
      };
    });

  return [
    {
      value: "any",
      label: "Any destination",
      disabled: !hasMatchingDealsForFilters(
        deals,
        {
          ...filters,
          destinationFilter: "any",
        },
        now,
      ),
    },
    ...cityOptions,
  ];
}

export function buildDurationOptions(
  deals: CampaignPreviewDeal[],
  filters: DealSearchFilters,
  now: Date,
  t: Translate,
) {
  const filtersWithoutDuration = {
    ...filters,
    durationFilter: "any" as DurationFilter,
    durationFilters: [],
  };
  const selectedDurationFilters = getSelectedDurationFilters(filters);
  const availableValues = new Set(
    deals
      .filter((deal) =>
        matchesDealSearchFilters(deal, filtersWithoutDuration, now),
      )
      .map((deal) => getDurationFilterValue(deal)),
  );

  return DURATION_FILTER_VALUES.map((value) => ({
    value,
    label: t(`deals.duration.${value}`),
    displayLabel: value === "6_plus" ? "6+" : value,
    disabled:
      !selectedDurationFilters.includes(value) && !availableValues.has(value),
  }));
}

export function getActiveQuickChips(filters: DealSearchFilters) {
  return new Set(
    QUICK_CHIP_OPTIONS.filter((chip) => getQuickChipState(chip, filters)),
  );
}

export function groupSearchCityDeals(deals: CampaignPreviewDeal[]) {
  const groups = new Map<string, SearchCityGroup>();

  for (const deal of deals) {
    const city = deal.destinationCity?.trim();
    if (!city) {
      continue;
    }

    const key = city.toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.deals.push(deal);
      existing.lowestPrice = Math.min(existing.lowestPrice, deal.dealPrice);
      continue;
    }

    groups.set(key, {
      key,
      city,
      airport: deal.destinationAirport,
      deals: [deal],
      lowestPrice: deal.dealPrice,
    });
  }

  return [...groups.values()];
}

export function countDealsPerDestination(deals: CampaignPreviewDeal[]) {
  return deals.reduce<Map<string, number>>((map, deal) => {
    const key = `${deal.destinationAirport}-${normalizeDestinationKey(deal.destinationCity)}`;
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map());
}

export function getDestinationCountKey(deal: CampaignPreviewDeal) {
  return `${deal.destinationAirport}-${normalizeDestinationKey(deal.destinationCity)}`;
}

export function buildDestinationDealsHref(
  destinationCity: string,
  locale: Locale,
) {
  return getLocalizedDestinationPath(
    locale,
    toDestinationSlug(destinationCity),
  );
}

export function buildSharedFareHref(deal: CampaignPreviewDeal, locale: Locale) {
  const pathname = buildDestinationDealsHref(deal.destinationCity, locale);
  return `${pathname}?fare=${encodeURIComponent(deal.id)}`;
}

export function applyQuickChip(
  chip: QuickChip,
  filters: DealSearchFilters,
): DealSearchFilters {
  switch (chip) {
    case "this_weekend":
      return {
        ...filters,
        whenFilter: "this_weekend",
        dateFrom: null,
        dateTo: null,
      };
    case "weekend":
      return { ...filters, tripFilter: "weekend" };
    case "weeklong":
      return { ...filters, tripFilter: "weeklong" };
    case "school_holidays":
      return {
        ...filters,
        whenFilter: "school_holidays",
        dateFrom: null,
        dateTo: null,
      };
    case "under_50":
      return { ...filters, budgetFilter: "50", priceMin: null, priceMax: null };
    case "cheap_direct":
      return {
        ...filters,
        budgetFilter: "80",
        priceMin: null,
        priceMax: null,
        directOnly: true,
      };
    case "direct":
      return { ...filters, directOnly: true };
    case "beach":
      return { ...filters, themeFilter: "beach" };
    case "city":
      return { ...filters, themeFilter: "city" };
    case "nature":
      return { ...filters, themeFilter: "nature" };
  }
}

export function isQuickChipAvailable(
  chip: QuickChip,
  filters: DealSearchFilters,
  deals: CampaignPreviewDeal[],
  now: Date,
) {
  if (getQuickChipState(chip, filters)) {
    return true;
  }

  return hasMatchingDealsForFilters(deals, applyQuickChip(chip, filters), now);
}

export function getLowestPrice(deals: CampaignPreviewDeal[]) {
  return deals.length > 0
    ? Math.min(...deals.map((deal) => deal.dealPrice))
    : null;
}
