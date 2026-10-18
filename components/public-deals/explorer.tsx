"use client";

import { usePublicDealsSearch } from "@/components/public-deals/use-public-deals-search";
import Link from "next/link";
import { PublicDealsUrlState } from "@/components/public-deals-url-state";
import {
  parseDealSearchFilters,
  parseDealSearchSort,
} from "@/lib/public-deals-search";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, Plane, X } from "lucide-react";
import { DestinationVisual as LandmarkPhoto } from "@/components/public-destination-visual";
import { LocalizedPageMetadata } from "@/components/localized-page-metadata";
import { NewsletterForm } from "@/components/newsletter-form";
import { MonthlyPriceCard } from "@/components/monthly-price-card";
import type { DealsMapCity } from "@/components/public-deals-map";
import { PublicDealsPriceRange } from "@/components/public-deals-price-range";
import {
  PublicDealsSelect as DealsSelect,
  type PublicDealsSelectOption as SelectOption,
} from "@/components/public-deals-select";
import { PublicDealsDatePicker as DealsDatePicker } from "@/components/public-deals-date-picker";
import { getAirportCountryCode } from "@/lib/airport-countries";
import { toDestinationSlug } from "@/lib/destination-slugs";
import { useI18n } from "@/lib/i18n";
import {
  getLocalizedDealsSearchPath,
  getLocalizedDestinationPath,
  getLocalizedHomePath,
} from "@/lib/locales";
import type { CampaignPreviewDeal } from "@/lib/ops-shared";
import { disableDirectOnlyWhenOnlyConnectingFares } from "@/lib/public-deals-query";
import { getLocalizedDestinationName } from "@/lib/destination-localization";
import {
  buildDealsSearchHref,
  DEFAULT_DEAL_SEARCH_FILTERS,
  getSelectedDepartureWeekdayFilters,
  getSelectedDurationFilters,
  DEFAULT_DEAL_SEARCH_SORT,
  type DealSearchSort,
  type DepartureWeekdayFilter,
  type DepartureWeekdayFilterValue,
  type DurationFilter,
  type DurationFilterValue,
  type DealSearchFilters,
  type WhenFilter,
} from "@/lib/public-deals-search";
import {
  type AirlineFilterOption,
  type MobileResultsPanel,
  type PublicDealsExplorerProps,
  type SearchCityGroup,
} from "@/components/public-deals/types";
import {
  areDealSearchFiltersEqual,
  buildAvailabilityOptions,
  buildDestinationOptions,
  buildDurationOptions,
  compareDealsBySort,
  countDealsPerDestination,
  getDestinationCountKey,
  getDestinationHeroDescription,
  getDestinationPhotoSrc,
  getLandmarkTitle,
  getLowestPrice,
  getSearchResultsCopy,
  groupSearchCityDeals,
  hasMatchingDealsForFilters,
  matchesDealSearchFilters,
  takeLimitedDeals,
} from "@/components/public-deals/filters";
import {
  DEALS_FOOTER_LINKS,
  DEALS_FOOTER_SOCIALS,
  DEAL_SORT_OPTIONS,
  DEAL_SORT_TRANSLATION_KEYS,
  DEFAULT_RESULTS_PAGE_SIZE,
  DEPARTURE_WEEKDAY_OPTIONS,
  DURATION_FILTER_VALUES,
  RESULTS_PAGE_SIZE_OPTIONS,
  WHEN_OPTIONS,
} from "@/components/public-deals/constants";
import {
  formatCurrency,
  formatVerifiedAge,
  getDealAirlineNames,
  normalizeAirlineName,
  normalizeDestinationKey,
} from "@/components/public-deals/formatters";
import {
  AirlineLogo,
  DealsAirlineFilter,
} from "@/components/public-deals/airlines";
import {
  FooterSealHeartIcon,
  LuxembourgSealIcon,
} from "@/components/public-deals/icons";
import {
  ResultsLoadMore,
  SearchResultCard,
} from "@/components/public-deals/fare-cards";
import { FeaturedOpportunityModal } from "@/components/public-deals/opportunity-modal";

export const PublicDealsMap = dynamic(
  () =>
    import("@/components/public-deals-map").then(
      (module) => module.PublicDealsMap,
    ),
  { ssr: false },
);

