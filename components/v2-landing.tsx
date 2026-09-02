"use client";

import { CalendarCheck2, CircleCheck, Gauge, MapPin, Plane, Route } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { LanguageSelector } from "@/components/language-selector";
import { DestinationVisual } from "@/components/public-destination-visual";
import { PublicDealsDatePicker } from "@/components/public-deals-date-picker";
import { PublicDealsPriceRange } from "@/components/public-deals-price-range";
import { PublicDealsSelect } from "@/components/public-deals-select";
import { V2AlertsModal } from "@/components/v2-alerts";
import { V2BottomSections } from "@/components/v2-bottom-sections";
import { getAirportCountryCode } from "@/lib/airport-countries";
import { useI18n } from "@/lib/i18n";
import {
  getLocalizedDealsSearchPath,
  getLocalizedDestinationPath,
  getLocalizedHomePath,
  type Locale,
} from "@/lib/locales";
import { toDestinationSlug } from "@/lib/destination-slugs";
import type { HomeBoardDestination, HomeRecentDrop } from "@/lib/home-board";
import { getMatchingLuxSchoolHoliday } from "@/lib/lux-school-holidays";
import type { CampaignPreviewDeal } from "@/lib/ops-shared";
import {
  buildDealsSearchHref,
  DEFAULT_DEAL_SEARCH_FILTERS,
  doesTripIncludeWeekend,
  getWhenFilterDateRange,
  isTripInCurrentWeekend,
  type DealSearchFilters,
  type TripFilter,
  type WhenFilter,
} from "@/lib/public-deals-search";

const RHYTHMS = [
  {
    key: "weekend",
    label: "Weekend escapes",
    note: "Thu–Sun, packed light",
    city: "Paris",
    landmark: "Pont Alexandre III",
  },
  {
    key: "week",
    label: "One full week",
    note: "Sat–Sat sweet spots",
    city: "Florence",
    landmark: "Ponte Vecchio",
  },
  {
    key: "school",
    label: "School breaks",
    note: "Matched to Luxembourg holidays",
    city: "Vienna",
    landmark: "Schonbrunn Palace",
  },
  {
    key: "beach",
    label: "Beach weather",
    note: "Sea, sun, short flights",
    city: "Palma de Mallorca",
    landmark: "Palma Cathedral",
  },
];

const MINIMUM_TICKER_ITEMS = 16;

type Testimonial = {
  quoteKey: string;
  name: string;
  location: string;
  photo: string;
  tone: "blue" | "red" | "sand";
};

const TESTIMONIALS_ROW_A: Testimonial[] = [
  {
    quoteKey: "home.testimonial.claire",
    name: "Claire Muller",
    location: "Luxembourg City",
    photo: "/v2-avatars/claire.jpg",
    tone: "blue",
  },
  {
    quoteKey: "home.testimonial.tomas",
    name: "Tomás Ferreira",
    location: "Esch-sur-Alzette",
    photo: "/v2-avatars/tomas.jpg",
    tone: "red",
  },
  {
    quoteKey: "home.testimonial.anne",
    name: "Anne Weber",
    location: "Differdange",
    photo: "/v2-avatars/anne.jpg",
    tone: "sand",
  },
];

const TESTIMONIALS_ROW_A_EXTRA: Testimonial[] = [
  {
    quoteKey: "home.testimonial.marc",
    name: "Marc Hoffmann",
    location: "Dudelange",
    photo: "/v2-avatars/marc.jpg",
    tone: "red",
  },
  {
    quoteKey: "home.testimonial.sofia",
    name: "Sofia Ricci",
    location: "Kirchberg",
    photo: "/v2-avatars/sofia.jpg",
    tone: "blue",
  },
  {
    quoteKey: "home.testimonial.ben",
    name: "Ben Kayser",
    location: "Ettelbruck",
    photo: "/v2-avatars/ben.jpg",
    tone: "sand",
  },
];

