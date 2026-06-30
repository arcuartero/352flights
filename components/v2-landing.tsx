"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { LanguageSelector } from "@/components/language-selector";
import { V2AlertsModal } from "@/components/v2-alerts";
import { V2BottomSections } from "@/components/v2-bottom-sections";
import { useI18n } from "@/lib/i18n";
import { toDestinationSlug } from "@/lib/destination-slugs";
import type { HomeBoardDestination } from "@/lib/home-board";
import { getMatchingLuxSchoolHoliday } from "@/lib/lux-school-holidays";
import type { CampaignPreviewDeal } from "@/lib/ops-shared";
import {
  buildDealsSearchHref,
  DEFAULT_DEAL_SEARCH_FILTERS,
  type BudgetFilter,
  type DealSearchFilters,
  type TripFilter,
  type WhenFilter,
} from "@/lib/public-deals-search";

const TICKER_FARES = [
  { route: "LUX → LIS", price: "€39", drop: "−47%" },
  { route: "LUX → BCN", price: "€36", drop: "−38%" },
  { route: "LUX → FCO", price: "€44", drop: "−41%" },
  { route: "LUX → OPO", price: "€42", drop: "−36%" },
  { route: "LUX → BUD", price: "€49", drop: "−35%" },
  { route: "LUX → CPH", price: "€58", drop: "−29%" },
  { route: "LUX → MXP", price: "€31", drop: "−47%" },
  { route: "LUX → VIE", price: "€54", drop: "−27%" },
];

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
    city: "Palma",
    landmark: "Palma Cathedral",
  },
];

type Testimonial = {
  quote: string;
  name: string;
  role: string;
  photo: string;
  tone: "blue" | "red" | "sand";
};

const TESTIMONIALS_ROW_A: Testimonial[] = [
  {
    quote:
      "Lisbon for thirty-nine euros. I booked it from the bus before the email was even finished.",
    name: "Claire Muller",
    role: "Subscriber · Luxembourg City",
    photo: "/v2-avatars/claire.jpg",
    tone: "blue",
  },
  {
    quote:
      "It's the only travel email I keep. One fare, the reason it's cheap, and the dates. Done.",
    name: "Tomás Ferreira",
    role: "Subscriber · Esch-sur-Alzette",
    photo: "/v2-avatars/tomas.jpg",
    tone: "red",
  },
  {
    quote:
      "Three trips this year I would never have caught myself. The school-holiday matches are gold.",
    name: "Anne Weber",
    role: "Subscriber · Differdange",
    photo: "/v2-avatars/anne.jpg",
    tone: "sand",
  },
];

const TESTIMONIALS_ROW_A_EXTRA: Testimonial[] = [
  {
    quote:
      "I stopped checking five apps every night. If something out of LUX is truly cheap, it lands in my inbox.",
    name: "Marc Hoffmann",
    role: "Subscriber · Dudelange",
    photo: "/v2-avatars/marc.jpg",
    tone: "red",
  },
  {
    quote:
      "Milan for €31 on a direct flight. My colleagues didn't believe the screenshot.",
    name: "Sofia Ricci",
    role: "Subscriber · Kirchberg",
    photo: "/v2-avatars/sofia.jpg",
    tone: "blue",
  },
  {
    quote:
      "Short, honest, and it respects my time. The price history line convinces me every time.",
    name: "Ben Kayser",
    role: "Subscriber · Ettelbruck",
    photo: "/v2-avatars/ben.jpg",
    tone: "sand",
  },
];

const TESTIMONIALS_ROW_B: Testimonial[] = [
  {
    quote:
      "Porto in October for less than a dinner out. We walked the Ribeira wondering why it was so cheap.",
    name: "Lena Schmit",
    role: "Subscriber · Mersch",
    photo: "/v2-avatars/lena.jpg",
    tone: "blue",
  },
  {
    quote:
      "Two clicks from the email to the airline checkout. No portals, no tricks, the real fare.",
    name: "Paul Reuter",
    role: "Subscriber · Bertrange",
    photo: "/v2-avatars/paul.jpg",
    tone: "sand",
  },
  {
    quote:
      "Budapest with the kids during the Toussaint break. The dates matched the school calendar exactly.",
    name: "Marta Silva",
    role: "Subscriber · Bonnevoie",
    photo: "/v2-avatars/marta.jpg",
    tone: "red",
  },
  {
    quote:
      "I used to think LUX was always expensive. Turns out I was just looking on the wrong days.",
    name: "David Klein",
    role: "Subscriber · Strassen",
    photo: "/v2-avatars/david.jpg",
    tone: "blue",
  },
  {
    quote:
      "Vienna for a long weekend, booked on a Tuesday over coffee. It felt almost too easy.",
    name: "Julie Thill",
    role: "Subscriber · Remich",
    photo: "/v2-avatars/julie.jpg",
    tone: "red",
  },
  {
    quote:
      "The only newsletter I open within the minute. Cheap fares from here really do expire fast.",
    name: "Nico Wagner",
    role: "Subscriber · Echternach",
    photo: "/v2-avatars/nico.jpg",
    tone: "sand",
  },
];