export function PublicDealsExplorer({
  data,
  destinationCatalog,
  destinationPhotoUrls,
  initialFilters = DEFAULT_DEAL_SEARCH_FILTERS,
  initialSearchResult,
  initialSharedFareId = null,
  initialSort = DEFAULT_DEAL_SEARCH_SORT,
  mode,
  lockedDestinationCity,
  searchPathname = "/deals/search",
}: PublicDealsExplorerProps) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const lockedDestinationFilter = useMemo(
    () =>
      lockedDestinationCity
        ? normalizeDestinationKey(lockedDestinationCity)
        : null,
    [lockedDestinationCity],
  );
  const coerceFiltersForMode = useCallback(
    (filters: DealSearchFilters): DealSearchFilters => {
      if (!lockedDestinationFilter) {
        return filters;
      }

      if (filters.destinationFilter === lockedDestinationFilter) {
        return filters;
      }

      return {
        ...filters,
        destinationFilter: lockedDestinationFilter,
      };
    },
    [lockedDestinationFilter],
  );
  const appliedFilters = useMemo(
    () => coerceFiltersForMode(initialFilters),
    [coerceFiltersForMode, initialFilters],
  );
  const [draftFilters, setDraftFilters] = useState<DealSearchFilters>({
    ...appliedFilters,
  });
  const [mobileFilterBaseline, setMobileFilterBaseline] =
    useState<DealSearchFilters>({
      ...appliedFilters,
    });
  const [sortOrder, setSortOrder] = useState<DealSearchSort>(initialSort);
  const [selectedOpportunityDealId, setSelectedOpportunityDealId] = useState<
    string | null
  >(null);
  const [selectedOpportunityDeals, setSelectedOpportunityDeals] = useState<
    CampaignPreviewDeal[]
  >([]);
  const [resultsPage, setResultsPage] = useState(1);
  const [resultsPageSize, setResultsPageSize] = useState<number>(
    DEFAULT_RESULTS_PAGE_SIZE,
  );
  const [mobileResultsPanel, setMobileResultsPanel] =
    useState<MobileResultsPanel>(null);
  const fullSidebarRef = useRef<HTMLElement | null>(null);
  const compactSidebarFrameRef = useRef<number | null>(null);
  const mobileResultsPanelRef = useRef<HTMLDivElement | null>(null);
  const mobileResultsReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const compactSidebarRef = useRef<HTMLDivElement | null>(null);
  const resultsBoundaryRef = useRef<HTMLElement | null>(null);
  const mobileResultsPanelTitleId = useId();
  const desktopFiltersTitleId = useId();
  const hasOpenedSharedFareRef = useRef(false);
  const [sharedFareId, setSharedFareId] = useState(initialSharedFareId);
  const [urlReadyPath, setUrlReadyPath] = useState<string | null>(null);
  const [showCompactSidebar, setShowCompactSidebar] = useState(false);
  const [compactSidebarPosition, setCompactSidebarPosition] = useState<{
    left: number;
    top: number;
    width: number;
    placement: "fixed" | "absolute";
  } | null>(null);
  const now = useMemo(() => new Date(), []);
  const effectiveFilters =
    mode === "results" || mode === "city"
      ? mobileResultsPanel === "filters"
        ? mobileFilterBaseline
        : coerceFiltersForMode(draftFilters)
      : appliedFilters;
  const serverSearchFilters = useMemo(
    () => coerceFiltersForMode(draftFilters),
    [coerceFiltersForMode, draftFilters],
  );
  const {
    result: serverSearchResult,
    pending: isServerSearchPending,
    error: serverSearchError,
    retry: retryServerSearch,
  } = usePublicDealsSearch({
    enabled: mode === "results",
    filters: serverSearchFilters,
    sort: sortOrder,
    requestedCount: resultsPage * resultsPageSize,
    initialResult: initialSearchResult,
  });
  const sourceDeals =
    mode === "results" && serverSearchResult
      ? serverSearchResult.deals
      : data.deals;

  useEffect(() => {
    if (mode !== "city" || !draftFilters.directOnly) return;

    const filtersWithFallback = disableDirectOnlyWhenOnlyConnectingFares(
      sourceDeals,
      coerceFiltersForMode(draftFilters),
      now,
    );
    if (filtersWithFallback.directOnly) return;

    setDraftFilters((current) =>
      current.directOnly ? { ...current, directOnly: false } : current,
    );
  }, [coerceFiltersForMode, draftFilters, mode, now, sourceDeals]);

  const buildDealsHrefForMode = useCallback(
    (filters: DealSearchFilters) => {
      const coercedFilters = coerceFiltersForMode(filters);
      const hrefFilters =
        mode === "city" && lockedDestinationFilter
          ? { ...coercedFilters, destinationFilter: "any" }
          : coercedFilters;

      return buildDealsSearchHref(hrefFilters, searchPathname, sortOrder);
    },
    [
      coerceFiltersForMode,
      lockedDestinationFilter,
      mode,
      searchPathname,
      sortOrder,
    ],
  );

  const applyUrlQuery = useCallback(
    (query: string) => {
      const params = new URLSearchParams(query);
      const filters = coerceFiltersForMode(parseDealSearchFilters(params));
      setDraftFilters(filters);
      setMobileFilterBaseline(filters);
      setSortOrder(parseDealSearchSort(params));
      setSharedFareId(params.get("fare"));
      setUrlReadyPath(searchPathname);
      hasOpenedSharedFareRef.current = false;
      setResultsPage(1);
    },
    [coerceFiltersForMode, searchPathname],
  );

  useEffect(() => {
    if (urlReadyPath !== searchPathname) return;
    if (mode !== "results" && mode !== "city") {
      return;
    }

    const nextUrl = new URL(
      buildDealsHrefForMode(effectiveFilters),
      window.location.origin,
    );
    if (sharedFareId) nextUrl.searchParams.set("fare", sharedFareId);
    const nextHref = `${nextUrl.pathname}${nextUrl.search}`;
    const currentHref = `${window.location.pathname}${window.location.search}`;

    if (currentHref !== nextHref) {
      window.history.replaceState(null, "", nextHref);
    }
  }, [
    buildDealsHrefForMode,
    effectiveFilters,
    mode,
    searchPathname,
    sharedFareId,
    urlReadyPath,
  ]);


  useEffect(() => {
    if (mode !== "results" && mode !== "city") {
      return;
    }

    const syncCompactSidebar = () => {
      compactSidebarFrameRef.current = null;
      const sidebar = fullSidebarRef.current;
      const boundary = resultsBoundaryRef.current;

      if (!sidebar || !boundary || window.innerWidth <= 980) {
        setShowCompactSidebar(false);
        return;
      }

      const bounds = sidebar.getBoundingClientRect();
      const boundaryBounds = boundary.getBoundingClientRect();
      const headerClearance = 92;
      const boundaryClearance = 24;
      const compactHeight =
        compactSidebarRef.current?.getBoundingClientRect().height ?? 0;
      const stoppedViewportTop =
        boundaryBounds.bottom - compactHeight - boundaryClearance;
      const placement: "fixed" | "absolute" =
        compactHeight > 0 && stoppedViewportTop < headerClearance
          ? "absolute"
          : "fixed";
      const nextPosition = {
        left: Math.round(
          bounds.left + (placement === "absolute" ? window.scrollX : 0),
        ),
        top:
          placement === "absolute"
            ? Math.round(window.scrollY + stoppedViewportTop)
            : headerClearance,
        width: Math.round(bounds.width),
        placement,
      };

      setCompactSidebarPosition((current) =>
        current?.left === nextPosition.left &&
        current.top === nextPosition.top &&
        current.width === nextPosition.width &&
        current.placement === nextPosition.placement
          ? current
          : nextPosition,
      );
      setShowCompactSidebar(
        bounds.bottom <= headerClearance && boundaryBounds.bottom > 0,
      );
    };

    const scheduleCompactSidebarSync = () => {
      if (compactSidebarFrameRef.current !== null) {
        return;
      }

      compactSidebarFrameRef.current =
        window.requestAnimationFrame(syncCompactSidebar);
    };

    syncCompactSidebar();
    window.addEventListener("scroll", scheduleCompactSidebarSync, {
      passive: true,
    });
    window.addEventListener("resize", scheduleCompactSidebarSync);
    const resizeObserver = new ResizeObserver(scheduleCompactSidebarSync);
    const observedSidebar = fullSidebarRef.current;
    const observedBoundary = resultsBoundaryRef.current;
    if (observedSidebar) {
      resizeObserver.observe(observedSidebar);
    }
    if (observedBoundary) {
      resizeObserver.observe(observedBoundary);
    }
    if (compactSidebarRef.current) {
      resizeObserver.observe(compactSidebarRef.current);
    }

    return () => {
      window.removeEventListener("scroll", scheduleCompactSidebarSync);
      window.removeEventListener("resize", scheduleCompactSidebarSync);
      resizeObserver.disconnect();
      if (compactSidebarFrameRef.current !== null) {
        window.cancelAnimationFrame(compactSidebarFrameRef.current);
        compactSidebarFrameRef.current = null;
      }
    };
  }, [mode, showCompactSidebar]);

  useEffect(() => {
    if (!mobileResultsPanel) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => mobileResultsPanelRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (mobileResultsPanel === "filters") {
          setDraftFilters({ ...mobileFilterBaseline });
        }
        setMobileResultsPanel(null);
        window.requestAnimationFrame(() =>
          mobileResultsReturnFocusRef.current?.focus(),
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileFilterBaseline, mobileResultsPanel]);

  const filterFacetDeals = useMemo(() => {
    const facetFilters = coerceFiltersForMode({
      ...draftFilters,
      budgetFilter: "any",
      priceMin: null,
      priceMax: null,
      excludedAirlines: [],
    });
    return sourceDeals.filter((deal) =>
      matchesDealSearchFilters(deal, facetFilters, now),
    );
  }, [coerceFiltersForMode, draftFilters, now, sourceDeals]);
  const priceHistogramValues = useMemo(() => {
    if (mode === "results" && serverSearchResult) {
      return serverSearchResult.facets.prices;
    }
    return filterFacetDeals
      .map((deal) => deal.dealPrice)
      .filter((price) => Number.isFinite(price) && price > 0);
  }, [filterFacetDeals, mode, serverSearchResult]);
  const priceBounds = useMemo(() => {
    const fallbackPrices = sourceDeals
      .map((deal) => deal.dealPrice)
      .filter((price) => Number.isFinite(price) && price > 0);
    const source =
      priceHistogramValues.length > 0 ? priceHistogramValues : fallbackPrices;
    return {
      min: source.length > 0 ? Math.floor(Math.min(...source)) : 0,
      max: source.length > 0 ? Math.ceil(Math.max(...source)) : 1,
    };
  }, [priceHistogramValues, sourceDeals]);
  const shouldShowPriceRangeFilter =
    mode !== "city" || priceBounds.min < priceBounds.max;
  const airlineOptions = useMemo<AirlineFilterOption[]>(() => {
    if (mode === "results" && serverSearchResult) {
      return serverSearchResult.facets.airlines;
    }
    const labelsByKey = new Map<string, string>();
    filterFacetDeals.forEach((deal) => {
      getDealAirlineNames(deal).forEach((label) => {
        const key = normalizeAirlineName(label);
        if (key && !labelsByKey.has(key)) {
          labelsByKey.set(key, label);
        }
      });
    });
    return [...labelsByKey]
      .map(([key, label]) => ({ key, label }))
      .sort((left, right) => left.label.localeCompare(right.label, locale));
  }, [filterFacetDeals, locale, mode, serverSearchResult]);
  const shouldShowAirlineFilter = mode !== "city" || airlineOptions.length > 1;
  const legacyPriceMaximum =
    draftFilters.budgetFilter === "any"
      ? null
      : Number(draftFilters.budgetFilter);
  const updatePriceRange = useCallback(
    (priceMin: number | null, priceMax: number | null) => {
      setDraftFilters((current) => ({
        ...current,
        budgetFilter: "any",
        priceMin,
        priceMax,
      }));
    },
    [],
  );

  const filteredDeals = useMemo(() => {
    if (mode === "results") return sourceDeals;
    const nextDeals = sourceDeals.filter((deal) =>
      matchesDealSearchFilters(deal, effectiveFilters, now),
    );

    return [...nextDeals].sort((left, right) =>
      compareDealsBySort(left, right, sortOrder, now),
    );
  }, [effectiveFilters, mode, now, sortOrder, sourceDeals]);
  const draftFilteredDealsCount = useMemo(() => {
    if (mode === "results" && serverSearchResult)
      return serverSearchResult.total;
    const filters = coerceFiltersForMode(draftFilters);
    return sourceDeals.reduce(
      (count, deal) =>
        count + (matchesDealSearchFilters(deal, filters, now) ? 1 : 0),
      0,
    );
  }, [
    coerceFiltersForMode,
    draftFilters,
    mode,
    now,
    serverSearchResult,
    sourceDeals,
  ]);

  const featuredNow = useMemo(
    () => takeLimitedDeals(filteredDeals, 12, 1),
    [filteredDeals],
  );
  const opportunityDeals =
    mode === "results" || mode === "city" ? filteredDeals : featuredNow;
  const searchResultsCopy = useMemo(
    () => getSearchResultsCopy(effectiveFilters, t),
    [effectiveFilters, t],
  );
  const destinationCounts = useMemo(() => {
    if (mode === "results" && serverSearchResult) {
      return new Map(Object.entries(serverSearchResult.destinationCounts));
    }
    return countDealsPerDestination(filteredDeals);
  }, [filteredDeals, mode, serverSearchResult]);
  const groupedOpportunityDeals = useMemo<SearchCityGroup[]>(() => {
    if (mode !== "results" && mode !== "city") {
      return [];
    }

    return groupSearchCityDeals(filteredDeals);
  }, [filteredDeals, mode]);
  const mapCities = useMemo<DealsMapCity[]>(
    () =>
      mode === "results" && serverSearchResult
        ? serverSearchResult.mapCities
        : groupedOpportunityDeals,
    [groupedOpportunityDeals, mode, serverSearchResult],
  );
  const showResultsMap =
    mode !== "results" || effectiveFilters.destinationFilter === "any";
  const [openSearchCityGroups, setOpenSearchCityGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const previousEffectiveFiltersRef = useRef<DealSearchFilters | null>(null);
  const selectedSearchGroup =
    mode === "city"
      ? (groupedOpportunityDeals[0] ?? null)
      : mode === "results"
        ? (groupedOpportunityDeals.find((group) =>
            openSearchCityGroups.has(group.key),
          ) ?? null)
        : null;
  const resultsSourceDeals = selectedSearchGroup?.deals ?? opportunityDeals;
  const resultsTotal =
    mode === "results" && serverSearchResult
      ? serverSearchResult.total
      : resultsSourceDeals.length;
  const availableResultsPageSizes = RESULTS_PAGE_SIZE_OPTIONS.filter(
    (option, index) => index === 0 || option <= resultsTotal,
  );
  const effectiveResultsPageSize = availableResultsPageSizes.includes(
    resultsPageSize as (typeof RESULTS_PAGE_SIZE_OPTIONS)[number],
  )
    ? resultsPageSize
    : (availableResultsPageSizes.at(-1) ?? DEFAULT_RESULTS_PAGE_SIZE);
  const resultsPageCount = Math.max(
    1,
    Math.ceil(resultsTotal / effectiveResultsPageSize),
  );
  const clampedResultsPage = Math.min(resultsPage, resultsPageCount);
  const visibleResultsCount =
    mode === "results"
      ? resultsSourceDeals.length
      : Math.min(resultsTotal, clampedResultsPage * effectiveResultsPageSize);
  const paginatedResultDeals =
    mode === "results"
      ? resultsSourceDeals
      : resultsSourceDeals.slice(0, visibleResultsCount);
  const selectedOpportunityDeal =
    selectedOpportunityDeals.find(
      (deal) => deal.id === selectedOpportunityDealId,
    ) ?? null;
  const selectedOpportunityDealIndex = selectedOpportunityDealId
    ? selectedOpportunityDeals.findIndex(
        (deal) => deal.id === selectedOpportunityDealId,
      )
    : -1;

  useEffect(() => {
    if (mode !== "results") {
      return;
    }

    const previousFilters = previousEffectiveFiltersRef.current;
    previousEffectiveFiltersRef.current = effectiveFilters;

    if (
      previousFilters === null ||
      areDealSearchFiltersEqual(previousFilters, effectiveFilters)
    ) {
      return;
    }

    setOpenSearchCityGroups((current) =>
      current.size === 0 ? current : new Set(),
    );
  }, [effectiveFilters, mode]);

  useEffect(() => {
    if (mode !== "results") {
      previousEffectiveFiltersRef.current = null;
      return;
    }

    const validKeys = new Set(
      groupedOpportunityDeals.map((group) => group.key),
    );
    setOpenSearchCityGroups((current) => {
      const next = new Set([...current].filter((key) => validKeys.has(key)));
      if (
        next.size === current.size &&
        [...next].every((key) => current.has(key))
      ) {
        return current;
      }
      return next;
    });
  }, [groupedOpportunityDeals, mode]);

  useEffect(() => {
    if (mode !== "results" && mode !== "city") {
      return;
    }

    setResultsPage(1);
  }, [effectiveFilters, mode, selectedSearchGroup?.key, sortOrder]);

  useEffect(() => {
    setResultsPage((current) => Math.min(current, resultsPageCount));
  }, [resultsPageCount]);

  useEffect(() => {
    if (mode !== "results") {
      return;
    }

    if (groupedOpportunityDeals.length !== 1) {
      return;
    }

    const onlyGroupKey = groupedOpportunityDeals[0]?.key;
    if (!onlyGroupKey) {
      return;
    }

    setOpenSearchCityGroups((current) => {
      if (current.size === 1 && current.has(onlyGroupKey)) {
        return current;
      }

      return new Set([onlyGroupKey]);
    });
  }, [groupedOpportunityDeals, mode]);

  const destinationOptions = useMemo<SelectOption[]>(() => {
    if (destinationCatalog) {
      return [
        {
          value: "any",
          label: t("common.anyDestination"),
        },
        ...destinationCatalog.options,
      ].map((option) =>
        option.value === "any"
          ? option
          : {
              ...option,
              label: getLocalizedDestinationName(option.label, locale),
            },
      );
    }

    if (mode === "results" && serverSearchResult) {
      return [
        { value: "any", label: t("common.anyDestination") },
        ...serverSearchResult.facets.destinations.map((destination) => ({
          value: destination.value,
          label: getLocalizedDestinationName(destination.label, locale),
          countryCode: getAirportCountryCode(destination.airport),
          disabled: destination.disabled,
        })),
      ];
    }

    return buildDestinationOptions(sourceDeals, draftFilters, now).map(
      (option) =>
        option.value === "any"
          ? { ...option, label: t("common.anyDestination") }
          : {
              ...option,
              label: getLocalizedDestinationName(option.label, locale),
            },
    );
  }, [
    destinationCatalog,
    draftFilters,
    locale,
    mode,
    now,
    serverSearchResult,
    sourceDeals,
    t,
  ]);
  const popularDestinationValues = useMemo(() => {
    if (destinationCatalog) {
      return destinationCatalog.popularOptionValues;
    }

    if (mode === "results" && serverSearchResult) {
      return serverSearchResult.facets.popularDestinationValues;
    }

    const destinationCounts = new Map<string, number>();
    for (const deal of sourceDeals) {
      const city = deal.destinationCity?.trim();
      if (!city) continue;
      const key = normalizeDestinationKey(city);
      destinationCounts.set(key, (destinationCounts.get(key) ?? 0) + 1);
    }

    return [...destinationCounts.entries()]
      .sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
      )
      .slice(0, 6)
      .map(([destination]) => destination);
  }, [destinationCatalog, mode, serverSearchResult, sourceDeals]);
  const departureWeekdayOptions = useMemo<SelectOption[]>(() => {
    if (mode === "results" && serverSearchResult) {
      return serverSearchResult.facets.departureWeekdays.map((value) => ({
        value,
        label: t(`deals.weekday.${value}`),
      }));
    }
    return buildAvailabilityOptions(
      DEPARTURE_WEEKDAY_OPTIONS,
      sourceDeals,
      draftFilters,
      now,
      (value) => ({
        ...draftFilters,
        departureWeekdayFilter: value as DepartureWeekdayFilter,
        departureWeekdayFilters:
          value === "any" ? [] : [value as DepartureWeekdayFilterValue],
      }),
    )
      .map((option) => ({
        ...option,
        label: t(`deals.weekday.${option.value}`),
      }))
      .filter((option) => option.value === "any" || !option.disabled);
  }, [draftFilters, mode, now, serverSearchResult, sourceDeals, t]);
  const resultsWhenOptions = useMemo<SelectOption[]>(() => {
    if (mode === "results" && serverSearchResult) {
      return serverSearchResult.facets.whenValues.map((value) => ({
        value,
        label: t(`deals.when.${value}`),
      }));
    }
    return buildAvailabilityOptions(
      WHEN_OPTIONS,
      sourceDeals,
      draftFilters,
      now,
      (value) => ({
        ...draftFilters,
        whenFilter: value as WhenFilter,
        dateFrom: null,
        dateTo: null,
      }),
    ).map((option) => ({ ...option, label: t(`deals.when.${option.value}`) }));
  }, [draftFilters, mode, now, serverSearchResult, sourceDeals, t]);
  const resultsDurationOptions = useMemo<SelectOption[]>(() => {
    if (mode !== "results" || !serverSearchResult) {
      return buildDurationOptions(sourceDeals, draftFilters, now, t);
    }

    const availableDurations = new Set(
      serverSearchResult.facets.durationValues,
    );
    const selectedDurationFilters = getSelectedDurationFilters(draftFilters);
    return DURATION_FILTER_VALUES.map((value) => ({
      value,
      label: t(`deals.duration.${value}`),
      displayLabel: value === "6_plus" ? "6+" : value,
      disabled:
        !selectedDurationFilters.includes(value) &&
        !availableDurations.has(value),
    }));
  }, [draftFilters, mode, now, serverSearchResult, sourceDeals, t]);
  const dealSortOptions = useMemo<SelectOption[]>(
    () =>
      DEAL_SORT_OPTIONS.map((option) => ({
        ...option,
        label: t(DEAL_SORT_TRANSLATION_KEYS[option.value as DealSearchSort]),
      })),
    [t],
  );
  const directOnlyOptionAvailable = useMemo(() => {
    if (mode === "results" && serverSearchResult) {
      return serverSearchResult.facets.directOnlyAvailable;
    }
    return (
      draftFilters.directOnly ||
      hasMatchingDealsForFilters(
        sourceDeals,
        {
          ...draftFilters,
          directOnly: true,
        },
        now,
      )
    );
  }, [draftFilters, mode, now, serverSearchResult, sourceDeals]);
  const shouldShowDirectOnlyOption = useMemo(() => {
    if (mode === "results" && serverSearchResult) {
      return serverSearchResult.facets.connectingFlightsAvailable;
    }

    const filtersWithoutDirectOnly = {
      ...draftFilters,
      directOnly: false,
    };
    return sourceDeals.some(
      (deal) =>
        deal.maxStops !== "NON_STOP" &&
        matchesDealSearchFilters(deal, filtersWithoutDirectOnly, now),
    );
  }, [draftFilters, mode, now, serverSearchResult, sourceDeals]);

  useEffect(() => {
    const availableDurationValues = new Set(
      resultsDurationOptions
        .filter((option) => !option.disabled)
        .map((option) => option.value),
    );
    const selectedDurationFilters = getSelectedDurationFilters(draftFilters);
    const nextDurationFilters = selectedDurationFilters.filter((value) =>
      availableDurationValues.has(value),
    );
    if (nextDurationFilters.length === selectedDurationFilters.length) return;

    setDraftFilters((current) => ({
      ...current,
      durationFilter:
        nextDurationFilters.length === 1 ? nextDurationFilters[0] : "any",
      durationFilters: nextDurationFilters,
    }));
  }, [draftFilters, resultsDurationOptions]);

  const selectMobileDestination = useCallback(
    (nextValue: string) => {
      if (mode !== "city") {
        setDraftFilters((current) => ({
          ...current,
          destinationFilter: nextValue,
        }));
        return;
      }

      if (nextValue === lockedDestinationFilter) {
        return;
      }

      const selectedDestination = destinationOptions.find(
        (option) => option.value === nextValue,
      );
      const pathname =
        nextValue === "any" || !selectedDestination
          ? getLocalizedDealsSearchPath(locale)
          : getLocalizedDestinationPath(
              locale,
              toDestinationSlug(selectedDestination.label),
            );
      const nextFilters = {
        ...draftFilters,
        destinationFilter: "any",
      };

      router.push(buildDealsSearchHref(nextFilters, pathname, sortOrder));
    },
    [
      destinationOptions,
      draftFilters,
      locale,
      lockedDestinationFilter,
      mode,
      router,
      sortOrder,
    ],
  );

  const openMobileResultsPanel = useCallback(
    (panel: Exclude<MobileResultsPanel, null>, trigger: HTMLButtonElement) => {
      if (panel === "filters") {
        setMobileFilterBaseline(coerceFiltersForMode({ ...draftFilters }));
      }
      mobileResultsReturnFocusRef.current = trigger;
      setMobileResultsPanel(panel);
    },
    [coerceFiltersForMode, draftFilters],
  );
  const closeMobileResultsPanel = useCallback(() => {
    if (mobileResultsPanel === "filters") {
      setDraftFilters({ ...mobileFilterBaseline });
    }
    setMobileResultsPanel(null);
    window.requestAnimationFrame(() =>
      mobileResultsReturnFocusRef.current?.focus(),
    );
  }, [mobileFilterBaseline, mobileResultsPanel]);
  const applyMobileResultsFilters = useCallback(() => {
    setMobileResultsPanel(null);
    window.requestAnimationFrame(() =>
      mobileResultsReturnFocusRef.current?.focus(),
    );
  }, []);
  const resetMobileResults = useCallback(() => {
    if (mobileResultsPanel === "sort") {
      setSortOrder(DEFAULT_DEAL_SEARCH_SORT);
      return;
    }

    setDraftFilters((current) =>
      coerceFiltersForMode({
        ...current,
        budgetFilter: DEFAULT_DEAL_SEARCH_FILTERS.budgetFilter,
        priceMin: DEFAULT_DEAL_SEARCH_FILTERS.priceMin,
        priceMax: DEFAULT_DEAL_SEARCH_FILTERS.priceMax,
        excludedAirlines: DEFAULT_DEAL_SEARCH_FILTERS.excludedAirlines,
        directOnly: DEFAULT_DEAL_SEARCH_FILTERS.directOnly,
        themeFilter: DEFAULT_DEAL_SEARCH_FILTERS.themeFilter,
        departureWeekdayFilter:
          DEFAULT_DEAL_SEARCH_FILTERS.departureWeekdayFilter,
        departureWeekdayFilters:
          DEFAULT_DEAL_SEARCH_FILTERS.departureWeekdayFilters,
        tripFilter: DEFAULT_DEAL_SEARCH_FILTERS.tripFilter,
        durationFilter: current.durationFilter,
        durationFilters: current.durationFilters,
      }),
    );
  }, [coerceFiltersForMode, mobileResultsPanel]);
  const cityHeroDeal = mode === "city" ? (filteredDeals[0] ?? null) : null;
  const cityLowestPrice =
    mode === "city" ? getLowestPrice(filteredDeals) : null;
  const rawCityHeroTitle =
    lockedDestinationCity ??
    selectedSearchGroup?.city ??
    t("common.destination");
  const cityHeroTitle = getLocalizedDestinationName(rawCityHeroTitle, locale);
  const cityHeroTitleLongestWord = Math.max(
    0,
    ...cityHeroTitle.split(/\s+/).map((word) => word.length),
  );
  const cityHeroTitleLengthClass =
    cityHeroTitleLongestWord >= 12
      ? " deals-city-page__hero-title--extra-long"
      : cityHeroTitleLongestWord >= 9 || cityHeroTitle.length >= 18
        ? " deals-city-page__hero-title--long"
        : "";
  const breadcrumbCurrentLabel =
    mode === "city"
      ? (lockedDestinationCity ??
        selectedSearchGroup?.city ??
        t("common.destination"))
      : t("deals.searchResults");

  const openOpportunityModal = useCallback(
    (deals: CampaignPreviewDeal[], dealId: string) => {
      setSelectedOpportunityDeals(deals);
      setSelectedOpportunityDealId(dealId);
    },
    [],
  );

  useEffect(() => {
    if (!sharedFareId || hasOpenedSharedFareRef.current) {
      return;
    }

    const sharedDeal = sourceDeals.find((deal) => deal.id === sharedFareId);
    if (!sharedDeal) {
      return;
    }

    hasOpenedSharedFareRef.current = true;
    openOpportunityModal(sourceDeals, sharedDeal.id);
  }, [sharedFareId, openOpportunityModal, sourceDeals]);

  const closeOpportunityModal = useCallback(() => {
    setSelectedOpportunityDealId(null);
    setSelectedOpportunityDeals([]);
  }, []);

  const renderMobileResultsControls = () => (
    <>
      <section
        aria-label={t("deals.mobile.summaryLabel")}
        className="deals-mobile-results-controls"
      >
        <div className="deals-mobile-search-summary">
          <div className="deals-mobile-search-summary__route">
            <div className="deals-mobile-search-origin">
              <span>{t("common.from")}</span>
              <strong>LUX</strong>
            </div>
            <span className="deals-mobile-search-plane" aria-hidden="true">
              <Plane fill="currentColor" size={22} strokeWidth={1.25} />
            </span>
            <DealsSelect
              className="deals-mobile-search-control deals-mobile-search-control--destination is-destination-selected"
              label={t("common.to")}
              mobileDestinationSheet
              mobileValueLabel={
                draftFilters.destinationFilter === "any"
                  ? t("deals.mobile.everywhere")
                  : undefined
              }
              onChange={selectMobileDestination}
              options={destinationOptions}
              popularOptionValues={popularDestinationValues}
              value={draftFilters.destinationFilter}
            />
          </div>
          <div className="deals-mobile-search-summary__details">
            <DealsDatePicker
              className="deals-mobile-search-control deals-mobile-search-control--when"
              dateFrom={draftFilters.dateFrom}
              dateTo={draftFilters.dateTo}
              label={t("common.when")}
              onChange={(selection) =>
                setDraftFilters((current) => ({ ...current, ...selection }))
              }
              popoverClassName="deals-date-picker__popover--home"
              presetOptions={resultsWhenOptions}
              value={draftFilters.whenFilter}
            />
            <DealsSelect
              className="deals-mobile-search-control deals-mobile-search-control--duration"
              label={t("deals.duration.any")}
              clearValue="any"
              columns={3}
              mobileSheetTitle={t("deals.duration.sheetTitle")}
              onChange={(nextValue) =>
                setDraftFilters((current) => ({
                  ...current,
                  durationFilter: nextValue as DurationFilter,
                  durationFilters:
                    nextValue === "any"
                      ? []
                      : [nextValue as DurationFilterValue],
                  tripFilter: "any",
                }))
              }
              options={resultsDurationOptions}
              value={draftFilters.durationFilter}
            />
          </div>
        </div>

        <div className="deals-mobile-results-bar">
          <button
            className="deals-mobile-results-bar__action"
            onClick={(event) =>
              openMobileResultsPanel("sort", event.currentTarget)
            }
            type="button"
          >
            <span>{t("deals.mobile.sort")}</span>
          </button>
          <button
            className="deals-mobile-results-bar__action"
            onClick={(event) =>
              openMobileResultsPanel("filters", event.currentTarget)
            }
            type="button"
          >
            <span>{t("deals.mobile.otherFilters")}</span>
          </button>
          <PublicDealsMap
            cities={mapCities}
            locale={locale}
            presentation="toolbar"
          />
        </div>
        <p className="deals-mobile-results-count">
          {resultsTotal === 1
            ? t("deals.mobile.resultFound")
            : t("deals.mobile.resultsFound", { count: resultsTotal })}
        </p>
      </section>

      {mobileResultsPanel
        ? createPortal(
            <div
              className={`deals-redesign deals-mobile-results-sheet${mobileResultsPanel === "filters" ? " deals-filter-sheet" : ""}`}
              onMouseDown={closeMobileResultsPanel}
            >
              <div
                aria-labelledby={mobileResultsPanelTitleId}
                aria-modal="true"
                className="deals-mobile-results-sheet__dialog"
                onMouseDown={(event) => event.stopPropagation()}
                ref={mobileResultsPanelRef}
                role="dialog"
                tabIndex={-1}
              >
                <header className="deals-mobile-results-sheet__header">
                  <button
                    className="deals-mobile-results-sheet__reset"
                    onClick={resetMobileResults}
                    type="button"
                  >
                    {t("deals.mobile.reset")}
                  </button>
                  <h2 id={mobileResultsPanelTitleId}>
                    {mobileResultsPanel === "sort"
                      ? t("deals.mobile.sort")
                      : t("deals.mobile.filters")}
                  </h2>
                  <button
                    aria-label={t("deals.mobile.close")}
                    className="deals-mobile-results-sheet__close"
                    onClick={closeMobileResultsPanel}
                    type="button"
                  >
                    <X aria-hidden="true" />
                  </button>
                </header>

                <div className="deals-mobile-results-sheet__body">
                  {mobileResultsPanel === "sort" ? (
                    <fieldset className="deals-mobile-sort-options">
                      <legend>{t("deals.mobile.sortBy")}</legend>
                      {dealSortOptions.map((option) => (
                        <label key={option.value}>
                          <input
                            checked={sortOrder === option.value}
                            name="mobile-deals-sort"
                            onChange={() =>
                              setSortOrder(option.value as DealSearchSort)
                            }
                            type="radio"
                            value={option.value}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <div className="deals-mobile-filter-groups">
                      {shouldShowDirectOnlyOption ? (
                        <section className="deals-filter-sheet__direct">
                          <div>
                            <h3 id={`${mobileResultsPanelTitleId}-direct`}>
                              {t("common.directOnly")}
                            </h3>
                            <p>{t("deals.filters.directHelp")}</p>
                          </div>
                          <input
                            aria-labelledby={`${mobileResultsPanelTitleId}-direct`}
                            checked={draftFilters.directOnly}
                            className="deals-filter-sheet__switch"
                            onChange={(event) =>
                              setDraftFilters((current) => ({
                                ...current,
                                directOnly: event.target.checked,
                              }))
                            }
                            role="switch"
                            type="checkbox"
                          />
                        </section>
                      ) : null}
                      <section>
                        <div>
                          <h3 id={`${mobileResultsPanelTitleId}-day`}>
                            {t("deals.departureDay")}
                          </h3>
                          <p>{t("deals.filters.dayHelp")}</p>
                        </div>
                        <div
                          className="deals-filter-sheet__days"
                          role="group"
                          aria-labelledby={`${mobileResultsPanelTitleId}-day`}
                        >
                          {DEPARTURE_WEEKDAY_OPTIONS.map((option, index) => {
                            const selectedWeekdays =
                              getSelectedDepartureWeekdayFilters(draftFilters);
                            const selected =
                              option.value === "any"
                                ? selectedWeekdays.length === 0
                                : selectedWeekdays.includes(
                                    option.value as DepartureWeekdayFilterValue,
                                  );
                            const available =
                              option.value === "any" ||
                              departureWeekdayOptions.some(
                                (item) =>
                                  item.value === option.value && !item.disabled,
                              );
                            return (
                              <button
                                aria-label={t(`deals.weekday.${option.value}`)}
                                aria-pressed={selected}
                                disabled={!available && !selected}
                                key={option.value}
                                onClick={() =>
                                  setDraftFilters((current) => {
                                    if (option.value === "any") {
                                      return {
                                        ...current,
                                        departureWeekdayFilter: "any",
                                        departureWeekdayFilters: [],
                                      };
                                    }

                                    const value =
                                      option.value as DepartureWeekdayFilterValue;
                                    const selectedValues =
                                      getSelectedDepartureWeekdayFilters(
                                        current,
                                      );
                                    const nextValues = selectedValues.includes(
                                      value,
                                    )
                                      ? selectedValues.filter(
                                          (item) => item !== value,
                                        )
                                      : [...selectedValues, value];
                                    return {
                                      ...current,
                                      departureWeekdayFilter:
                                        nextValues.length === 1
                                          ? nextValues[0]
                                          : "any",
                                      departureWeekdayFilters: nextValues,
                                    };
                                  })
                                }
                                type="button"
                              >
                                <span>
                                  {option.value === "any"
                                    ? t("deals.weekday.any")
                                    : new Intl.DateTimeFormat(locale, {
                                        weekday: "short",
                                        timeZone: "UTC",
                                      })
                                        .format(
                                          new Date(
                                            Date.UTC(2026, 0, 4 + index),
                                          ),
                                        )
                                        .replace(/\.$/, "")}
                                </span>
                                {selected ? <Check aria-hidden="true" /> : null}
                              </button>
                            );
                          })}
                        </div>
                      </section>
                      {shouldShowPriceRangeFilter ? (
                        <section>
                          <div>
                            <h3>{t("common.priceRange")}</h3>
                            <p>{t("deals.filters.priceHelp")}</p>
                          </div>
                          <PublicDealsPriceRange
                            bounds={priceBounds}
                            deferChanges
                            label={t("common.priceRange")}
                            legacyMaximum={legacyPriceMaximum}
                            onChange={updatePriceRange}
                            priceMax={draftFilters.priceMax}
                            priceMin={draftFilters.priceMin}
                            prices={priceHistogramValues}
                            showHistogram
                            showLabel={false}
                          />
                        </section>
                      ) : null}
                      {shouldShowAirlineFilter ? (
                        <section>
                          <div>
                            <h3 id={`${mobileResultsPanelTitleId}-airlines`}>
                              {t("deals.airlines")}
                            </h3>
                            <p>{t("deals.filters.airlinesHelp")}</p>
                          </div>
                          <div
                            className="deals-filter-sheet__airlines"
                            role="group"
                            aria-labelledby={`${mobileResultsPanelTitleId}-airlines`}
                          >
                            {airlineOptions.map((option) => (
                              <label key={option.key}>
                                <span aria-hidden="true">
                                  <AirlineLogo
                                    airlineName={option.label}
                                    primaryAirlineCode={null}
                                  />
                                </span>
                                <span className="deals-filter-sheet__airline-name">
                                  {option.label}
                                </span>
                                <input
                                  aria-label={option.label}
                                  checked={
                                    !draftFilters.excludedAirlines.includes(
                                      option.key,
                                    )
                                  }
                                  onChange={(event) => {
                                    const checked = event.target.checked;
                                    setDraftFilters((current) => ({
                                      ...current,
                                      excludedAirlines: checked
                                        ? current.excludedAirlines.filter(
                                            (key) => key !== option.key,
                                          )
                                        : [
                                            ...new Set([
                                              ...current.excludedAirlines,
                                              option.key,
                                            ]),
                                          ],
                                    }));
                                  }}
                                  type="checkbox"
                                />
                                <Check
                                  aria-hidden="true"
                                  className="deals-filter-sheet__check"
                                />
                              </label>
                            ))}
                          </div>
                        </section>
                      ) : null}
                    </div>
                  )}
                </div>

                <footer className="deals-mobile-results-sheet__footer">
                  <button
                    onClick={
                      mobileResultsPanel === "filters"
                        ? applyMobileResultsFilters
                        : closeMobileResultsPanel
                    }
                    type="button"
                  >
                    {mobileResultsPanel === "filters"
                      ? t("deals.mobile.showResults", {
                          count: draftFilteredDealsCount,
                        })
                      : t("deals.mobile.showResults", { count: resultsTotal })}
                    {mobileResultsPanel === "filters" ? (
                      <ArrowRight aria-hidden="true" size={22} />
                    ) : null}
                  </button>
                </footer>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );

  const renderDesktopFilters = (compact = false) => {
    const destinationValue =
      lockedDestinationFilter ?? draftFilters.destinationFilter;
    const selectedWeekdayFilters =
      getSelectedDepartureWeekdayFilters(draftFilters);
    const selectedDurationFilters = getSelectedDurationFilters(draftFilters);
    const weekdayAvailability = new Map(
      departureWeekdayOptions.map((option) => [option.value, !option.disabled]),
    );

    return (
      <>
        <h2
          className="deals-desktop-filter-title"
          id={compact ? undefined : desktopFiltersTitleId}
        >
          {t("deals.filters.refineResults")}
        </h2>

        <div className="deals-desktop-filter-route">
          <div className="deals-desktop-filter-route__origin">
            <strong>LUX</strong>
          </div>
          <span
            aria-hidden="true"
            className="deals-desktop-filter-route__plane"
          >
            <Plane fill="currentColor" size={22} strokeWidth={1.25} />
          </span>
          <DealsSelect
            className={`deals-desktop-filter-route__destination${
              destinationValue === "any" ? " is-everywhere" : ""
            }`}
            label={t("common.to")}
            mobileDestinationSheet
            mobileValueLabel={
              destinationValue === "any"
                ? t("deals.mobile.everywhere")
                : undefined
            }
            onChange={selectMobileDestination}
            options={destinationOptions}
            popularOptionValues={popularDestinationValues}
            value={destinationValue}
          />
        </div>

        <div className="deals-desktop-filter-card__group deals-desktop-filter-card__date">
          <h3>{t("deals.filters.whenToTravel")}</h3>
          <DealsDatePicker
            dateFrom={draftFilters.dateFrom}
            dateTo={draftFilters.dateTo}
            label={t("common.when")}
            onChange={(selection) =>
              setDraftFilters((current) => ({ ...current, ...selection }))
            }
            presetOptions={resultsWhenOptions}
            value={draftFilters.whenFilter}
          />
        </div>

        {shouldShowDirectOnlyOption ? (
          <label className="deals-desktop-filter-card__direct">
            <span>
              <strong>{t("common.directOnly")}</strong>
            </span>
            <input
              checked={draftFilters.directOnly}
              disabled={!directOnlyOptionAvailable && !draftFilters.directOnly}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  directOnly: event.target.checked,
                }))
              }
              role="switch"
              type="checkbox"
            />
          </label>
        ) : null}

        <fieldset className="deals-desktop-filter-card__group deals-desktop-filter-card__days">
          <legend>{t("deals.departureDay")}</legend>
          <div>
            {DEPARTURE_WEEKDAY_OPTIONS.slice(1).map((option, index) => {
              const selected = selectedWeekdayFilters.includes(
                option.value as DepartureWeekdayFilterValue,
              );
              const available = weekdayAvailability.get(option.value) ?? false;
              const shortLabel = new Intl.DateTimeFormat(locale, {
                weekday: "short",
                timeZone: "UTC",
              })
                .format(new Date(Date.UTC(2026, 0, 5 + index)))
                .replace(/\.$/, "");

              return (
                <button
                  aria-label={t(`deals.weekday.${option.value}`)}
                  aria-pressed={selected}
                  className={selected ? "is-selected" : undefined}
                  disabled={!available && !selected}
                  key={option.value}
                  onClick={() =>
                    setDraftFilters((current) => ({
                      ...current,
                      departureWeekdayFilter: "any",
                      departureWeekdayFilters: selected
                        ? getSelectedDepartureWeekdayFilters(current).filter(
                            (value) => value !== option.value,
                          )
                        : [
                            ...getSelectedDepartureWeekdayFilters(current),
                            option.value as DepartureWeekdayFilterValue,
                          ],
                    }))
                  }
                  type="button"
                >
                  {shortLabel}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="deals-desktop-filter-card__group deals-desktop-filter-card__durations">
          <legend>{t("deals.tripDuration")}</legend>
          <div>
            {resultsDurationOptions.map((option) => {
              const selected = selectedDurationFilters.includes(
                option.value as DurationFilterValue,
              );
              return (
                <button
                  aria-pressed={selected}
                  className={selected ? "is-selected" : undefined}
                  disabled={option.disabled && !selected}
                  key={option.value}
                  onClick={() =>
                    setDraftFilters((current) => ({
                      ...current,
                      durationFilter: "any",
                      durationFilters: selected
                        ? getSelectedDurationFilters(current).filter(
                            (value) => value !== option.value,
                          )
                        : [
                            ...getSelectedDurationFilters(current),
                            option.value as DurationFilterValue,
                          ],
                      tripFilter: "any",
                    }))
                  }
                  type="button"
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        {!compact && shouldShowPriceRangeFilter ? (
          <div className="deals-desktop-filter-card__group deals-desktop-filter-card__price">
            <h3>{t("deals.filters.maximumPrice")}</h3>
            <PublicDealsPriceRange
              bounds={priceBounds}
              deferChanges
              label={t("deals.filters.maximumPrice")}
              legacyMaximum={legacyPriceMaximum}
              onChange={updatePriceRange}
              priceMax={draftFilters.priceMax}
              priceMin={draftFilters.priceMin}
              prices={priceHistogramValues}
              showHistogram
              showLabel={false}
            />
          </div>
        ) : null}

        {!compact && shouldShowAirlineFilter ? (
          <div className="deals-desktop-filter-card__group deals-desktop-filter-card__airlines">
            <DealsAirlineFilter
              excludedAirlines={draftFilters.excludedAirlines}
              onChange={(excludedAirlines) =>
                setDraftFilters((current) => ({ ...current, excludedAirlines }))
              }
              options={airlineOptions}
              t={t}
            />
          </div>
        ) : null}
      </>
    );
  };

  const renderCompactSidebar = () => {
    if (!showCompactSidebar || !compactSidebarPosition) {
      return null;
    }

    return createPortal(
      <div
        className="deals-redesign deals-search-compact-filters"
        ref={compactSidebarRef}
        style={
          {
            "--compact-filter-left": `${compactSidebarPosition.left}px`,
            "--compact-filter-placement": compactSidebarPosition.placement,
            "--compact-filter-top": `${compactSidebarPosition.top}px`,
            "--compact-filter-width": `${compactSidebarPosition.width}px`,
          } as CSSProperties
        }
      >
        {renderDesktopFilters(true)}
      </div>,
      document.body,
    );
  };

  if (!data.configured || !data.schemaReady) {
    return (
      <section className="section">
        <div className="ops-banner">
          <p>{t("deals.temporarilyUnavailable")}</p>
        </div>
      </section>
    );
  }

  return (
    <div
      className={`deals-explorer${mode === "results" || mode === "city" ? " deals-explorer--results" : ""}`}
    >
      <Suspense fallback={null}>
        <PublicDealsUrlState onChange={applyUrlQuery} />
      </Suspense>
      <LocalizedPageMetadata
        description={
          mode === "city"
            ? getDestinationHeroDescription(rawCityHeroTitle, t, cityHeroTitle)
            : t("deals.results.defaultDesc")
        }
        title={
          mode === "city"
            ? t("deals.cityMetaTitle", { city: cityHeroTitle })
            : t("deals.searchResults")
        }
      />

      {mode === "results" ? (
        <nav
          className="deals-breadcrumb"
          aria-label={t("deals.a11y.breadcrumb")}
        >
          <Link href={getLocalizedHomePath(locale)}>{t("common.home")}</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{breadcrumbCurrentLabel}</span>
        </nav>
      ) : null}

      {mode === "city" ? (
        <section className="deals-city-page">
          <div className="deals-city-page__content">
            <section className="deals-city-page__hero">
              <div className="deals-city-page__hero-copy">
                <nav
                  className="deals-breadcrumb deals-breadcrumb--city-hero"
                  aria-label={t("deals.a11y.breadcrumb")}
                >
                  <Link href={getLocalizedHomePath(locale)}>
                    {t("common.home")}
                  </Link>
                  <span aria-hidden="true">›</span>
                  <span aria-current="page">{cityHeroTitle}</span>
                </nav>
                <p
                  className={`deals-city-page__hero-title${cityHeroTitleLengthClass}`}
                >
                  {cityHeroTitle}
                </p>
                <span
                  className="deals-city-page__hero-wave"
                  aria-hidden="true"
                />
                <div className="deals-city-page__hero-text">
                  <h1 className="deals-city-page__hero-seo-title">
                    {t("deals.cityMetaTitle", { city: cityHeroTitle })}
                  </h1>
                  <p className="deals-city-page__hero-desc">
                    {getDestinationHeroDescription(
                      rawCityHeroTitle,
                      t,
                      cityHeroTitle,
                    )}
                  </p>
                </div>
                {opportunityDeals.length > 0 && cityLowestPrice !== null ? (
                  <a
                    className="deals-city-page__hero-cta"
                    href="#destination-fares"
                  >
                    {t("deals.cityHeroCta", {
                      count: opportunityDeals.length,
                      fareLabel:
                        opportunityDeals.length === 1
                          ? t("deals.fare")
                          : t("deals.fares"),
                      price: formatCurrency(cityLowestPrice),
                    })}
                  </a>
                ) : null}
              </div>

              <div className="deals-city-page__hero-visual">
                {lockedDestinationCity || cityHeroDeal ? (
                  <figure className="deals-city-page__media" aria-hidden="true">
                    <LandmarkPhoto
                      alt={t("deals.a11y.destinationLandmark", {
                        destination: rawCityHeroTitle,
                      })}
                      destinationCity={rawCityHeroTitle}
                      landmarkTitle={
                        cityHeroDeal
                          ? getLandmarkTitle(cityHeroDeal)
                          : undefined
                      }
                      photoSrc={getDestinationPhotoSrc(
                        destinationPhotoUrls,
                        rawCityHeroTitle,
                      )}
                      priority
                      sizes="(max-width: 767px) 100vw, (max-width: 860px) 90vw, 45vw"
                    />
                  </figure>
                ) : null}
                <div className="deals-city-page__hero-summary">
                  <span>
                    {opportunityDeals.length}{" "}
                    {opportunityDeals.length === 1
                      ? t("deals.fare")
                      : t("deals.fares")}
                  </span>
                  <strong>
                    <span className="deals-city-page__hero-summary-prefix">
                      {t("common.from").toLowerCase()}
                    </span>
                    {formatCurrency(
                      cityLowestPrice ?? selectedSearchGroup?.lowestPrice ?? 0,
                    )}
                  </strong>
                  <small>
                    <span
                      className="deals-city-page__hero-summary-clock"
                      aria-hidden="true"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="8.5" />
                        <path d="M12 7.75v4.6l2.9 1.7" />
                      </svg>
                    </span>
                    {data.updatedAt
                      ? formatVerifiedAge(data.updatedAt, t)
                      : t("deals.updatedAsDealsLand")}
                  </small>
                </div>
              </div>
            </section>

            {renderMobileResultsControls()}

            <section
              className="deals-search-layout"
              id="destination-fares"
              ref={resultsBoundaryRef}
            >
              <aside
                aria-labelledby={desktopFiltersTitleId}
                className="deals-search-layout__filters"
                ref={fullSidebarRef}
              >
                <div className="deals-desktop-monthly-card">
                  <MonthlyPriceCard
                    destinationCity={
                      lockedDestinationCity ??
                      selectedSearchGroup?.city ??
                      t("common.destination")
                    }
                    destinationSlug={toDestinationSlug(
                      lockedDestinationCity ?? selectedSearchGroup?.city ?? "",
                    )}
                    directOnly={effectiveFilters.directOnly}
                    tripType={effectiveFilters.tripFilter}
                  />
                </div>
                {renderDesktopFilters()}
                {renderCompactSidebar()}
              </aside>

              <div className="deals-search-layout__results">
                <section className="deals-explorer__featured">
                  <div className="deals-explorer__section-head">
                    <div>
                      <h2>
                        {t("deals.liveFaresTitle", {
                          destination: cityHeroTitle,
                        })}
                      </h2>
                      <p>{t("deals.liveFaresDesc")}</p>
                    </div>
                    <div className="deals-explorer__section-actions">
                      <DealsSelect
                        className="deals-results-sort"
                        label={t("deals.mobile.sortBy")}
                        onChange={(nextValue) =>
                          setSortOrder(nextValue as DealSearchSort)
                        }
                        options={dealSortOptions}
                        value={sortOrder}
                      />
                      <span>
                        {opportunityDeals.length}{" "}
                        {opportunityDeals.length === 1
                          ? t("deals.fare")
                          : t("deals.fares")}
                      </span>
                    </div>
                  </div>

                  {opportunityDeals.length === 0 ? (
                    <div className="deals-explorer__empty">
                      <h3>{t("deals.noFaresTitle")}</h3>
                      <p>{t("deals.noFaresDesc")}</p>
                    </div>
                  ) : selectedSearchGroup ? (
                    <div className="deals-search-expanded">
                      <div className="deals-search-expanded__results">
                        {paginatedResultDeals.map((deal) => (
                          <SearchResultCard
                            key={`results-${selectedSearchGroup.key}-${deal.id}`}
                            deal={deal}
                            showMobileAirlineName
                            showMobileCityLabel={false}
                          />
                        ))}
                      </div>
                      <ResultsLoadMore
                        onLoadMore={() =>
                          setResultsPage((current) =>
                            Math.min(resultsPageCount, current + 1),
                          )
                        }
                        onPageSizeChange={(pageSize) => {
                          setResultsPageSize(pageSize);
                          setResultsPage(1);
                        }}
                        pageSize={effectiveResultsPageSize}
                        total={resultsTotal}
                        visibleCount={visibleResultsCount}
                      />
                    </div>
                  ) : null}
                </section>
              </div>
            </section>
          </div>
        </section>
      ) : (
        <div
          aria-busy={isServerSearchPending}
          className="deals-search-page-card"
        >
          {serverSearchError ? (
            <p role="alert">
              We could not load more fares.{" "}
              <button type="button" onClick={retryServerSearch}>
                Try again
              </button>
            </p>
          ) : null}
          <h1 className="sr-only">{searchResultsCopy.title}</h1>
          <div className="deals-mobile-results-heading">
            <div
              aria-hidden="true"
              className="deals-search-results-visual-title"
            >
              {searchResultsCopy.title}
            </div>
            <p>{searchResultsCopy.description}</p>
          </div>
          {renderMobileResultsControls()}
          <section className="deals-search-layout" ref={resultsBoundaryRef}>
            <aside
              aria-labelledby={desktopFiltersTitleId}
              className="deals-search-layout__filters"
              ref={fullSidebarRef}
            >
              {showResultsMap ? (
                <PublicDealsMap cities={mapCities} locale={locale} />
              ) : null}
              {renderDesktopFilters()}
              {renderCompactSidebar()}
            </aside>

            <div className="deals-search-layout__results">
              <section className="deals-explorer__featured">
                <div className="deals-explorer__section-head deals-search-results-heading--desktop">
                  <div>
                    <div
                      aria-hidden="true"
                      className="deals-search-results-visual-title"
                    >
                      {searchResultsCopy.title}
                    </div>
                    <p>{searchResultsCopy.description}</p>
                  </div>
                  <div className="deals-explorer__section-actions">
                    <DealsSelect
                      className="deals-results-sort"
                      label={t("deals.mobile.sortBy")}
                      onChange={(nextValue) =>
                        setSortOrder(nextValue as DealSearchSort)
                      }
                      options={dealSortOptions}
                      value={sortOrder}
                    />
                    <span>
                      {resultsTotal}{" "}
                      {resultsTotal === 1 ? t("deals.fare") : t("deals.fares")}
                    </span>
                  </div>
                </div>

                {opportunityDeals.length === 0 ? (
                  <div className="deals-explorer__empty">
                    <h3>{t("deals.noFaresTitle")}</h3>
                    <p>{t("deals.noFaresDesc")}</p>
                  </div>
                ) : selectedSearchGroup ? (
                  <div className="deals-search-expanded">
                    <div className="deals-search-expanded__results">
                      {paginatedResultDeals.map((deal) => (
                        <SearchResultCard
                          key={`results-${selectedSearchGroup.key}-${deal.id}`}
                          deal={deal}
                          showCityLabel
                        />
                      ))}
                    </div>
                    <ResultsLoadMore
                      onLoadMore={() =>
                        setResultsPage((current) =>
                          Math.min(resultsPageCount, current + 1),
                        )
                      }
                      onPageSizeChange={(pageSize) => {
                        setResultsPageSize(pageSize);
                        setResultsPage(1);
                      }}
                      pageSize={effectiveResultsPageSize}
                      total={resultsTotal}
                      visibleCount={visibleResultsCount}
                    />
                  </div>
                ) : (
                  <div className="deals-search-expanded">
                    <div className="deals-search-expanded__results">
                      {paginatedResultDeals.map((deal) => (
                        <SearchResultCard
                          key={`results-all-${deal.id}`}
                          deal={deal}
                          showCityLabel
                        />
                      ))}
                    </div>
                    <ResultsLoadMore
                      onLoadMore={() =>
                        setResultsPage((current) =>
                          Math.min(resultsPageCount, current + 1),
                        )
                      }
                      onPageSizeChange={(pageSize) => {
                        setResultsPageSize(pageSize);
                        setResultsPage(1);
                      }}
                      pageSize={effectiveResultsPageSize}
                      total={resultsTotal}
                      visibleCount={visibleResultsCount}
                    />
                  </div>
                )}
              </section>
            </div>
          </section>
        </div>
      )}

      <section className="deals-explorer__newsletter" id="deal-alerts">
        <div className="deals-explorer__newsletter-float deals-explorer__newsletter-float--top-left">
          <strong>{t("deals.newsletter.priceContext")}</strong>
          <span>{t("deals.newsletter.priceContextDesc")}</span>
        </div>

        <div className="deals-explorer__newsletter-float deals-explorer__newsletter-float--top-right">
          <strong>{t("deals.newsletter.routeAlerts")}</strong>
          <span>{t("deals.fromLuxembourg")}</span>
        </div>

        <div className="deals-explorer__newsletter-float deals-explorer__newsletter-float--bottom-left">
          <strong>{t("deals.newsletter.flexibleDates")}</strong>
          <span>{t("deals.newsletter.flexibleDatesDesc")}</span>
        </div>

        <div className="deals-explorer__newsletter-float deals-explorer__newsletter-float--bottom-right">
          <strong>{t("deals.newsletter.clearChoices")}</strong>
          <span>{t("deals.newsletter.clearChoicesDesc")}</span>
        </div>

        <div className="deals-explorer__newsletter-content">
          <h2>{t("deals.newsletter.title")}</h2>

          <div className="deals-explorer__newsletter-panel">
            <NewsletterForm />
          </div>

          <div
            className="deals-explorer__newsletter-signals"
            aria-label={t("deals.a11y.newsletterBenefits")}
          >
            <span>{t("deals.newsletter.priceDropAlerts")}</span>
            <span>{t("deals.newsletter.directRoutePicks")}</span>
            <span>{t("deals.newsletter.schoolBreakMatches")}</span>
          </div>
        </div>
      </section>

      <footer className="deals-explorer__footer">
        <div className="deals-explorer__footer-inner">
          <div className="deals-explorer__footer-brand">
            <div className="deals-explorer__footer-mark" aria-hidden="true">
              LFD
            </div>
            <div>
              <strong>+352 Flights</strong>
              <p>{t("deals.footer.tagline")}</p>
            </div>
          </div>

          <div className="deals-explorer__footer-links">
            {DEALS_FOOTER_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.href === "/privacy"
                  ? t("common.privacy")
                  : link.href === "/cookies"
                    ? t("common.cookies")
                    : t("common.terms")}
              </Link>
            ))}
          </div>

          <div
            className="deals-explorer__footer-socials"
            aria-label={t("deals.a11y.socialLinks")}
          >
            {DEALS_FOOTER_SOCIALS.map((social) => (
              <span
                aria-label={social.label}
                className="deals-explorer__footer-social"
                key={social.label}
                role="img"
                title={social.label}
              >
                {social.icon}
              </span>
            ))}
          </div>

          <div className="deals-explorer__footer-meta">
            <span>© {new Date().getFullYear()} +352 Flights</span>
            <span>{t("deals.footer.madeInLuxembourg")}</span>
          </div>

          <div
            className="deals-explorer__footer-seal"
            aria-label={t("deals.footer.madeInLuxembourg")}
          >
            <div className="deals-explorer__footer-seal-copy">
              <strong>{t("deals.footer.madeInLuxembourg")}</strong>
              <span>
                {t("deals.footer.with")}
                <i aria-hidden="true">
                  <FooterSealHeartIcon />
                </i>
                {t("deals.footer.forTravelers")}
              </span>
            </div>
            <div className="deals-explorer__footer-seal-map">
              <LuxembourgSealIcon />
            </div>
          </div>
        </div>
      </footer>

      {selectedOpportunityDeal ? (
        <FeaturedOpportunityModal
          canGoNext={
            selectedOpportunityDealIndex >= 0 &&
            selectedOpportunityDealIndex < selectedOpportunityDeals.length - 1
          }
          canGoPrevious={selectedOpportunityDealIndex > 0}
          combinationsCount={
            destinationCounts.get(
              getDestinationCountKey(selectedOpportunityDeal),
            ) ?? 1
          }
          destinationPhotoUrls={destinationPhotoUrls}
          deal={selectedOpportunityDeal}
          onClose={closeOpportunityModal}
          onNext={() => {
            if (
              selectedOpportunityDealIndex >= 0 &&
              selectedOpportunityDealIndex < selectedOpportunityDeals.length - 1
            ) {
              setSelectedOpportunityDealId(
                selectedOpportunityDeals[selectedOpportunityDealIndex + 1]
                  ?.id ?? null,
              );
            }
          }}
          onPrevious={() => {
            if (selectedOpportunityDealIndex > 0) {
              setSelectedOpportunityDealId(
                selectedOpportunityDeals[selectedOpportunityDealIndex - 1]
                  ?.id ?? null,
              );
            }
          }}
        />
      ) : null}
    </div>
  );
}