const TESTIMONIALS_ROW_B: Testimonial[] = [
  {
    quoteKey: "home.testimonial.lena",
    name: "Lena Schmit",
    location: "Mersch",
    photo: "/v2-avatars/lena.jpg",
    tone: "blue",
  },
  {
    quoteKey: "home.testimonial.paul",
    name: "Paul Reuter",
    location: "Bertrange",
    photo: "/v2-avatars/paul.jpg",
    tone: "sand",
  },
  {
    quoteKey: "home.testimonial.marta",
    name: "Marta Silva",
    location: "Bonnevoie",
    photo: "/v2-avatars/marta.jpg",
    tone: "red",
  },
  {
    quoteKey: "home.testimonial.david",
    name: "David Klein",
    location: "Strassen",
    photo: "/v2-avatars/david.jpg",
    tone: "blue",
  },
  {
    quoteKey: "home.testimonial.julie",
    name: "Julie Thill",
    location: "Remich",
    photo: "/v2-avatars/julie.jpg",
    tone: "red",
  },
  {
    quoteKey: "home.testimonial.nico",
    name: "Nico Wagner",
    location: "Echternach",
    photo: "/v2-avatars/nico.jpg",
    tone: "sand",
  },
];

function landmarkSrc(city: string, landmark: string) {
  const params = new URLSearchParams({ city, landmark, v: "2" });
  return `/api/landmark-photo?${params.toString()}`;
}

function buildRhythmSearchHref(key: string, locale: Locale) {
  const pathname = getLocalizedDealsSearchPath(locale);
  switch (key) {
    case "weekend":
      return buildDealsSearchHref({
        ...DEFAULT_DEAL_SEARCH_FILTERS,
        tripFilter: "weekend",
      }, pathname);
    case "week":
      return buildDealsSearchHref({
        ...DEFAULT_DEAL_SEARCH_FILTERS,
        tripFilter: "weeklong",
      }, pathname);
    case "school":
      return buildDealsSearchHref({
        ...DEFAULT_DEAL_SEARCH_FILTERS,
        whenFilter: "school_holidays",
      }, pathname);
    case "beach":
      return buildDealsSearchHref({
        ...DEFAULT_DEAL_SEARCH_FILTERS,
        themeFilter: "beach",
      }, pathname);
    default:
      return pathname;
  }
}

function useReveal(rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const targets = root.querySelectorAll<HTMLElement>("[data-reveal]");
    if (typeof IntersectionObserver === "undefined") {
      targets.forEach((el) => el.classList.add("is-in"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        }
      },
      // No negative bottom margin: elements at the very end of the document
      // would otherwise sit inside the clipped zone forever and never reveal.
      { threshold: 0.08 },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [rootRef]);
}

function useParallax(ref: React.RefObject<HTMLElement | null>, strength = 0.12) {
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let frame = 0;
    function update() {
      frame = 0;
      const node = ref.current;
      if (!node) {
        return;
      }
      const rect = node.getBoundingClientRect();
      const offset = (rect.top + rect.height / 2 - window.innerHeight / 2) * strength;
      node.style.setProperty("--parallax", `${offset.toFixed(1)}px`);
    }

    function onScroll() {
      if (!frame) {
        frame = window.requestAnimationFrame(update);
      }
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [ref, strength]);
}

type V2LandingProps = {
  boardDestinations?: HomeBoardDestination[];
  deals?: CampaignPreviewDeal[];
  destinationPhotoUrls?: Record<string, string>;
  recentDrops?: HomeRecentDrop[];
};

function normalizeDestinationKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function findDestinationCity(
  deals: readonly CampaignPreviewDeal[],
  destinationFilter: string,
) {
  if (destinationFilter === "any") {
    return null;
  }

  return (
    deals.find(
      (deal) => normalizeDestinationKey(deal.destinationCity) === destinationFilter,
    )?.destinationCity.trim() ?? null
  );
}