function landmarkSrc(city: string, landmark: string) {
  const params = new URLSearchParams({ city, landmark });
  return `/api/landmark-photo?${params.toString()}`;
}

function buildRhythmSearchHref(key: string) {
  switch (key) {
    case "weekend":
      return buildDealsSearchHref({
        ...DEFAULT_DEAL_SEARCH_FILTERS,
        tripFilter: "weekend",
      });
    case "week":
      return buildDealsSearchHref({
        ...DEFAULT_DEAL_SEARCH_FILTERS,
        tripFilter: "weeklong",
      });
    case "school":
      return buildDealsSearchHref({
        ...DEFAULT_DEAL_SEARCH_FILTERS,
        whenFilter: "school_holidays",
      });
    case "beach":
      return buildDealsSearchHref({
        ...DEFAULT_DEAL_SEARCH_FILTERS,
        themeFilter: "beach",
      });
    default:
      return "/deals/search";
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
};

function normalizeDestinationKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function matchesWhenFilter(deal: CampaignPreviewDeal, whenFilter: WhenFilter, now: Date) {
  const departure = deal.departureDate ? new Date(deal.departureDate) : null;
  if (!departure || Number.isNaN(departure.getTime())) {
    return whenFilter === "any";
  }

  const departureMonth = departure.getMonth();
  const daysUntilDeparture = Math.ceil((departure.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  const weekday = departure.getDay();

  switch (whenFilter) {
    case "next_30":
      return daysUntilDeparture >= 0 && daysUntilDeparture <= 30;
    case "may_aug":
      return departureMonth >= 4 && departureMonth <= 7;
    case "school_holidays":
      return Boolean(getMatchingLuxSchoolHoliday(deal.departureDate, deal.returnDate));
    case "this_weekend":
      return daysUntilDeparture >= 0 && daysUntilDeparture <= 28 && [4, 5, 6].includes(weekday);
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

function matchesBudgetFilter(deal: CampaignPreviewDeal, budgetFilter: BudgetFilter) {
  if (budgetFilter === "any") {
    return true;
  }

  return deal.dealPrice <= Number(budgetFilter);
}

function matchesHomeSearchFilters(
  deal: CampaignPreviewDeal,
  filters: DealSearchFilters,
  now: Date,
) {
  if (deal.dealPrice <= 0) {
    return false;
  }

  if (!matchesWhenFilter(deal, filters.whenFilter, now)) {
    return false;
  }

  if (!matchesTripFilter(deal, filters.tripFilter)) {
    return false;
  }

  if (!matchesBudgetFilter(deal, filters.budgetFilter)) {
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

export function V2Landing({ boardDestinations = [], deals = [] }: V2LandingProps) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const heroMediaRef = useRef<HTMLDivElement | null>(null);
  const [filters, setFilters] = useState<DealSearchFilters>(DEFAULT_DEAL_SEARCH_FILTERS);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const now = useMemo(() => new Date(), []);

  useReveal(rootRef);
  useParallax(heroMediaRef, 0.1);

  const searchHref = useMemo(() => buildDealsSearchHref(filters), [filters]);
  const searchWhenOptions: Array<{ value: WhenFilter; label: string }> = [
    { value: "any", label: t("common.anytime") },
    { value: "this_weekend", label: t("common.thisWeekend") },
    { value: "next_30", label: t("common.next30") },
    { value: "may_aug", label: t("common.mayAug") },
    { value: "school_holidays", label: t("common.schoolHolidays") },
  ];
  const searchTripOptions: Array<{ value: TripFilter; label: string }> = [
    { value: "any", label: t("common.anyTrip") },
    { value: "weekend", label: t("common.weekend") },
    { value: "weeklong", label: t("common.weeklong") },
    { value: "long_stay", label: t("common.longStay") },
  ];
  const searchBudgetOptions: Array<{ value: BudgetFilter; label: string }> = [
    { value: "any", label: t("common.anyBudget") },
    { value: "50", label: t("common.under50") },
    { value: "80", label: t("common.under80") },
    { value: "120", label: t("common.under120") },
    { value: "200", label: t("common.under200") },
  ];
  const destinationOptions = useMemo(() => {
    const filtersWithoutDestination = {
      ...filters,
      destinationFilter: "any",
    };
    const availableCities = deals
      .filter((deal) => matchesHomeSearchFilters(deal, filtersWithoutDestination, now))
      .map((deal) => deal.destinationCity?.trim() ?? "")
      .filter((city) => city.length > 0);
    const uniqueCities = [...new Set(availableCities.map((city) => normalizeDestinationKey(city)))]
      .map((cityKey) => availableCities.find((city) => normalizeDestinationKey(city) === cityKey) ?? cityKey)
      .sort((left, right) => left.localeCompare(right, "en"));

    return [
      { value: "any", label: t("common.anyDestination") },
      ...uniqueCities.map((city) => ({
        value: normalizeDestinationKey(city),
        label: city,
      })),
    ];
  }, [deals, filters, now, t]);

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

  const selectedDestinationLabel =
    destinationOptions.find((option) => option.value === filters.destinationFilter)?.label ??
    t("common.anyDestination");
  const selectedWhenLabel =
    searchWhenOptions.find((option) => option.value === filters.whenFilter)?.label ?? t("common.anytime");
  const selectedTripLabel =
    searchTripOptions.find((option) => option.value === filters.tripFilter)?.label ?? t("common.anyTrip");
  const selectedBudgetLabel =
    searchBudgetOptions.find((option) => option.value === filters.budgetFilter)?.label ?? t("common.anyBudget");
  const mobileDestinationLabel =
    filters.destinationFilter === "any" ? t("home.searchChooseDestination") : selectedDestinationLabel;
  const mobileWhenLabel = filters.whenFilter === "any" ? t("home.searchChooseDates") : selectedWhenLabel;
  const mobileTripLabel = filters.tripFilter === "any" ? t("common.tripType") : selectedTripLabel;
  const mobileBudgetLabel =
    filters.budgetFilter === "any" ? t("common.budgetMax") : selectedBudgetLabel;

  return (
    <div className="v2" ref={rootRef}>
      {/* ---------- Section 1 of 8 · Hero — giant statement, stacked center ---------- */}
      <header className="v2-topbar">
        <Link className="v2-topbar__brand" href="/" aria-label="352 Flights">
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

      <section className="v2-hero" aria-label="Introduction">
        <div className="v2-hero__canvas" data-reveal ref={heroMediaRef}>
          <img
            alt="Traveler holding a passport in the airplane cabin"
            className="v2-hero__photo"
            src="/deals-hero-airplane-cabin-3.jpeg"
          />
          <span className="v2-hero__overlay" aria-hidden="true" />

          <div className="v2-hero__fare" aria-hidden="true">
            <div className="v2-hero__fare-card">
              <strong>LUX → FCO</strong>
              <span>{t("home.fareSubline")}</span>
              <em>€44</em>
              <i className="v2-hero__fare-plane">
                <svg fill="currentColor" viewBox="0 0 24 24">
                  <path d="M21.5 15.5v-2.2l-8.2-5V3.6a1.3 1.3 0 0 0-2.6 0v4.7l-8.2 5v2.2l8.2-2.6v5l-2.1 1.6v1.7l3.4-1 3.4 1v-1.7l-2.1-1.6v-5z" />
                </svg>
              </i>
            </div>
            <svg className="v2-hero__fare-arrow" viewBox="0 0 120 90">
              <path
                d="M8 84 C 34 72, 76 62, 100 26"
                fill="none"
                stroke="currentColor"
                strokeDasharray="2 7"
                strokeLinecap="round"
                strokeWidth="3"
              />
              <path
                d="M100 26l-10.5 1.5M100 26l-2.5 10.5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="3"
              />
            </svg>
          </div>

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
            <ul className="v2-hero__trust" data-reveal style={{ "--d": "380ms" } as React.CSSProperties}>
              <li>
                <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2.5l7.5 3.4v5.6c0 4.7-3.2 8-7.5 9.5-4.3-1.5-7.5-4.8-7.5-9.5V5.9z" />
                  <path d="M9 12l2.2 2.2L15.5 9.8" />
                </svg>
                {t("home.noSpam")}
              </li>
              <li>
                <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" />
                </svg>
                {t("home.bestFares")}
              </li>
              <li>
                <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 21.5s-7-5.8-7-11a7 7 0 0 1 14 0c0 5.2-7 11-7 11z" />
                  <circle cx="12" cy="10.2" r="2.4" />
                </svg>
                {t("home.luxDepartures")}
              </li>
            </ul>
          </div>

          {/* Search — same engine as the /deals home, docked inside the hero card */}
          <div className="v2-search__bar" data-reveal id="v2-search" style={{ "--d": "440ms" } as React.CSSProperties}>
          <div className="v2-search__field v2-search__field--origin">
            <span>{t("common.from")}</span>
            <strong>Luxembourg</strong>
          </div>
          <label className="v2-search__field v2-search__field--destination" data-mobile-value={mobileDestinationLabel}>
            <span>{t("common.to")}</span>
            <select
              onChange={(event) =>
                setFilters((current) => ({ ...current, destinationFilter: event.target.value }))
              }
              value={filters.destinationFilter}
            >
              {destinationOptions.map((destination) => (
                <option key={destination.value} value={destination.value}>
                  {destination.label}
                </option>
              ))}
            </select>
          </label>
          <label className="v2-search__field v2-search__field--when" data-mobile-value={mobileWhenLabel}>
            <span>{t("common.when")}</span>
            <select
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  whenFilter: event.target.value as WhenFilter,
                }))
              }
              value={filters.whenFilter}
            >
              {searchWhenOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="v2-search__field v2-search__field--trip" data-mobile-value={mobileTripLabel}>
            <span>{t("common.tripType")}</span>
            <select
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  tripFilter: event.target.value as TripFilter,
                }))
              }
              value={filters.tripFilter}
            >
              {searchTripOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="v2-search__field v2-search__field--budget" data-mobile-value={mobileBudgetLabel}>
            <span>{t("common.budgetMax")}</span>
            <select
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  budgetFilter: event.target.value as BudgetFilter,
                }))
              }
              value={filters.budgetFilter}
            >
              {searchBudgetOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
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
          <Link className="v2-search__cta" href={searchHref}>
            {t("common.viewDeals")}
          </Link>
          </div>
        </div>
      </section>

      {/* ---------- Section 2 of 8 · Departure board — infinite marquee strip ---------- */}
      <section className="v2-ticker" id="v2-board" aria-label={t("home.recentDrops")}>
        <div className="v2-ticker__track" aria-hidden="true">
          {[0, 1].map((copy) => (
            <ul className="v2-ticker__group" key={copy}>
              {TICKER_FARES.map((fare) => (
                <li key={`${copy}-${fare.route}`}>
                  <span className="v2-ticker__route">{fare.route}</span>
                  <span className="v2-ticker__price">{fare.price}</span>
                  <span className="v2-ticker__drop">{fare.drop}</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
        <p className="sr-only">
          {t("home.recentDrops")}: {TICKER_FARES.map((fare) => `${fare.route} ${fare.price}`).join(", ")}
        </p>
      </section>

      {boardDestinations.length > 0 ? (
        <section className="v2-bento" aria-label="Destinations on the board">
          <div className="v2-bento__head" data-reveal>
            <h2>{t("home.boardTitle")}</h2>
          </div>
          <div className="v2-bento__grid">
            {boardDestinations.map((dest, i) => (
              <Link
                className="v2-bento__cell"
                data-reveal
                href={`/deals/${toDestinationSlug(dest.city)}?destination=${toDestinationSlug(dest.city)}`}
                key={dest.city}
                style={{ "--d": `${i * 90}ms` } as React.CSSProperties}
              >
                <img alt={`${dest.city} — ${dest.landmark}`} loading="lazy" src={landmarkSrc(dest.city, dest.landmark)} />
                <span className="v2-bento__shade" aria-hidden="true" />
                <span className="v2-bento__meta">
                  <strong>{dest.city}</strong>
                  <span>
                    {t("home.fromPrice", { price: dest.price, nights: dest.nights })}
                  </span>
                </span>
                {dest.drop !== null ? <span className="v2-bento__drop">↓ {dest.drop}%</span> : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* ---------- Section 5 of 8 · Travel rhythms — hover-accordion slices ---------- */}
      <section className="v2-rhythms" aria-label="Trip styles">
        <div className="v2-rhythms__head" data-reveal>
          <p className="v2-eyebrow">{t("home.rhythmsKicker")}</p>
          <h2>{t("home.rhythmsTitle")}</h2>
        </div>
        <div className="v2-rhythms__slices" data-reveal>
          {RHYTHMS.map((rhythm) => (
            <Link className="v2-rhythms__slice" href={buildRhythmSearchHref(rhythm.key)} key={rhythm.key}>
              <img alt={rhythm.label} loading="lazy" src={landmarkSrc(rhythm.city, rhythm.landmark)} />
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
                      <blockquote>{testimonial.quote}</blockquote>
                      <figcaption>
                        <span className={`v2-tcard__avatar v2-tcard__avatar--${testimonial.tone}`}>
                          <img alt="" loading="lazy" src={testimonial.photo} />
                        </span>
                        <span className="v2-tcard__id">
                          <strong>{testimonial.name}</strong>
                          <small>{testimonial.role}</small>
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