function matchesWhenFilter(deal: CampaignPreviewDeal, filters: DealSearchFilters, now: Date) {
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
    case "any":
    default:
      return true;
  }
}

function matchesTripFilter(deal: CampaignPreviewDeal, tripFilter: TripFilter) {
  switch (tripFilter) {
    case "weekend":
      return normalizeDestinationKey(deal.routeBucket).includes("weekend") || deal.tripNights <= 4;
    case "weeklong":
      return deal.tripNights >= 5 && deal.tripNights <= 7;
    case "long_stay":
      return deal.tripNights > 4;
    case "any":
    default:
      return true;
  }
}

function matchesHomeSearchFilters(
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

  if (filters.priceMin !== null && deal.dealPrice < filters.priceMin) {
    return false;
  }

  if (filters.priceMax !== null && deal.dealPrice > filters.priceMax) {
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

  return true;
}

export function V2Landing({
  boardDestinations = [],
  deals = [],
  destinationPhotoUrls = {},
  recentDrops = [],
}: V2LandingProps) {
  const { locale, t } = useI18n();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const heroMediaRef = useRef<HTMLDivElement | null>(null);
  const tickerRef = useRef<HTMLElement | null>(null);
  const tickerGroupRef = useRef<HTMLUListElement | null>(null);
  const [filters, setFilters] = useState<DealSearchFilters>(DEFAULT_DEAL_SEARCH_FILTERS);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [tickerRepeats, setTickerRepeats] = useState(() =>
    recentDrops.length > 0
      ? Math.max(1, Math.ceil(MINIMUM_TICKER_ITEMS / recentDrops.length))
      : 1,
  );
  const now = useMemo(() => new Date(), []);

  useReveal(rootRef);
  useParallax(heroMediaRef, 0.1);

  const searchHref = useMemo(() => {
    const selectedDestinationCity = findDestinationCity(
      deals,
      filters.destinationFilter,
    );
    const pathname = selectedDestinationCity
      ? getLocalizedDestinationPath(locale, toDestinationSlug(selectedDestinationCity))
      : getLocalizedDealsSearchPath(locale);
    const hrefFilters = selectedDestinationCity
      ? { ...filters, destinationFilter: "any" }
      : filters;

    return buildDealsSearchHref(hrefFilters, pathname);
  }, [deals, filters, locale]);
  const hasMatchingDeals = useMemo(
    () => deals.some((deal) => matchesHomeSearchFilters(deal, filters, now)),
    [deals, filters, now],
  );
  const searchWhenOptions = useMemo(
    () =>
      [
        { value: "any" as WhenFilter, label: t("deals.when.any") },
        { value: "this_weekend" as WhenFilter, label: t("common.thisWeekend") },
        { value: "weekends" as WhenFilter, label: t("deals.when.weekends") },
        { value: "next_30" as WhenFilter, label: t("common.next30") },
        { value: "this_month" as WhenFilter, label: t("deals.when.this_month") },
        { value: "next_month" as WhenFilter, label: t("deals.when.next_month") },
        { value: "this_year" as WhenFilter, label: t("deals.when.this_year") },
        { value: "next_year" as WhenFilter, label: t("deals.when.next_year") },
        { value: "school_holidays" as WhenFilter, label: t("common.schoolHolidays") },
      ].map((option) => ({
        ...option,
        disabled: !deals.some((deal) =>
          matchesHomeSearchFilters(
            deal,
            {
              ...filters,
              whenFilter: option.value,
              dateFrom: null,
              dateTo: null,
            },
            now,
          ),
        ),
      })),
    [deals, filters, now, t],
  );
  const searchTripOptions = useMemo(
    () =>
      [
        { value: "any" as TripFilter, label: t("common.anyTrip") },
        { value: "weekend" as TripFilter, label: t("common.weekend") },
        { value: "weeklong" as TripFilter, label: t("common.weeklong") },
        { value: "long_stay" as TripFilter, label: t("common.longStay") },
      ].map((option) => ({
        ...option,
        disabled: !deals.some((deal) =>
          matchesHomeSearchFilters(
            deal,
            {
              ...filters,
              tripFilter: option.value,
            },
            now,
          ),
        ),
      })),
    [deals, filters, now, t],
  );
  const priceBounds = useMemo(() => {
    const filtersWithoutPrice = {
      ...filters,
      budgetFilter: "any" as const,
      priceMin: null,
      priceMax: null,
    };
    const matchingPrices = deals
      .filter((deal) => matchesHomeSearchFilters(deal, filtersWithoutPrice, now))
      .map((deal) => deal.dealPrice)
      .filter((price) => Number.isFinite(price) && price > 0);
    const fallbackPrices = deals
      .filter((deal) => {
        if (
          filters.destinationFilter !== "any" &&
          normalizeDestinationKey(deal.destinationCity) !== filters.destinationFilter
        ) {
          return false;
        }

        return !filters.directOnly || deal.maxStops === "NON_STOP";
      })
      .map((deal) => deal.dealPrice)
      .filter((price) => Number.isFinite(price) && price > 0);
    const source = matchingPrices.length > 0 ? matchingPrices : fallbackPrices;

    return {
      distinctPriceCount: new Set(source.map((price) => price.toFixed(2))).size,
      min: source.length > 0 ? Math.floor(Math.min(...source)) : 0,
      max: source.length > 0 ? Math.ceil(Math.max(...source)) : 1,
    };
  }, [deals, filters, now]);
  const hasVariablePriceRange =
    priceBounds.distinctPriceCount > 1 && priceBounds.min < priceBounds.max;
  const destinationOptions = useMemo(() => {
    const filtersWithoutDestination = {
      ...filters,
      destinationFilter: "any",
    };
    const availableCities = deals
      .filter((deal) => matchesHomeSearchFilters(deal, filtersWithoutDestination, now))
      .map((deal) => deal.destinationCity?.trim() ?? "")
      .filter((city) => city.length > 0);
    const selectedDestinationCity = findDestinationCity(
      deals,
      filters.destinationFilter,
    );
    const visibleCities = selectedDestinationCity
      ? [selectedDestinationCity, ...availableCities]
      : availableCities;
    const countryCodeByCity = new Map<string, string>();
    for (const deal of deals) {
      const city = deal.destinationCity?.trim();
      const countryCode = getAirportCountryCode(deal.destinationAirport);
      if (!city || !countryCode) continue;
      const cityKey = normalizeDestinationKey(city);
      if (!countryCodeByCity.has(cityKey)) countryCodeByCity.set(cityKey, countryCode);
    }
    const uniqueCities = [...new Set(visibleCities.map((city) => normalizeDestinationKey(city)))]
      .map(
        (cityKey) =>
          visibleCities.find((city) => normalizeDestinationKey(city) === cityKey) ?? cityKey,
      )
      .sort((left, right) => left.localeCompare(right, "en"));

    return [
      { value: "any", label: t("common.anyDestination") },
      ...uniqueCities.map((city) => ({
        value: normalizeDestinationKey(city),
        label: city,
        countryCode: countryCodeByCity.get(normalizeDestinationKey(city)),
      })),
    ];
  }, [deals, filters, now, t]);
  const popularDestinationValues = useMemo(() => {
    const destinationCounts = new Map<string, number>();
    for (const deal of deals) {
      const city = deal.destinationCity?.trim();
      if (!city) continue;
      const key = normalizeDestinationKey(city);
      destinationCounts.set(key, (destinationCounts.get(key) ?? 0) + 1);
    }

    const seasonalDestinations = (boardDestinations ?? []).map((destination) =>
      normalizeDestinationKey(destination.city),
    );
    const destinationsWithMostLiveFares = [...destinationCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([destination]) => destination);

    return [...new Set([...seasonalDestinations, ...destinationsWithMostLiveFares])].slice(0, 6);
  }, [boardDestinations, deals]);

  useEffect(() => {
    if (filters.destinationFilter === "any") {
      return;
    }

    const destinationStillAvailable = destinationOptions.some(
      (option) => option.value === filters.destinationFilter,
    );
    if (destinationStillAvailable) {
      return;
    }

    setFilters((current) => ({ ...current, destinationFilter: "any" }));
  }, [destinationOptions, filters.destinationFilter]);

  useEffect(() => {
    if (
      hasVariablePriceRange ||
      (filters.priceMin === null && filters.priceMax === null)
    ) {
      return;
    }

    setFilters((current) =>
      current.priceMin === null && current.priceMax === null
        ? current
        : {
            ...current,
            budgetFilter: "any",
            priceMin: null,
            priceMax: null,
          },
    );
  }, [filters.priceMax, filters.priceMin, hasVariablePriceRange]);

  useEffect(() => {
    if (filters.tripFilter === "any") {
      return;
    }

    const selectedTripOption = searchTripOptions.find(
      (option) => option.value === filters.tripFilter,
    );
    if (!selectedTripOption?.disabled) {
      return;
    }

    setFilters((current) =>
      current.tripFilter === filters.tripFilter
        ? { ...current, tripFilter: "any" }
        : current,
    );
  }, [filters.tripFilter, searchTripOptions]);

  useEffect(() => {
    setTickerRepeats(
      recentDrops.length > 0
        ? Math.max(1, Math.ceil(MINIMUM_TICKER_ITEMS / recentDrops.length))
        : 1,
    );
  }, [recentDrops.length]);

  const tickerFares = useMemo(
    () =>
      recentDrops.length > 0
        ? Array.from(
            { length: recentDrops.length * tickerRepeats },
            (_, index) => recentDrops[index % recentDrops.length],
          )
        : [],
    [recentDrops, tickerRepeats],
  );

  useEffect(() => {
    const ticker = tickerRef.current;
    const group = tickerGroupRef.current;
    if (!ticker || !group || recentDrops.length === 0) return;

    const ensureContinuousCoverage = () => {
      const groupWidth = group.scrollWidth;
      const requiredWidth = ticker.clientWidth * 1.25;
      if (groupWidth <= 0 || groupWidth >= requiredWidth) return;

      const multiplier = Math.ceil(requiredWidth / groupWidth);
      setTickerRepeats((current) => current * Math.max(multiplier, 2));
    };

    ensureContinuousCoverage();
    const observer = new ResizeObserver(ensureContinuousCoverage);
    observer.observe(ticker);
    observer.observe(group);
    return () => observer.disconnect();
  }, [recentDrops.length, tickerRepeats]);

  return (
    <div className="v2" ref={rootRef}>
      {/* ---------- Section 1 of 8 · Hero — giant statement, stacked center ---------- */}
      <header className="v2-topbar">
        <Link
          className="v2-topbar__brand"
          href={getLocalizedHomePath(locale)}
          aria-label="352 Flights"
        >
          <img src="/v2-logo.png" alt="352 Flights" />
        </Link>
        <div className="v2-topbar__actions">
          <LanguageSelector />
          <button className="v2-topbar__cta" onClick={() => setIsAlertsOpen(true)} type="button">
            {t("common.alerts")}
          </button>
        </div>
      </header>

      {isAlertsOpen ? <V2AlertsModal onClose={() => setIsAlertsOpen(false)} /> : null}

      <section className="v2-hero" aria-label={t("home.a11y.introduction")}>
        <div className="v2-hero__canvas" data-reveal ref={heroMediaRef}>
          <div className="v2-hero__media">
            <Image
              alt={t("home.a11y.heroImage")}
              className="v2-hero__photo"
              fill
              priority
              quality={82}
              sizes="100vw"
              src="/deals-hero-airplane-cabin-3.jpeg"
            />
            <span className="v2-hero__overlay" aria-hidden="true" />
          </div>

          <div className="v2-hero__panel">
            <div className="v2-hero__copy">
              <p className="v2-hero__kicker" data-reveal style={{ "--d": "120ms" } as React.CSSProperties}>
                {t("home.kicker")}
              </p>
              <h1 className="v2-hero__title" data-reveal style={{ "--d": "200ms" } as React.CSSProperties}>
                {t("home.title.before")} <em>{t("home.title.em")}</em>
              </h1>
              <p className="v2-hero__lede" data-reveal style={{ "--d": "300ms" } as React.CSSProperties}>
                {t("home.lede")}
              </p>
            </div>

            {/* Search — the shared fare engine, docked inside the hero card */}
            <div
              className="v2-search__bar"
              data-reveal
              id="v2-search"
              style={{ "--d": "440ms" } as React.CSSProperties}
            >
              <div className="v2-search__field v2-search__field--origin">
                <span>{t("common.from")}</span>
                <strong>Luxembourg</strong>
              </div>
              <PublicDealsSelect
                className="v2-search__field v2-search__field--destination v2-search__destination-select v2-search__custom-select"
                label={t("common.to")}
                leadingIcon={<MapPin size={18} strokeWidth={2.1} />}
                mobileDestinationSheet
                mobileDirectOnly={filters.directOnly}
                mobileDirectOnlyLabel={t("destinationPicker.directOnly")}
                onChange={(value) =>
                  setFilters((current) => ({ ...current, destinationFilter: value }))
                }
                onMobileDirectOnlyChange={(checked) =>
                  setFilters((current) => ({ ...current, directOnly: checked }))
                }
                options={destinationOptions}
                popularOptionValues={popularDestinationValues}
                value={filters.destinationFilter}
              />
              <PublicDealsDatePicker
                className="v2-search__field v2-search__field--when"
                dateFrom={filters.dateFrom}
                dateTo={filters.dateTo}
                label={t("common.when")}
                onChange={(selection) =>
                  setFilters((current) => ({
                    ...current,
                    ...selection,
                  }))
                }
                popoverClassName="deals-date-picker__popover--home"
                presetOptions={searchWhenOptions}
                value={filters.whenFilter}
              />
              <PublicDealsSelect
                className="v2-search__field v2-search__field--trip v2-search__custom-select"
                label={t("common.tripType")}
                leadingIcon={<Plane size={18} strokeWidth={2.1} />}
                mobileSheetTitle={t("home.searchChooseTripType")}
                onChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    tripFilter: value as TripFilter,
                  }))
                }
                options={searchTripOptions}
                value={filters.tripFilter}
              />
              {hasVariablePriceRange ? (
                <PublicDealsPriceRange
                  bounds={priceBounds}
                  className="v2-search__field v2-search__field--budget"
                  label={t("common.priceRange")}
                  onChange={(priceMin, priceMax) =>
                    setFilters((current) => ({
                      ...current,
                      budgetFilter: "any",
                      priceMin,
                      priceMax,
                    }))
                  }
                  priceMax={filters.priceMax}
                  priceMin={filters.priceMin}
                  showHistogram
                />
              ) : null}
              <label className="v2-search__toggle">
                <input
                  checked={filters.directOnly}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, directOnly: event.target.checked }))
                  }
                  type="checkbox"
                />
                <span>{t("common.directOnly")}</span>
              </label>
              {hasMatchingDeals ? (
                <Link className="v2-search__cta" href={searchHref}>
                  {t("common.viewDeals")}
                </Link>
              ) : (
                <button className="v2-search__cta" disabled type="button">
                  {t("common.viewDeals")}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Section 2 of 8 · Departure board — infinite marquee strip ---------- */}
      {recentDrops.length > 0 ? (
        <section className="v2-ticker" id="v2-board" aria-label={t("home.recentDrops")} ref={tickerRef}>
          <div className="v2-ticker__track">
            {[0, 1].map((copy) => (
              <ul className="v2-ticker__group" key={copy} ref={copy === 0 ? tickerGroupRef : undefined}>
                {tickerFares.map((fare, index) => {
                  const isPrimaryLink = copy === 0 && index < recentDrops.length;
                  const [originLabel = "LUX", destinationLabel = fare.city] = fare.route
                    .split("→")
                    .map((segment) => segment.trim());

                  return (
                    <li aria-hidden={isPrimaryLink ? undefined : true} key={`${copy}-${index}-${fare.route}`}>
                      <Link
                        aria-label={`${fare.route}, €${Math.round(fare.price)}, ${fare.city}`}
                        href={getLocalizedDestinationPath(locale, toDestinationSlug(fare.city))}
                        tabIndex={isPrimaryLink ? undefined : -1}
                      >
                        <span className="v2-ticker__route">
                          <span className="v2-ticker__origin">{originLabel} →</span>
                          <span className="v2-ticker__destination">{destinationLabel}</span>
                        </span>
                        <span className="v2-ticker__price">€{Math.round(fare.price)}</span>
                        {fare.drop !== null ? (
                          <span className="v2-ticker__drop">−{fare.drop}%</span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ))}
          </div>
        </section>
      ) : null}

      <section
        aria-labelledby="v2-smart-flights-title"
        className="v2-smart-flights"
        data-reveal
      >
        <h2 id="v2-smart-flights-title">{t("home.smartFlights.title")}</h2>
        <div className="v2-smart-flights__grid">
          <article className="v2-smart-flights__item">
            <span className="v2-smart-flights__icon" aria-hidden="true">
              <CalendarCheck2 />
            </span>
            <h3>{t("home.smartFlights.datesTitle")}</h3>
            <p>{t("home.smartFlights.datesBody")}</p>
          </article>

          <article className="v2-smart-flights__item">
            <span className="v2-smart-flights__icon v2-smart-flights__icon--value" aria-hidden="true">
              <Gauge />
              <CircleCheck className="v2-smart-flights__check" />
            </span>
            <h3>{t("home.smartFlights.valueTitle")}</h3>
            <p>{t("home.smartFlights.valueBody")}</p>
          </article>

          <article className="v2-smart-flights__item">
            <span className="v2-smart-flights__icon v2-smart-flights__icon--route" aria-hidden="true">
              <span className="v2-smart-flights__lux">LUX</span>
              <Route className="v2-smart-flights__route" />
              <Plane className="v2-smart-flights__plane" />
            </span>
            <h3>{t("home.smartFlights.luxTitle")}</h3>
            <p>{t("home.smartFlights.luxBody")}</p>
          </article>
        </div>
      </section>

      {boardDestinations.length > 0 ? (
        <section className="v2-bento" aria-label={t("home.a11y.boardDestinations")}>
          <div className="v2-bento__head" data-reveal>
            <h2>{t("home.boardTitle")}</h2>
          </div>
          <div className="v2-bento__grid">
            {boardDestinations.map((dest, i) => (
              <Link
                className="v2-bento__cell"
                data-reveal
                href={getLocalizedDestinationPath(locale, toDestinationSlug(dest.city))}
                key={dest.city}
                style={{ "--d": `${i * 90}ms` } as React.CSSProperties}
              >
                <DestinationVisual
                  alt={t("home.a11y.destinationImage", {
                    destination: dest.city,
                    landmark: dest.landmark,
                  })}
                  destinationCity={dest.city}
                  fallbackPhotoSrc={landmarkSrc(dest.city, dest.landmark)}
                  photoSrc={destinationPhotoUrls[toDestinationSlug(dest.city)]}
                  sizes="(max-width: 640px) 92vw, (max-width: 1024px) 50vw, 33vw"
                />
                <span className="v2-bento__shade" aria-hidden="true" />
                <span className="v2-bento__meta">
                  <strong>{dest.city}</strong>
                  <span>
                    {t("home.fromPrice", {
                      price: dest.price,
                      nights: `${dest.tripNights} ${
                        dest.tripNights === 1 ? t("deals.night") : t("deals.nights")
                      }`,
                    })}
                  </span>
                </span>
                {dest.drop !== null ? <span className="v2-bento__drop">↓ {dest.drop}%</span> : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* ---------- Section 5 of 8 · Travel rhythms — hover-accordion slices ---------- */}
      <section className="v2-rhythms" aria-label={t("home.a11y.tripStyles")}>
        <div className="v2-rhythms__head" data-reveal>
          <p className="v2-eyebrow">{t("home.rhythmsKicker")}</p>
          <h2>{t("home.rhythmsTitle")}</h2>
        </div>
        <div className="v2-rhythms__slices" data-reveal>
          {RHYTHMS.map((rhythm) => (
            <Link
              className="v2-rhythms__slice"
              href={buildRhythmSearchHref(rhythm.key, locale)}
              key={rhythm.key}
            >
              <DestinationVisual
                alt={t(`home.rhythm.${rhythm.key === "week" ? "week" : rhythm.key}`)}
                destinationCity={rhythm.city}
                fallbackPhotoSrc={landmarkSrc(rhythm.city, rhythm.landmark)}
                photoSrc={destinationPhotoUrls[toDestinationSlug(rhythm.city)]}
                sizes="(max-width: 640px) 92vw, (max-width: 1024px) 50vw, 33vw"
              />
              <span className="v2-rhythms__shade" aria-hidden="true" />
              <span className="v2-rhythms__copy">
                <strong>{t(`home.rhythm.${rhythm.key === "week" ? "week" : rhythm.key}`)}</strong>
                <em>{t(`home.rhythm.${rhythm.key === "week" ? "week" : rhythm.key}Note`)}</em>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------- Testimonials — two counter-drifting marquee rows ---------- */}
      <section className="v2-testimonials" aria-label={t("home.testimonialsKicker")}>
        <div className="v2-testimonials__head">
          <p className="v2-eyebrow">{t("home.testimonialsKicker")}</p>
          <h2>
            {t("home.testimonialsTitle")} <em>{t("home.testimonialsEm")}</em>
          </h2>
        </div>
        {[
          // Six unique quotes per row keeps the repeating group wider than
          // the viewport (no gaps) while the two rows share no testimonials.
          { testimonials: [...TESTIMONIALS_ROW_A, ...TESTIMONIALS_ROW_A_EXTRA], reverse: false },
          { testimonials: TESTIMONIALS_ROW_B, reverse: true },
        ].map(({ testimonials, reverse }, rowIndex) => (
          <div
            className={`v2-testimonials__row${reverse ? " v2-testimonials__row--reverse" : ""}`}
            key={rowIndex}
          >
            <div className="v2-testimonials__track" aria-hidden={undefined}>
              {[0, 1].map((copy) => (
                <div
                  aria-hidden={copy === 1 ? "true" : undefined}
                  className="v2-testimonials__group"
                  key={copy}
                >
                  {testimonials.map((testimonial) => (
                    <figure className="v2-tcard" key={`${copy}-${testimonial.name}`}>
                      <span className="v2-tcard__mark" aria-hidden="true">
                        “
                      </span>
                      <blockquote>{t(testimonial.quoteKey)}</blockquote>
                      <figcaption>
                        <span className={`v2-tcard__avatar v2-tcard__avatar--${testimonial.tone}`}>
                          <img alt="" loading="lazy" src={testimonial.photo} />
                        </span>
                        <span className="v2-tcard__id">
                          <strong>{testimonial.name}</strong>
                          <small>
                            {t("home.testimonialRole", { location: testimonial.location })}
                          </small>
                        </span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <V2BottomSections />
    </div>
  );
}
