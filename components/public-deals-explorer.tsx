"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { DestinationVisual as LandmarkPhoto } from "@/components/public-destination-visual";
import { NewsletterForm } from "@/components/newsletter-form";
import {
  PublicDealsSelect as DealsSelect,
  type PublicDealsSelectOption as SelectOption,
} from "@/components/public-deals-select";
import {
  getDestinationHeroDescription as getSeoDestinationHeroDescription,
  getDestinationTheme,
} from "@/lib/destination-content";
import { toDestinationSlug } from "@/lib/destination-slugs";
import { useI18n, type Locale } from "@/lib/i18n";
import type { PublicDealsPageData } from "@/lib/ops";
import type { CampaignPreviewDeal } from "@/lib/ops-shared";
import { getMatchingLuxSchoolHoliday } from "@/lib/lux-school-holidays";
import {
  buildDealsSearchHref,
  DEFAULT_DEAL_SEARCH_FILTERS,
  DEFAULT_DEAL_SEARCH_SORT,
  type BudgetFilter,
  type DealSearchSort,
  type DepartureWeekdayFilter,
  type DealSearchFilters,
  type ThemeFilter,
  type TripFilter,
  type WhenFilter,
} from "@/lib/public-deals-search";
import { formatStayBucketLabel } from "@/lib/stay-buckets";

type PublicDealsExplorerProps = {
  data: PublicDealsPageData;
  initialFilters?: DealSearchFilters;
  initialSort?: DealSearchSort;
  mode?: "landing" | "results" | "city";
  lockedDestinationCity?: string;
  searchPathname?: string;
};

type QuickChip =
  | "weekend"
  | "this_weekend"
  | "weeklong"
  | "school_holidays"
  | "under_50"
  | "cheap_direct"
  | "direct"
  | "beach"
  | "city"
  | "nature";

type TravelStyleCard = {
  key: string;
  label: string;
  description: string;
  hint: string;
  fromPrice: number | null;
  matches: number;
  chip: QuickChip | null;
  icon: string;
  accentClass: string;
  imageCity: string;
  imageLandmarkTitle: string;
};

type SearchCityGroup = {
  key: string;
  city: string;
  airport: string;
  deals: CampaignPreviewDeal[];
  lowestPrice: number;
};

type FooterLink = {
  href: string;
  label: string;
};

type FooterSocial = {
  label: string;
  icon: string;
};

type Translate = (key: string, values?: Record<string, string | number>) => string;

const AIRPORT_TIME_ZONE_BY_CODE: Record<string, string> = {
  AGA: "Africa/Casablanca",
  AGP: "Europe/Madrid",
  AJA: "Europe/Paris",
  ALC: "Europe/Madrid",
  AMS: "Europe/Amsterdam",
  ATH: "Europe/Athens",
  AUH: "Asia/Dubai",
  AYT: "Europe/Istanbul",
  BCN: "Europe/Madrid",
  BER: "Europe/Berlin",
  BUD: "Europe/Budapest",
  CDG: "Europe/Paris",
  CFU: "Europe/Athens",
  CHQ: "Europe/Athens",
  CLY: "Europe/Paris",
  CPH: "Europe/Copenhagen",
  DJE: "Africa/Tunis",
  DUB: "Europe/Dublin",
  DXB: "Asia/Dubai",
  EDI: "Europe/London",
  EWR: "America/New_York",
  FAO: "Europe/Lisbon",
  FCO: "Europe/Rome",
  FNC: "Atlantic/Madeira",
  FRA: "Europe/Berlin",
  FSC: "Europe/Paris",
  GVA: "Europe/Zurich",
  HEL: "Europe/Helsinki",
  HER: "Europe/Athens",
  HRG: "Africa/Cairo",
  IBZ: "Europe/Madrid",
  IST: "Europe/Istanbul",
  JFK: "America/New_York",
  KGS: "Europe/Athens",
  KRK: "Europe/Warsaw",
  LCY: "Europe/London",
  LGW: "Europe/London",
  LHR: "Europe/London",
  LIN: "Europe/Rome",
  LIS: "Europe/Lisbon",
  LJU: "Europe/Ljubljana",
  LPA: "Atlantic/Canary",
  LUX: "Europe/Luxembourg",
  MAD: "Europe/Madrid",
  MAN: "Europe/London",
  MLA: "Europe/Malta",
  MUC: "Europe/Berlin",
  MXP: "Europe/Rome",
  NCE: "Europe/Paris",
  NRT: "Asia/Tokyo",
  OPO: "Europe/Lisbon",
  OSL: "Europe/Oslo",
  OTP: "Europe/Bucharest",
  PMI: "Europe/Madrid",
  PRG: "Europe/Prague",
  PSR: "Europe/Rome",
  RAK: "Africa/Casablanca",
  RHO: "Europe/Athens",
  RMI: "Europe/Rome",
  ARN: "Europe/Stockholm",
  STN: "Europe/London",
  SVQ: "Europe/Madrid",
  TFS: "Atlantic/Canary",
  TUN: "Africa/Tunis",
  VLC: "Europe/Madrid",
  VIE: "Europe/Vienna",
  WAW: "Europe/Warsaw",
  XRY: "Europe/Madrid",
  ZAD: "Europe/Zagreb",
  ZRH: "Europe/Zurich",
};

function getIntlLocale(locale: Locale) {
  switch (locale) {
    case "fr":
      return "fr-FR";
    case "de":
      return "de-DE";
    case "pt":
      return "pt-PT";
    case "it":
      return "it-IT";
    case "es":
      return "es-ES";
    case "en":
    default:
      return "en-GB";
  }
}

const LANDMARK_TITLE_BY_DESTINATION: Record<string, string> = {
  agadir: "Kasbah of Agadir Oufella",
  ajaccio: "Citadel of Ajaccio",
  antalya: "Hadrian's Gate",
  "abu dhabi": "Sheikh Zayed Grand Mosque",
  barcelona: "Sagrada Familia",
  berlin: "Brandenburg Gate",
  bordeaux: "Place de la Bourse",
  cagliari: "Saint Remy's Bastion",
  corfu: "Old Fortress, Corfu",
  copenhagen: "The Little Mermaid",
  djerba: "El Ghriba Synagogue",
  dublin: "Ha'penny Bridge",
  dubai: "Dubai Fountain",
  edinburgh: "Edinburgh Castle",
  faro: "Arco da Vila",
  florence: "Ponte Vecchio",
  heraklion: "Knossos",
  hurghada: "El Mina Mosque",
  istanbul: "Hagia Sophia",
  "jerez de la frontera": "Alcazar of Jerez de la Frontera",
  kos: "Neratzia Castle",
  lisbon: "Belem Tower",
  london: "Big Ben",
  madrid: "Puerta de Alcala",
  malaga: "Alcazaba of Malaga",
  malta: "St. John's Co-Cathedral",
  marrakech: "Koutoubia Mosque",
  milan: "Milan Cathedral",
  munich: "Marienplatz",
  mykonos: "Windmills of Mykonos",
  nice: "Place Massena",
  "new york": "Brooklyn Bridge",
  palma: "Palma Cathedral",
  paris: "Pont Alexandre III",
  porto: "Dom Luis I Bridge",
  rimini: "Arch of Augustus",
  rome: "Colosseum",
  stockholm: "Stockholm City Hall",
  stuttgart: "Schlossplatz",
  tunis: "Al-Zaytuna Mosque",
  valencia: "City of Arts and Sciences",
  vienna: "Schonbrunn Palace",
  warsaw: "Royal Castle, Warsaw",
  zurich: "Quaibrucke, Zurich",
  zadar: "Sea Organ",
};

const WHEN_OPTIONS: SelectOption[] = [
  { value: "any", label: "Anytime" },
  { value: "this_weekend", label: "This weekend" },
  { value: "next_30", label: "Next 30 days" },
  { value: "may_aug", label: "May to August" },
  { value: "school_holidays", label: "School holidays" },
];

const TRIP_OPTIONS: SelectOption[] = [
  { value: "any", label: "Any trip" },
  { value: "weekend", label: "Weekend" },
  { value: "weeklong", label: "5 to 7 nights" },
  { value: "long_stay", label: "Long stay" },
];

const BUDGET_OPTIONS: SelectOption[] = [
  { value: "any", label: "Any budget" },
  { value: "50", label: "Under EUR 50" },
  { value: "80", label: "Under EUR 80" },
  { value: "120", label: "Under EUR 120" },
  { value: "200", label: "Under EUR 200" },
];

const DEPARTURE_WEEKDAY_OPTIONS: SelectOption[] = [
  { value: "any", label: "Any day" },
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

const DEAL_SORT_OPTIONS: SelectOption[] = [
  { value: "price_asc", label: "Price: lowest first" },
  { value: "price_desc", label: "Price: highest first" },
  { value: "departure_soonest", label: "Departure: soonest first" },
  { value: "departure_latest", label: "Departure: latest first" },
  { value: "trip_shortest", label: "Trip length: shortest first" },
  { value: "trip_longest", label: "Trip length: longest first" },
];

const QUICK_CHIP_OPTIONS: QuickChip[] = [
  "weekend",
  "this_weekend",
  "weeklong",
  "school_holidays",
  "under_50",
  "cheap_direct",
  "direct",
  "beach",
  "city",
  "nature",
];

const SEARCH_QUICK_CHIPS: QuickChip[] = [
  "this_weekend",
  "weeklong",
  "school_holidays",
  "under_50",
  "direct",
  "beach",
  "city",
  "nature",
];

const RESULTS_PAGE_SIZE = 12;

const THEME_BY_DESTINATION: Record<string, ThemeFilter> = {
  agadir: "beach",
  ajaccio: "beach",
  antalya: "beach",
  "abu dhabi": "city",
  barcelona: "city",
  berlin: "city",
  bordeaux: "city",
  cagliari: "beach",
  corfu: "beach",
  copenhagen: "city",
  djerba: "beach",
  dublin: "city",
  dubai: "city",
  edinburgh: "city",
  florence: "city",
  heraklion: "beach",
  hurghada: "beach",
  istanbul: "city",
  "jerez de la frontera": "city",
  kos: "beach",
  lisbon: "city",
  london: "city",
  madrid: "city",
  malaga: "beach",
  marrakech: "city",
  milan: "city",
  munich: "city",
  mykonos: "beach",
  nice: "beach",
  "new york": "city",
  palma: "beach",
  paris: "city",
  porto: "city",
  rimini: "beach",
  rome: "city",
  stockholm: "city",
  stuttgart: "city",
  tunis: "city",
  valencia: "beach",
  vienna: "city",
  warsaw: "city",
  zurich: "nature",
  zadar: "nature",
};

const DESTINATION_ESCAPE_LABEL_BY_DESTINATION: Record<string, string> = {
  milan: "Italian escape",
  florence: "Tuscan escape",
  rome: "Italian city break",
  barcelona: "Spanish city break",
  madrid: "Spanish escape",
  malaga: "Costa del Sol break",
  valencia: "Mediterranean city break",
  lisbon: "Portuguese escape",
  porto: "Portuguese city break",
  paris: "Paris escape",
  london: "London break",
  dublin: "Irish break",
  edinburgh: "Scottish escape",
  berlin: "German city break",
  munich: "Bavarian escape",
  vienna: "Austrian city break",
  stockholm: "Scandinavian escape",
  copenhagen: "Nordic city break",
  zurich: "Swiss escape",
  warsaw: "Polish city break",
  nice: "French Riviera escape",
  marrakech: "Moroccan escape",
  dubai: "Gulf escape",
  "new york": "New York getaway",
  palma: "Mallorca escape",
  mykonos: "Greek island escape",
  corfu: "Greek island break",
  cagliari: "Sardinian escape",
  kos: "Greek beach break",
  heraklion: "Cretan escape",
  antalya: "Turkish Riviera escape",
  agadir: "Atlantic coast escape",
  ajaccio: "Corsican escape",
  djerba: "island break",
  hurghada: "Red Sea escape",
  zadar: "Croatian coast break",
  rimini: "Italian seaside break",
  tunis: "North African city break",
  bordeaux: "French city break",
  istanbul: "cross-continental escape",
  "abu dhabi": "desert city break",
};

const DEALS_FOOTER_LINKS: FooterLink[] = [
  { href: "/privacy", label: "Privacy policy" },
  { href: "/cookies", label: "Cookies" },
  { href: "/terms", label: "Terms" },
];

const DEALS_FOOTER_SOCIALS: FooterSocial[] = [
  { label: "Instagram", icon: "◎" },
  { label: "TikTok", icon: "♪" },
  { label: "LinkedIn", icon: "in" },
];

const HERO_REFERENCE_CARDS = [
  {
    city: "Rome",
    price: "€68",
    landmarkTitle: "Colosseum",
  },
  {
    city: "Lisbon",
    price: "€55",
    landmarkTitle: "Belem Tower",
  },
  {
    city: "Budapest",
    price: "€39",
    landmarkTitle: "Hungarian Parliament Building",
  },
] as const;

const AIRLINE_LOGO_CODE_BY_NAME: Record<string, string> = {
  aegean: "A3",
  "aegean airlines": "A3",
  "air europa": "UX",
  "air france": "AF",
  "air malta": "KM",
  "air serbia": "JU",
  "austrian airlines": "OS",
  "british airways": "BA",
  "brussels airlines": "SN",
  condor: "DE",
  easyjet: "U2",
  emirates: "EK",
  etihad: "EY",
  eurowings: "EW",
  iberia: "IB",
  klm: "KL",
  lot: "LO",
  "lot polish airlines": "LO",
  lufthansa: "LH",
  luxair: "LG",
  norwegian: "DY",
  "pegasus airlines": "PC",
  ryanair: "FR",
  sas: "SK",
  "scandinavian airlines": "SK",
  swiss: "LX",
  "swiss international air lines": "LX",
  "tap air portugal": "TP",
  transavia: "HV",
  "tui fly": "TB",
  "turkish airlines": "TK",
  volotea: "V7",
  vueling: "VY",
  "wizz air": "W6",
};

function normalizeDestinationKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function formatCurrency(value: number, currency: string = "EUR") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateWithWeekday(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateWithoutWeekday(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatFlightClock(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function parseLocalDateTimeParts(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
  };
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const values = new Map(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.get("year")),
    Number(values.get("month")) - 1,
    Number(values.get("day")),
    Number(values.get("hour")),
    Number(values.get("minute")),
    Number(values.get("second")),
  );

  return (asUtc - date.getTime()) / 60000;
}

function localAirportDateTimeToUtcMs(value: string, airportCode: string) {
  const timeZone = AIRPORT_TIME_ZONE_BY_CODE[airportCode.toUpperCase()];
  const parts = parseLocalDateTimeParts(value);
  if (!timeZone || !parts) {
    return new Date(value).getTime();
  }

  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
  let utcMs = localAsUtc;

  for (let index = 0; index < 2; index += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcMs), timeZone);
    utcMs = localAsUtc - offsetMinutes * 60000;
  }

  return utcMs;
}

function formatFlightDuration(
  start: string | null,
  end: string | null,
  startAirportCode: string,
  endAirportCode: string,
) {
  if (!start || !end) {
    return null;
  }

  const diffMs =
    localAirportDateTimeToUtcMs(end, endAirportCode) -
    localAirportDateTimeToUtcMs(start, startAirportCode);

  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return null;
  }

  const totalMinutes = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  return `${minutes}m`;
}

function formatStayHours(value: number | null, nights: number) {
  if (value === null) {
    return `${nights} nights`;
  }

  const rounded = Math.max(0, Math.round(value));
  const days = Math.floor(rounded / 24);
  const hours = rounded % 24;

  if (days > 0 && hours > 0) {
    return `${days}d ${hours}h`;
  }

  if (days > 0) {
    return `${days}d`;
  }

  return `${hours}h`;
}

function formatVerifiedAge(value: string | null, t?: Translate, now: Date = new Date()) {
  if (!value) {
    return t ? t("deals.verifiedFresh") : "Freshly checked";
  }

  const diffMs = now.getTime() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 60_000) {
    return t ? t("deals.verifiedJustNow") : "Verified just now";
  }

  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 60) {
    return t ? t("deals.verifiedMinutesAgo", { count: diffMinutes }) : `Verified ${diffMinutes} min ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return t ? t("deals.verifiedHoursAgo", { count: diffHours }) : `Verified ${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return t ? t("deals.verifiedDaysAgo", { count: diffDays }) : `Verified ${diffDays}d ago`;
}

function formatDepartureMonth(value: string | null) {
  if (!value) {
    return "flexible dates";
  }

  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
  }).format(new Date(value));
}

function formatSearchSavingsLabel(
  deal: CampaignPreviewDeal,
  t?: Translate,
) {
  const belowPct = Math.max(0, Math.round((1 - (deal.dropRatio ?? 1)) * 100));
  const abovePct = Math.max(0, Math.round(((deal.dropRatio ?? 1) - 1) * 100));

  switch (deal.pricePosition) {
    case "exceptional":
      return t
        ? t("deals.priceExceptional", { pct: belowPct })
        : `Exceptional price · ${belowPct}% below usual`;
    case "below_usual":
      return t
        ? t("deals.priceBelowUsual", { pct: belowPct })
        : `Good price · ${belowPct}% below usual`;
    case "typical":
      return t ? t("deals.priceTypical") : "Around the usual price";
    case "above_usual":
      return t
        ? t("deals.priceAboveUsual", { pct: abovePct })
        : `${abovePct}% above the usual price`;
    case "new_price":
    default:
      return t ? t("deals.priceNew") : "Fresh fare · building price history";
  }
}

function isStrongPriceDeal(deal: CampaignPreviewDeal) {
  return deal.pricePosition === "exceptional" || deal.pricePosition === "below_usual";
}

function getDepartureWeekdayFilterValue(value: string | null): DepartureWeekdayFilter {
  if (!value) {
    return "any";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "any";
  }

  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Luxembourg",
    weekday: "long",
  })
    .format(date)
    .toLowerCase();

  switch (day) {
    case "monday":
    case "tuesday":
    case "wednesday":
    case "thursday":
    case "friday":
    case "saturday":
    case "sunday":
      return day;
    default:
      return "any";
  }
}

function formatDropLine(deal: CampaignPreviewDeal) {
  if (deal.baselinePrice === null || deal.dropRatio === null) {
    return "Fresh Luxembourg fare, checked against the live market.";
  }

  if (deal.pricePosition === "above_usual") {
    const pct = Math.max(0, Math.round((deal.dropRatio - 1) * 100));
    return `Usually around ${formatCurrency(deal.baselinePrice)} · currently ${pct}% above that level.`;
  }

  if (deal.pricePosition === "typical") {
    return `This fare is close to its recent usual price of ${formatCurrency(deal.baselinePrice)}.`;
  }

  const saved = Math.max(0, deal.baselinePrice - deal.dealPrice);
  const pct = Math.max(0, Math.round((1 - deal.dropRatio) * 100));
  return `Usually around ${formatCurrency(deal.baselinePrice)} · save ${formatCurrency(saved)} (${pct}% off).`;
}

function getFareBadgeLabel(deal: CampaignPreviewDeal) {
  if (deal.pricePosition === "new_price") {
    return "New fare";
  }

  if (deal.pricePosition === "typical") {
    return "Typical";
  }

  if (deal.pricePosition === "above_usual") {
    return `+${Math.max(0, Math.round(((deal.dropRatio ?? 1) - 1) * 100))}%`;
  }

  return `${Math.max(0, Math.round((1 - (deal.dropRatio ?? 1)) * 100))}% ↓`;
}

function getTravelStyleVisual(key: string) {
  switch (key) {
    case "weekend":
      return {
        imageCity: "London",
        imageLandmarkTitle: "Tower Bridge",
      };
    case "weeklong":
      return {
        imageCity: "Milan",
        imageLandmarkTitle: "Milan Cathedral",
      };
    case "school":
      return {
        imageCity: "Vienna",
        imageLandmarkTitle: "Schonbrunn Palace",
      };
    case "cheap_direct":
      return {
        imageCity: "Porto",
        imageLandmarkTitle: "Dom Luis I Bridge",
      };
    case "beach":
      return {
        imageCity: "Zadar",
        imageLandmarkTitle: "Sea Organ",
      };
    case "city":
      return {
        imageCity: "Berlin",
        imageLandmarkTitle: "Brandenburg Gate",
      };
    default:
      return {
        imageCity: "Paris",
        imageLandmarkTitle: "Eiffel Tower",
      };
  }
}

function getPublicTripStyle(deal: CampaignPreviewDeal) {
  const bucketKey = normalizeDestinationKey(deal.routeBucket);

  if (bucketKey.includes("weekend")) {
    return "Weekend escape";
  }

  if (deal.tripNights >= 5 && deal.tripNights <= 7) {
    return "One-week trip";
  }

  if (bucketKey.includes("long")) {
    return "Long stay";
  }

  return "Smart fare";
}

function getPublicAirlineLine(deal: CampaignPreviewDeal) {
  if (!deal.airlineSummary) {
    return "From Luxembourg";
  }

  return `From Luxembourg · ${deal.airlineSummary}`;
}

function getDisplayAirlineSummary(deal: CampaignPreviewDeal) {
  if (!deal.airlineSummary) {
    return "Airline pending";
  }

  if (deal.maxStops === "NON_STOP") {
    const [primaryAirline] = deal.airlineSummary
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    return primaryAirline ?? deal.airlineSummary;
  }

  return deal.airlineSummary;
}

function normalizeAirlineName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ");
}

function getPrimaryAirlineName(deal: CampaignPreviewDeal) {
  const displaySummary = getDisplayAirlineSummary(deal);
  const [primaryAirline] = displaySummary
    .split(/,|\+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return primaryAirline ?? displaySummary;
}

function getAirlineLogoCode(airlineName: string) {
  return AIRLINE_LOGO_CODE_BY_NAME[normalizeAirlineName(airlineName)] ?? null;
}

function getAirlineInitials(airlineName: string) {
  return airlineName
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function AirlineLogo({
  airlineName,
}: {
  airlineName: string;
}) {
  const logoCode = getAirlineLogoCode(airlineName);

  return (
    <span className="deals-airline-logo" title={airlineName}>
      {logoCode ? (
        <img
          alt={`${airlineName} logo`}
          loading="lazy"
          src={`https://images.kiwi.com/airlines/64/${logoCode}.png`}
        />
      ) : (
        <span aria-label={`${airlineName} logo`} className="deals-airline-logo__fallback" role="img">
          {getAirlineInitials(airlineName)}
        </span>
      )}
    </span>
  );
}

function getQuickChipState(
  chip: QuickChip,
  filters: DealSearchFilters,
) {
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

function resetQuickChip(
  chip: QuickChip,
  filters: DealSearchFilters,
): DealSearchFilters {
  switch (chip) {
    case "this_weekend":
    case "school_holidays":
      return { ...filters, whenFilter: "any" };
    case "weekend":
    case "weeklong":
      return { ...filters, tripFilter: "any" };
    case "under_50":
    case "cheap_direct":
      return { ...filters, budgetFilter: "any", directOnly: false };
    case "direct":
      return { ...filters, directOnly: false };
    case "beach":
    case "city":
    case "nature":
      return { ...filters, themeFilter: "any" };
  }
}

function SignalIcon({ kind }: { kind: "destinations" | "checked" | "discount" }) {
  if (kind === "destinations") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path
          d="M12 21s6-4.35 6-10a6 6 0 1 0-12 0c0 5.65 6 10 6 10Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <circle cx="12" cy="11" fill="currentColor" r="2.2" />
      </svg>
    );
  }

  if (kind === "checked") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle
          cx="12"
          cy="12"
          fill="none"
          r="8.5"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M8.5 12.2 10.9 14.6 15.6 9.8"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M18 8 13 13 10.5 10.5 6 15"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M14.5 8H18v3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function LuxembourgSealIcon() {
  return (
    <svg aria-hidden="true" viewBox="35 30 910 960">
      <path
        d="M507 113.5l-5.6 18-3.8 17.2-5.1 35 1.4.9 4.8-.5 1.8.3-2.9 4.1-7.5 14.5 8.7 5 5.2 10.3 5 25.9-2.3 13.9 3.5 10.1 13.8 21 12.2 35 6.3 10.8 8.6-17 13.7 22.2 26.3 63.6 12.5 12.7 27.1 12.1 11.7 7.5 3.8 6.8 3.2 8.7 4.8 12.7.8 4.2 6.4.6 12-7.3 7.1.2 13.5 8.6 23 21.9 13.5 8.7 14 3.8 38.4 0 24.6 7.3 3.1.2 4.3 4.7-.2-.3-1.8 1.8 0 10.4-1.2.8-3.8 27-.1 8.7 2.2 5.5-.4 4.8-7.7 6.9-.6 11 1.8 10.1 3.8 8.9 5.7 7.7-6.9-2.8-3.8 1.9-2.7 6 5.5 6.3 1.5 2.7-58.7 38.2-12.4 17.4 1.4 4.1 5.1 3.5 4.9 4.8.7 8.2-2.1 5.5-6 9-8.1 16.7-20.9 25.7-12 19-4.6 13.6 0 39-1.5 11.9-5.3 39.8 2.5 37.2 0 9.1-16-1.7-21.3-11.7-38.1-28.6-1.4-1-21.9-8.8-22.7-2.4-45.9 5.1 5.2 11.3-22.6 2.1-5.7 2.3-4.2 7.5.1 7.9-1.8 6.6-9.7 3.7-7.8 11.8-11.7 4.4-68.2 4.1-13.9 4.6-11-35.2-15-15.2-50.8-12.1-20.1-9.5-13.9-13.1-25.1-33.6 19-9.1 18.3-19.6 7.6-19.3-13.5-7.4 9-8.6 6.3-12.4 10.3-28.4 6.3-7.5 8-7.4 4.4-10.7-4.4-17.6-5.8-4.9-16-1.9-5.5-4.1-2.8-9.1 1.2-4.4 2.3-3.9.5-8.1 1.2-6.8 3.9-4.4 3-5.2-.8-6.6-.3-2.8-4.6-7.4-5.2-.3-5.2 1.7-4.4-.8-4.8-2.7-11.2-3.4-5.1-4.2.3-2.8-1.7-17.3-1.3-5.8-18.8-37.4-5.3-7.9-10.2-6.2-8.5-1.5-8.1-4-8.5-14-4.9-15.6-1.1-14.8 3.5-11.9 9.5-6.4-7.6-7.1 1.4-4.5 1.5-2.9 1.1-3.7-.1-7.2 21 2.2-7.4-11.3-17.7-13.5-9.4-4.6 3.2-11.8 27.7-48.2 3.2-7.9 1.9-6.3 3-6.5 6.3-8.3 5.6-3.8 11.8-2.8 6.6-6.2 8.8-17.1-3.2-6.9-5.7-6.9.9-17.2 5-6.6 16.2-7.2 5.8-6.2 2-9.8 0-11.7-.9-14.4 4.8-7.7 11.6-10.2 4.9-7.1 2-8.5 1.5-20.2 2.9-7.9 13.3-12.1 29.7-14.7 11.9-12.4 6.4-17.9 3.3-17.1 6.8-11.6 17-1.8 12.3-9.8 5.1 5.6 2.7 11.9 4.8 9.2 7.1 3.4 3.5 1.7 9 1.3 18.2-2.9 6.9-4.3 5.2-5.6 6.2-.8 10.3 10 3.5 11.5-.9 11.8 1.8 9.8 11.9 5.4z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="42"
      />
    </svg>
  );
}

function FooterSealHeartIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path
        d="M8 13.3 2.7 8.4a3.4 3.4 0 1 1 4.8-4.8l.5.5.5-.5a3.4 3.4 0 1 1 4.8 4.8L8 13.3Z"
        fill="currentColor"
      />
    </svg>
  );
}

function HeroPlaneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="m20.1 6.7-7 4-4.9-2.2L6 10l4 2.9-4 2.3v1.7l3.8-1.2 2.7 2 1.4-.8-1-2.9 7.2-5.3c.9-.7.8-1.8 0-1.3Z"
        fill="currentColor"
      />
    </svg>
  );
}

function OpportunityCalendarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect
        fill="none"
        height="14"
        rx="2.6"
        ry="2.6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
        width="16"
        x="4"
        y="6.5"
      />
      <path
        d="M8 4.5v4M16 4.5v4M4 10.5h16"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

function OpportunityShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 4.8 18 7v4.7c0 4-2.3 6.9-6 8.6-3.7-1.7-6-4.6-6-8.6V7l6-2.2Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
      <path
        d="m9.6 12 1.6 1.6 3.5-3.8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

function CarouselChevronIcon({ direction }: { direction: "previous" | "next" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d={direction === "next" ? "M9 5.5 15.5 12 9 18.5" : "M15 5.5 8.5 12 15 18.5"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}

function HeroDestinationArt({
  city,
}: {
  city: (typeof HERO_REFERENCE_CARDS)[number]["city"];
}) {
  if (city === "Rome") {
    return (
      <svg aria-hidden="true" viewBox="0 0 360 210" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="hero-rome-sky" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1a2440" />
            <stop offset="58%" stopColor="#233252" />
            <stop offset="100%" stopColor="#0f1627" />
          </linearGradient>
        </defs>
        <rect width="360" height="210" fill="url(#hero-rome-sky)" />
        <circle cx="296" cy="40" r="46" fill="rgba(240, 180, 96, 0.14)" />
        <path
          d="M0 150C54 132 108 126 176 132C236 138 292 152 360 186V210H0Z"
          fill="rgba(7, 12, 24, 0.56)"
        />
        <path
          d="M228 72h80v58h-80zM238 84h60M238 96h60M240 108h56M240 120h56M240 130h56"
          fill="none"
          stroke="rgba(246, 236, 214, 0.9)"
          strokeLinecap="round"
          strokeWidth="3"
        />
        <path
          d="M242 132c8-11 16-16 24-16s16 5 24 16M266 132c7-10 14-15 21-15s14 5 21 15"
          fill="none"
          stroke="rgba(246, 236, 214, 0.8)"
          strokeLinecap="round"
          strokeWidth="3"
        />
        <path
          d="M196 138h136"
          stroke="rgba(240, 180, 96, 0.42)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (city === "Lisbon") {
    return (
      <svg aria-hidden="true" viewBox="0 0 360 210" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="hero-lisbon-sky" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#20304d" />
            <stop offset="52%" stopColor="#465d84" />
            <stop offset="100%" stopColor="#132038" />
          </linearGradient>
          <linearGradient id="hero-lisbon-water" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1c3358" />
            <stop offset="100%" stopColor="#2b5f84" />
          </linearGradient>
        </defs>
        <rect width="360" height="210" fill="url(#hero-lisbon-sky)" />
        <circle cx="306" cy="40" r="40" fill="rgba(255, 221, 166, 0.12)" />
        <path
          d="M0 140C44 128 96 122 146 126C206 130 288 150 360 170V210H0Z"
          fill="url(#hero-lisbon-water)"
        />
        <path
          d="M194 150h88v-16h-12v-34h-8v-20h-12v-14h-14v14h-10v20h-8v34h-24Z"
          fill="rgba(238, 230, 214, 0.9)"
        />
        <path
          d="M184 154h116"
          stroke="rgba(243, 179, 88, 0.42)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M160 126c24-18 42-32 56-42"
          fill="none"
          stroke="rgba(255, 203, 120, 0.24)"
          strokeLinecap="round"
          strokeWidth="3"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 360 210" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="hero-budapest-sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#182745" />
          <stop offset="56%" stopColor="#2d4770" />
          <stop offset="100%" stopColor="#0d172a" />
        </linearGradient>
      </defs>
      <rect width="360" height="210" fill="url(#hero-budapest-sky)" />
      <circle cx="304" cy="38" r="42" fill="rgba(255, 205, 132, 0.12)" />
      <path
        d="M0 156c50-20 104-28 164-24c70 4 126 26 196 56v22H0Z"
        fill="rgba(9, 16, 28, 0.52)"
      />
      <path
        d="M196 148h94v-12h-6v-46h-10v-16h-8v16h-8v-24h-14v24h-10v58h-12v-40h-12v40h-14Z"
        fill="rgba(240, 232, 216, 0.92)"
      />
      <path
        d="M180 152h124"
        stroke="rgba(243, 179, 88, 0.42)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M170 158h126l-12 18H182Z"
        fill="rgba(14, 24, 40, 0.48)"
      />
    </svg>
  );
}

function getLuxDateKey(value: Date | string | null) {
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

function compareDealsByPrice(left: CampaignPreviewDeal, right: CampaignPreviewDeal) {
  if (left.dealPrice !== right.dealPrice) {
    return left.dealPrice - right.dealPrice;
  }

  return right.score - left.score;
}

function getDepartureTimestamp(deal: CampaignPreviewDeal) {
  const timestamp = deal.departureDate ? new Date(deal.departureDate).getTime() : Number.NaN;
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function compareDealsBySort(
  left: CampaignPreviewDeal,
  right: CampaignPreviewDeal,
  sort: DealSearchSort,
) {
  switch (sort) {
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

function takeLimitedDeals(candidates: CampaignPreviewDeal[], limit: number, maxPerDestination: number = 2) {
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

function getDealTheme(deal: CampaignPreviewDeal): ThemeFilter {
  return getThemeForDestinationCity(deal.destinationCity);
}

function getLandmarkTitle(deal: CampaignPreviewDeal) {
  const cityKey = normalizeDestinationKey(deal.destinationCity);
  return LANDMARK_TITLE_BY_DESTINATION[cityKey] ?? deal.destinationCity;
}

function getThemeForDestinationCity(city: string): Exclude<ThemeFilter, "any"> {
  return getDestinationTheme(city);
}

function getDestinationHeroDescription(city: string, _t?: Translate) {
  return getSeoDestinationHeroDescription(city);
}

function isWeekendDeal(deal: CampaignPreviewDeal) {
  return normalizeDestinationKey(deal.routeBucket).includes("weekend") || deal.tripNights <= 4;
}

function isWeeklongDeal(deal: CampaignPreviewDeal) {
  return deal.tripNights >= 5 && deal.tripNights <= 7;
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

function matchesBudgetFilter(deal: CampaignPreviewDeal, budgetFilter: BudgetFilter) {
  if (budgetFilter === "any") {
    return true;
  }

  return deal.dealPrice <= Number(budgetFilter);
}

function matchesDealSearchFilters(
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

  if (
    filters.departureWeekdayFilter !== "any" &&
    getDepartureWeekdayFilterValue(deal.departureDate) !== filters.departureWeekdayFilter
  ) {
    return false;
  }

  if (filters.themeFilter !== "any" && getDealTheme(deal) !== filters.themeFilter) {
    return false;
  }

  return true;
}

function hasMatchingDealsForFilters(
  deals: CampaignPreviewDeal[],
  filters: DealSearchFilters,
  now: Date,
) {
  return deals.some((deal) => matchesDealSearchFilters(deal, filters, now));
}

function areDealSearchFiltersEqual(left: DealSearchFilters, right: DealSearchFilters) {
  return (
    left.whenFilter === right.whenFilter &&
    left.tripFilter === right.tripFilter &&
    left.budgetFilter === right.budgetFilter &&
    left.directOnly === right.directOnly &&
    left.themeFilter === right.themeFilter &&
    left.destinationFilter === right.destinationFilter &&
    left.departureWeekdayFilter === right.departureWeekdayFilter
  );
}

function getChipTitle(chip: QuickChip, t?: Translate) {
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

function getSearchResultsCopy(filters: DealSearchFilters, t: Translate) {
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

function buildAvailabilityOptions(
  options: readonly SelectOption[],
  deals: CampaignPreviewDeal[],
  filters: DealSearchFilters,
  now: Date,
  getNextFilters: (value: string) => DealSearchFilters,
) {
  return options.map((option) => ({
    ...option,
    disabled: !hasMatchingDealsForFilters(deals, getNextFilters(option.value), now),
  }));
}

function buildDestinationOptions(
  deals: CampaignPreviewDeal[],
  filters: DealSearchFilters,
  now: Date,
) {
  const seen = new Set<string>();
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

function getActiveQuickChips(filters: DealSearchFilters) {
  return new Set(QUICK_CHIP_OPTIONS.filter((chip) => getQuickChipState(chip, filters)));
}

function findOptionLabel(options: SelectOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function groupSearchCityDeals(deals: CampaignPreviewDeal[]) {
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

function countDealsPerDestination(deals: CampaignPreviewDeal[]) {
  return deals.reduce<Map<string, number>>((map, deal) => {
    const key = `${deal.destinationAirport}-${normalizeDestinationKey(deal.destinationCity)}`;
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map());
}

function getDestinationCountKey(deal: CampaignPreviewDeal) {
  return `${deal.destinationAirport}-${normalizeDestinationKey(deal.destinationCity)}`;
}

function buildDestinationDealsHref(destinationCity: string) {
  return `/deals/${toDestinationSlug(destinationCity)}`;
}

function applyQuickChip(
  chip: QuickChip,
  filters: DealSearchFilters,
): DealSearchFilters {
  switch (chip) {
    case "this_weekend":
      return { ...filters, whenFilter: "this_weekend" };
    case "weekend":
      return { ...filters, tripFilter: "weekend" };
    case "weeklong":
      return { ...filters, tripFilter: "weeklong" };
    case "school_holidays":
      return { ...filters, whenFilter: "school_holidays" };
    case "under_50":
      return { ...filters, budgetFilter: "50" };
    case "cheap_direct":
      return { ...filters, budgetFilter: "80", directOnly: true };
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

function isQuickChipAvailable(
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

function getLowestPrice(deals: CampaignPreviewDeal[]) {
  return deals.length > 0 ? Math.min(...deals.map((deal) => deal.dealPrice)) : null;
}

function PublicDealCard({
  deal,
  combinationsCount,
  compact = false,
}: {
  deal: CampaignPreviewDeal;
  combinationsCount: number;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const holidayMatch = getMatchingLuxSchoolHoliday(deal.departureDate, deal.returnDate);
  const savingsLabel = formatSearchSavingsLabel(deal, t);
  const travelMeta = [
    deal.maxStops === "NON_STOP" ? t("deals.direct") : t("deals.upToOneStop"),
    `${deal.tripNights} ${deal.tripNights === 1 ? t("deals.night") : t("deals.nights")}`,
    formatDepartureMonth(deal.departureDate).toLowerCase(),
  ].join(" · ");
  const moreDealsCount = Math.max(0, combinationsCount - 1);
  const ctaLabel =
    moreDealsCount > 0
      ? `See this deal and ${moreDealsCount} more`
      : "See this deal";

  return (
    <article className={`deals-card${compact ? " deals-card--compact" : ""}`}>
      <figure className="deals-card__media">
        <LandmarkPhoto
          alt={`${deal.destinationCity} landmark`}
          destinationCity={deal.destinationCity}
          landmarkTitle={getLandmarkTitle(deal)}
        />
        <div className="deals-card__media-overlay" />
      </figure>

      <div className="deals-card__body">
        <div className="deals-card__eyebrow">
          <p>{getPublicTripStyle(deal)}</p>
          <strong>from {formatCurrency(deal.dealPrice)}</strong>
        </div>

        <div className="deals-card__title">
          <h3>{deal.destinationCity}</h3>
          <p>{travelMeta}</p>
        </div>

        {holidayMatch ? (
          <p className="deals-card__holiday">
            {t("deals.matches")} {holidayMatch.label.toLowerCase()}
          </p>
        ) : null}

        <div className="deals-card__meta-line">
          <span>{getPublicAirlineLine(deal)}</span>
          <span>{deal.maxStops === "NON_STOP" ? t("deals.direct") : t("deals.upToOneStop")}</span>
        </div>

        <div className="deals-card__reason">
          <strong>{savingsLabel}</strong>
          <span>{formatVerifiedAge(deal.verifiedAt, t)}</span>
        </div>

        <div className="deals-card__detail-strip">
          <span>
            {formatDateWithWeekday(deal.departureDate)} to {formatDateWithWeekday(deal.returnDate)}
          </span>
          <span>{formatStayHours(deal.destinationStayHours, deal.tripNights)} {t("deals.stay")}</span>
        </div>

        <div className="deals-card__actions">
          <span className="deals-card__matches">
            {combinationsCount} {combinationsCount === 1 ? "combination" : "combinations"} good
          </span>
          {deal.bookingUrl ? (
            <a className="deals-card__cta" href={deal.bookingUrl} rel="noreferrer" target="_blank">
              View ↗
            </a>
          ) : (
            <span className="deals-card__cta deals-card__cta--ghost">Pending</span>
          )}
        </div>
      </div>
    </article>
  );
}

function FeaturedOpportunityCard({
  deal,
  combinationsCount,
  onOpen,
  variant = "default",
}: {
  deal: CampaignPreviewDeal;
  combinationsCount: number;
  onOpen: () => void;
  variant?: "default" | "hero";
}) {
  const { t } = useI18n();
  const savingsLabel = formatSearchSavingsLabel(deal, t);
  const savingsBadgeLabel = getFareBadgeLabel(deal);
  const travelMeta = [
    deal.maxStops === "NON_STOP" ? t("deals.direct") : t("deals.upToOneStop"),
    `${deal.tripNights} ${deal.tripNights === 1 ? t("deals.night") : t("deals.nights")}`,
    formatDepartureMonth(deal.departureDate).toLowerCase(),
  ].join(" · ");
  const moreDealsCount = Math.max(0, combinationsCount - 1);
  const ctaLabel =
    moreDealsCount > 0
      ? `See ${moreDealsCount} more ${moreDealsCount === 1 ? "fare" : "fares"}`
      : "See fare";
  const tripSnapshot = `${formatDateWithWeekday(deal.departureDate)} · ${formatStayHours(deal.destinationStayHours, deal.tripNights)} ${t("deals.stay")}`;
  const verifiedLabel = formatVerifiedAge(deal.verifiedAt, t);

  if (variant === "hero") {
    return (
      <button
        aria-label={`Open details for ${deal.destinationCity}`}
        aria-haspopup="dialog"
        className="deals-opportunity-card deals-opportunity-card--hero"
        onClick={onOpen}
        type="button"
      >
        <figure className="deals-opportunity-card__media">
          <LandmarkPhoto
            alt={`${deal.destinationCity} landmark`}
            destinationCity={deal.destinationCity}
            landmarkTitle={getLandmarkTitle(deal)}
          />
          <div className="deals-opportunity-card__hero-overlay" />
        </figure>

        <div className="deals-opportunity-card__hero-copy">
          <div className="deals-opportunity-card__hero-main">
            <span className="deals-opportunity-card__hero-kicker">
              The strongest opportunities on the board right now.
            </span>
            <strong className="deals-opportunity-card__hero-city">
              {deal.destinationCity.toUpperCase()}
            </strong>
            <p className="deals-opportunity-card__hero-price">
              <small>From</small> {formatCurrency(deal.dealPrice)}
            </p>
            <strong className="deals-opportunity-card__hero-savings">{savingsLabel}</strong>
            <div className="deals-opportunity-card__hero-detail-list" aria-label="Deal summary">
              <span className="deals-opportunity-card__hero-detail">
                <i aria-hidden="true">
                  <OpportunityCalendarIcon />
                </i>
                <span>{tripSnapshot}</span>
              </span>
              <span className="deals-opportunity-card__hero-detail">
                <i aria-hidden="true">
                  <HeroPlaneIcon />
                </i>
                <span>{travelMeta}</span>
              </span>
              <span className="deals-opportunity-card__hero-detail">
                <i aria-hidden="true">
                  <OpportunityShieldIcon />
                </i>
                <span>{verifiedLabel}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="deals-opportunity-card__hero-cta-wrap">
          <div className="deals-opportunity-card__footer">
            <span>{ctaLabel}</span>
            <span aria-hidden="true" className="deals-opportunity-card__view">
              →
            </span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      aria-label={`Open details for ${deal.destinationCity}`}
      aria-haspopup="dialog"
      className="deals-opportunity-card"
      onClick={onOpen}
      type="button"
    >
      <figure className="deals-opportunity-card__media">
        <LandmarkPhoto
          alt={`${deal.destinationCity} landmark`}
          destinationCity={deal.destinationCity}
          landmarkTitle={getLandmarkTitle(deal)}
        />
        <div className="deals-card__media-overlay" />
        {savingsBadgeLabel ? (
          <span className="deals-opportunity-card__badge">{savingsBadgeLabel}</span>
        ) : null}
      </figure>

      <div className="deals-opportunity-card__body">
        <div className="deals-opportunity-card__title-row">
          <strong>{deal.destinationCity}</strong>
          <span>from {formatCurrency(deal.dealPrice)}</span>
        </div>

        <p className="deals-opportunity-card__meta">{travelMeta}</p>
        <div className="deals-opportunity-card__footer">
          <span>{ctaLabel}</span>
          <span aria-hidden="true" className="deals-opportunity-card__view">
            →
          </span>
        </div>
      </div>
    </button>
  );
}

function SearchCityGroupCard({
  group,
  onToggle,
}: {
  group: SearchCityGroup;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const heroDeal = group.deals[0];

  return (
    <section className="deals-search-group">
      <button
        className="deals-search-group__header"
        onClick={onToggle}
        type="button"
      >
        <figure className="deals-search-group__media" aria-hidden="true">
          <LandmarkPhoto
            alt={`${group.city} landmark`}
            destinationCity={group.city}
            landmarkTitle={getLandmarkTitle(heroDeal)}
          />
          <div className="deals-search-group__media-overlay" />
        </figure>
        <div className="deals-search-group__header-content">
          <div className="deals-search-group__header-copy">
            <strong>{group.city}</strong>
            <span>
              {group.deals.length} {group.deals.length === 1 ? t("deals.fare") : t("deals.fares")} · {t("common.from").toLowerCase()}{" "}
              {formatCurrency(group.lowestPrice)}
            </span>
          </div>
          <span className="deals-search-group__header-meta">
            <em>{t("deals.showDeals")}</em>
            <i aria-hidden="true">+</i>
          </span>
        </div>
      </button>
    </section>
  );
}

function DealFlightCard({
  deal,
  combinationsCount,
  className,
  showCityLabel = true,
  showBooking = true,
  showFacts = true,
  ctaHref = deal.bookingUrl,
  ctaLabel,
  ctaExternal = true,
  pendingLabel = "Skyscanner link pending",
  showArrivalDate = false,
  showWeekdayInDate = true,
  shiftDurationLeft = false,
  showAirlineLogo = false,
}: {
  deal: CampaignPreviewDeal;
  combinationsCount: number;
  className?: string;
  showCityLabel?: boolean;
  showBooking?: boolean;
  showFacts?: boolean;
  ctaHref?: string | null;
  ctaLabel?: string;
  ctaExternal?: boolean;
  pendingLabel?: string;
  showArrivalDate?: boolean;
  showWeekdayInDate?: boolean;
  shiftDurationLeft?: boolean;
  showAirlineLogo?: boolean;
}) {
  const { t } = useI18n();
  const savingsLabel = formatSearchSavingsLabel(deal, t);
  const outboundDuration = formatFlightDuration(
    deal.outboundDepartureAt,
    deal.outboundArrivalAt,
    "LUX",
    deal.destinationAirport,
  );
  const returnDuration = formatFlightDuration(
    deal.returnDepartureAt,
    deal.returnArrivalAt,
    deal.destinationAirport,
    "LUX",
  );
  const holidayMatch = getMatchingLuxSchoolHoliday(deal.departureDate, deal.returnDate);
  const airlineName = getPrimaryAirlineName(deal);
  const stopsLabel = deal.maxStops === "NON_STOP" ? t("deals.direct") : t("deals.upToOneStop");
  const resolvedCtaLabel = ctaLabel ?? t("deals.bookOnSkyscanner");
  const resolvedPendingLabel = pendingLabel === "Skyscanner link pending" ? t("deals.skyscannerPending") : pendingLabel;
  const strongPrice = isStrongPriceDeal(deal);
  const cardClassName = `${className ?? "deals-search-card"}${strongPrice ? " deals-search-card--strong-price" : ""}`;

  return (
    <article className={cardClassName}>
      <div className="deals-search-card__content">
        {showCityLabel ? (
          <div className="deals-search-card__meta-bar">
            <strong>{deal.destinationCity}</strong>
          </div>
        ) : null}

        <div className="deals-search-card__segments">
          <div className="deals-search-card__segment">
            <div className="deals-search-card__airline">
              {showAirlineLogo ? (
                <AirlineLogo airlineName={airlineName} />
              ) : (
                <span>{getDisplayAirlineSummary(deal)}</span>
              )}
              <small>{t("deals.outbound")}</small>
            </div>

            <div className="deals-search-card__timeline">
              <div className="deals-search-card__timepoint deals-search-card__timepoint--departure">
                <small className="deals-search-card__timepoint-date">
                  {showWeekdayInDate
                    ? formatDateWithWeekday(deal.departureDate)
                    : formatDateWithoutWeekday(deal.departureDate)}
                </small>
                <strong>{formatFlightClock(deal.outboundDepartureAt) ?? t("deals.timeNA")}</strong>
                <span>LUX</span>
              </div>
              <div
                className={`deals-search-card__duration${shiftDurationLeft ? " deals-search-card__duration--shifted" : ""}`}
              >
                <span>{outboundDuration ?? `${deal.tripNights} ${t("deals.nights")}`}</span>
                <strong>{stopsLabel}</strong>
              </div>
              <div className="deals-search-card__timepoint deals-search-card__timepoint--arrival">
                {showArrivalDate ? (
                  <small className="deals-search-card__timepoint-date">
                    {showWeekdayInDate
                      ? formatDateWithWeekday(deal.outboundArrivalAt)
                      : formatDateWithoutWeekday(deal.outboundArrivalAt)}
                  </small>
                ) : null}
                <strong>{formatFlightClock(deal.outboundArrivalAt) ?? t("deals.timeNA")}</strong>
                <span>{deal.destinationAirport}</span>
              </div>
            </div>
          </div>

          <div className="deals-search-card__segment">
            <div className="deals-search-card__airline">
              {showAirlineLogo ? (
                <AirlineLogo airlineName={airlineName} />
              ) : (
                <span>{getDisplayAirlineSummary(deal)}</span>
              )}
              <small>{t("deals.return")}</small>
            </div>

            <div className="deals-search-card__timeline">
              <div className="deals-search-card__timepoint deals-search-card__timepoint--departure">
                <small className="deals-search-card__timepoint-date">
                  {showWeekdayInDate
                    ? formatDateWithWeekday(deal.returnDate)
                    : formatDateWithoutWeekday(deal.returnDate)}
                </small>
                <strong>{formatFlightClock(deal.returnDepartureAt) ?? t("deals.timeNA")}</strong>
                <span>{deal.destinationAirport}</span>
              </div>
              <div
                className={`deals-search-card__duration${shiftDurationLeft ? " deals-search-card__duration--shifted" : ""}`}
              >
                <span>{returnDuration ?? formatStayHours(deal.destinationStayHours, deal.tripNights)}</span>
                <strong>{stopsLabel}</strong>
              </div>
              <div className="deals-search-card__timepoint deals-search-card__timepoint--arrival">
                {showArrivalDate ? (
                  <small className="deals-search-card__timepoint-date">
                    {showWeekdayInDate
                      ? formatDateWithWeekday(deal.returnArrivalAt)
                      : formatDateWithoutWeekday(deal.returnArrivalAt)}
                  </small>
                ) : null}
                <strong>{formatFlightClock(deal.returnArrivalAt) ?? t("deals.timeNA")}</strong>
                <span>LUX</span>
              </div>
            </div>
          </div>
        </div>

        {showFacts ? (
          <div className="deals-search-card__facts">
            <span>{formatStayHours(deal.destinationStayHours, deal.tripNights)} {t("deals.stay")}</span>
            <span>{formatStayBucketLabel(deal.routeBucket)}</span>
            <span>{formatVerifiedAge(deal.verifiedAt, t)}</span>
            {holidayMatch ? <span>{t("deals.matches")} {holidayMatch.label}</span> : null}
          </div>
        ) : null}
      </div>

      {showBooking ? (
        <aside className="deals-search-card__booking">
          <strong className="deals-search-card__price">{formatCurrency(deal.dealPrice)}</strong>
          <p className={`deals-search-card__saving${strongPrice ? " is-positive" : " is-neutral"}`}>{savingsLabel}</p>
          {ctaHref ? (
            ctaExternal ? (
              <a className="deals-search-card__cta" href={ctaHref} rel="noreferrer" target="_blank">
                {resolvedCtaLabel}
              </a>
            ) : (
              <Link className="deals-search-card__cta" href={ctaHref}>
                {resolvedCtaLabel}
              </Link>
            )
          ) : (
            <span className="deals-search-card__pending">{resolvedPendingLabel}</span>
          )}
        </aside>
      ) : null}
    </article>
  );
}

function SearchResultCard({
  deal,
  combinationsCount,
  showCityLabel = false,
}: {
  deal: CampaignPreviewDeal;
  combinationsCount: number;
  showCityLabel?: boolean;
}) {
  return (
    <DealFlightCard
      combinationsCount={combinationsCount}
      deal={deal}
      shiftDurationLeft
      showCityLabel={showCityLabel}
      showAirlineLogo
      showArrivalDate
      showWeekdayInDate={false}
    />
  );
}

function ResultsPagination({
  page,
  pageCount,
  total,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) {
    return null;
  }

  const start = (page - 1) * RESULTS_PAGE_SIZE + 1;
  const end = Math.min(total, page * RESULTS_PAGE_SIZE);

  return (
    <nav className="deals-results-pagination" aria-label="Fare results pagination">
      <p>
        Showing {start}-{end} of {total}
      </p>
      <div className="deals-results-pagination__controls">
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          type="button"
        >
          Previous
        </button>
        <span>
          Page {page} of {pageCount}
        </span>
        <button
          disabled={page >= pageCount}
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          type="button"
        >
          Next
        </button>
      </div>
    </nav>
  );
}

function FeaturedOpportunityModal({
  deal,
  combinationsCount,
  onClose,
  onPrevious,
  onNext,
  canGoPrevious,
  canGoNext,
}: {
  deal: CampaignPreviewDeal;
  combinationsCount: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key === "ArrowLeft" && canGoPrevious) {
        onPrevious();
        return;
      }

      if (event.key === "ArrowRight" && canGoNext) {
        onNext();
        return;
      }

      if (event.key === "Tab") {
        const panel = closeButtonRef.current?.closest<HTMLElement>("[role='dialog']");
        const focusable = panel
          ? Array.from(panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])"))
          : [];
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [canGoNext, canGoPrevious, onClose, onNext, onPrevious]);

  const otherOffersCount = Math.max(0, combinationsCount - 1);
  const destinationHref = buildDestinationDealsHref(deal.destinationCity);
  const otherOffersNoun = otherOffersCount === 1 ? "fare" : "fares";
  const modalCtaLabel =
    otherOffersCount > 0
      ? `Explore ${otherOffersCount} more ${deal.destinationCity} ${otherOffersNoun}`
      : "View fare on Skyscanner";
  const savingsLabel = formatDropLine(deal);

  return createPortal(
    <div
      aria-hidden={false}
      className="deals-opportunity-modal"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <button
        aria-label="Previous opportunity"
        className="deals-opportunity-modal__side-button deals-opportunity-modal__side-button--prev"
        disabled={!canGoPrevious}
        onClick={onPrevious}
        type="button"
      >
        ←
      </button>

      <section
        aria-labelledby="deals-opportunity-dialog-title"
        aria-modal="true"
        className="deals-opportunity-modal__panel"
        role="dialog"
      >
        <button
          aria-label="Close opportunity detail"
          className="deals-opportunity-modal__close"
          onClick={onClose}
          ref={closeButtonRef}
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>

        <figure className="deals-opportunity-modal__media">
          <LandmarkPhoto
            alt={`${deal.destinationCity} landmark`}
            destinationCity={deal.destinationCity}
            landmarkTitle={getLandmarkTitle(deal)}
          />
          <div className="deals-card__media-overlay" />
        </figure>

        <div className="deals-opportunity-modal__body">
          <div className="deals-opportunity-modal__header">
            <div>
              <strong className="deals-opportunity-modal__price-headline">
                {deal.destinationCity} <small>From</small> {formatCurrency(deal.dealPrice)}
              </strong>
              <p className="deals-opportunity-modal__lead">{savingsLabel}</p>
            </div>
          </div>

          <DealFlightCard
            className="deals-search-card deals-search-card--modal"
            combinationsCount={combinationsCount}
            deal={deal}
            showBooking={false}
            showCityLabel={false}
            showFacts={false}
          />

          <dl className="deals-opportunity-modal__facts">
            <div>
              <dt>Trip type</dt>
              <dd>{formatStayBucketLabel(deal.routeBucket)}</dd>
            </div>
            <div>
              <dt>{`Time in ${deal.destinationCity}`}</dt>
              <dd>{formatStayHours(deal.destinationStayHours, deal.tripNights)}</dd>
            </div>
            <div>
              <dt>Routing</dt>
              <dd>{deal.maxStops === "NON_STOP" ? "Direct only" : "Up to 1 stop"}</dd>
            </div>
            <div>
              <dt>Airline</dt>
              <dd>{getDisplayAirlineSummary(deal)}</dd>
            </div>
          </dl>

          <div className="deals-opportunity-modal__footer">
            {otherOffersCount > 0 || !deal.bookingUrl ? (
              <Link className="deals-opportunity-modal__footer-link" href={destinationHref}>
                {modalCtaLabel}
              </Link>
            ) : (
              <a
                className="deals-opportunity-modal__footer-link"
                href={deal.bookingUrl}
                rel="noreferrer"
                target="_blank"
              >
                {modalCtaLabel}
              </a>
            )}
          </div>
        </div>
      </section>

      <button
        aria-label="Next opportunity"
        className="deals-opportunity-modal__side-button deals-opportunity-modal__side-button--next"
        disabled={!canGoNext}
        onClick={onNext}
        type="button"
      >
        →
      </button>
    </div>,
    document.body,
  );
}

export function PublicDealsDestinationPage({
  cityName,
  deals,
  updatedAt,
}: {
  cityName: string;
  deals: CampaignPreviewDeal[];
  updatedAt: string | null;
}) {
  const destinationCounts = useMemo(() => countDealsPerDestination(deals), [deals]);
  const heroDeal = deals[0] ?? null;
  const lowestPrice = getLowestPrice(deals);

  return (
    <section className="deals-city-page">
      <div className="deals-city-page__hero">
        <div className="deals-city-page__hero-copy">
          <Link className="deals-explorer__secondary-link" href="/">
            ← Back to home
          </Link>
          <p className="deals-explorer__kicker">Destination board</p>
          <h1>{cityName}</h1>
          <p>
            All live fares currently found from Luxembourg for {cityName}, grouped as individual
            opportunities you can compare one by one.
          </p>
        </div>

        <div className="deals-city-page__hero-summary">
          <span>{deals.length} {deals.length === 1 ? "live fare" : "live fares"}</span>
          <strong>from {formatCurrency(lowestPrice ?? deals[0]?.dealPrice ?? 0)}</strong>
          <small>{updatedAt ? formatVerifiedAge(updatedAt) : "Updated as new fares land"}</small>
        </div>
      </div>

      {heroDeal ? (
        <figure className="deals-city-page__media" aria-hidden="true">
          <LandmarkPhoto
            alt={`${cityName} landmark`}
            destinationCity={cityName}
            landmarkTitle={getLandmarkTitle(heroDeal)}
          />
          <div className="deals-card__media-overlay" />
        </figure>
      ) : null}

      <div className="deals-city-page__results">
        {deals.map((deal) => (
          <DealFlightCard
            combinationsCount={destinationCounts.get(getDestinationCountKey(deal)) ?? 1}
            key={`city-deal-${deal.id}`}
            deal={deal}
          />
        ))}
      </div>
    </section>
  );
}

export function PublicDealsExplorer({
  data,
  initialFilters = DEFAULT_DEAL_SEARCH_FILTERS,
  initialSort = DEFAULT_DEAL_SEARCH_SORT,
  mode = "landing",
  lockedDestinationCity,
  searchPathname = "/deals/search",
}: PublicDealsExplorerProps) {
  const router = useRouter();
  const { t } = useI18n();
  const lockedDestinationFilter = useMemo(
    () => (lockedDestinationCity ? normalizeDestinationKey(lockedDestinationCity) : null),
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
  const appliedFilters = useMemo(() => {
    const baseFilters = mode === "landing" ? DEFAULT_DEAL_SEARCH_FILTERS : initialFilters;
    return coerceFiltersForMode(baseFilters);
  }, [coerceFiltersForMode, initialFilters, mode]);
  const [draftFilters, setDraftFilters] = useState<DealSearchFilters>({ ...appliedFilters });
  const [sortOrder, setSortOrder] = useState<DealSearchSort>(
    mode === "landing" ? DEFAULT_DEAL_SEARCH_SORT : initialSort,
  );
  const [featuredStartIndex, setFeaturedStartIndex] = useState(0);
  const [selectedOpportunityDealId, setSelectedOpportunityDealId] = useState<string | null>(null);
  const [selectedOpportunityDeals, setSelectedOpportunityDeals] = useState<CampaignPreviewDeal[]>([]);
  const [styleStartIndex, setStyleStartIndex] = useState(0);
  const [styleVisibleCount, setStyleVisibleCount] = useState(5);
  const [resultsPage, setResultsPage] = useState(1);
  const now = useMemo(() => new Date(), []);
  const effectiveFilters =
    mode === "results" || mode === "city"
      ? coerceFiltersForMode(draftFilters)
      : appliedFilters;
  const buildDealsHrefForMode = useCallback(
    (filters: DealSearchFilters) => {
      const coercedFilters = coerceFiltersForMode(filters);
      const hrefFilters =
        mode === "city" && lockedDestinationFilter
          ? { ...coercedFilters, destinationFilter: "any" }
          : coercedFilters;

      return buildDealsSearchHref(hrefFilters, searchPathname, sortOrder);
    },
    [coerceFiltersForMode, lockedDestinationFilter, mode, searchPathname, sortOrder],
  );

  useEffect(() => {
    setDraftFilters({ ...appliedFilters });
  }, [appliedFilters]);

  useEffect(() => {
    setSortOrder(mode === "landing" ? DEFAULT_DEAL_SEARCH_SORT : initialSort);
  }, [initialSort, mode]);

  useEffect(() => {
    if (mode !== "results" && mode !== "city") {
      return;
    }

    const nextHref = buildDealsHrefForMode(draftFilters);
    const currentHref = `${window.location.pathname}${window.location.search}`;

    if (currentHref !== nextHref) {
      window.history.replaceState(null, "", nextHref);
    }
  }, [buildDealsHrefForMode, draftFilters, mode]);

  useEffect(() => {
    const computeVisibleCount = () => {
      if (window.innerWidth < 980) {
        return 1;
      }

      return 3;
    };

    const syncVisibleCount = () => {
      const nextCount = computeVisibleCount();
      setStyleVisibleCount(nextCount);
    };
    syncVisibleCount();
    window.addEventListener("resize", syncVisibleCount);
    return () => window.removeEventListener("resize", syncVisibleCount);
  }, []);

  const filteredDeals = useMemo(() => {
    const nextDeals = data.deals.filter((deal) => matchesDealSearchFilters(deal, effectiveFilters, now));

    return [...nextDeals].sort((left, right) => compareDealsBySort(left, right, sortOrder));
  }, [data.deals, effectiveFilters, now, sortOrder]);

  const draftQuickChips = useMemo(() => getActiveQuickChips(draftFilters), [draftFilters]);
  const appliedQuickChips = useMemo(() => getActiveQuickChips(effectiveFilters), [effectiveFilters]);

  const featuredNow = useMemo(() => takeLimitedDeals(filteredDeals, 12, 1), [filteredDeals]);
  const opportunityDeals = mode === "results" || mode === "city" ? filteredDeals : featuredNow;
  const searchResultsCopy = useMemo(
    () => getSearchResultsCopy(effectiveFilters, t),
    [effectiveFilters, t],
  );
  const spotlightDeal =
    featuredNow[0] ??
    data.deals.find((deal) => deal.dealPrice > 0) ??
    null;
  const destinationCounts = useMemo(() => countDealsPerDestination(filteredDeals), [filteredDeals]);
  const groupedOpportunityDeals = useMemo<SearchCityGroup[]>(() => {
    if (mode !== "results" && mode !== "city") {
      return [];
    }

    return groupSearchCityDeals(filteredDeals);
  }, [filteredDeals, mode]);
  const [openSearchCityGroups, setOpenSearchCityGroups] = useState<Set<string>>(() => new Set());
  const previousEffectiveFiltersRef = useRef<DealSearchFilters | null>(null);
  const selectedSearchGroup =
    mode === "city"
      ? groupedOpportunityDeals[0] ?? null
      : mode === "results"
        ? groupedOpportunityDeals.find((group) => openSearchCityGroups.has(group.key)) ?? null
        : null;
  const resultsSourceDeals = selectedSearchGroup?.deals ?? opportunityDeals;
  const resultsPageCount = Math.max(1, Math.ceil(resultsSourceDeals.length / RESULTS_PAGE_SIZE));
  const clampedResultsPage = Math.min(resultsPage, resultsPageCount);
  const paginatedResultDeals = resultsSourceDeals.slice(
    (clampedResultsPage - 1) * RESULTS_PAGE_SIZE,
    clampedResultsPage * RESULTS_PAGE_SIZE,
  );
  const selectedOpportunityDeal =
    selectedOpportunityDeals.find((deal) => deal.id === selectedOpportunityDealId) ?? null;
  const selectedOpportunityDealIndex = selectedOpportunityDealId
    ? selectedOpportunityDeals.findIndex((deal) => deal.id === selectedOpportunityDealId)
    : -1;
  const featuredWindowSize = 1;
  const featuredPageCount = Math.max(1, Math.ceil(featuredNow.length / featuredWindowSize));
  const clampedFeaturedStartIndex = Math.min(
    featuredStartIndex,
    Math.max(0, featuredNow.length - featuredWindowSize),
  );
  const featuredCurrentPage = Math.min(
    featuredPageCount,
    Math.floor(clampedFeaturedStartIndex / featuredWindowSize) + 1,
  );
  const canMoveFeaturedPrev = clampedFeaturedStartIndex > 0;
  const canMoveFeaturedNext =
    clampedFeaturedStartIndex + featuredWindowSize < featuredNow.length;

  useEffect(() => {
    if (mode !== "results") {
      return;
    }

    const previousFilters = previousEffectiveFiltersRef.current;
    previousEffectiveFiltersRef.current = effectiveFilters;

    if (previousFilters === null || areDealSearchFiltersEqual(previousFilters, effectiveFilters)) {
      return;
    }

    setOpenSearchCityGroups((current) => (current.size === 0 ? current : new Set()));
  }, [effectiveFilters, mode]);

  useEffect(() => {
    if (mode !== "results") {
      previousEffectiveFiltersRef.current = null;
      return;
    }

    const validKeys = new Set(groupedOpportunityDeals.map((group) => group.key));
    setOpenSearchCityGroups((current) => {
      const next = new Set([...current].filter((key) => validKeys.has(key)));
      if (next.size === current.size && [...next].every((key) => current.has(key))) {
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

  useEffect(() => {
    setFeaturedStartIndex((current) =>
      Math.min(current, Math.max(0, featuredNow.length - featuredWindowSize)),
    );
  }, [featuredNow.length, featuredWindowSize]);

  useEffect(() => {
    if (mode !== "landing" || featuredNow.length <= featuredWindowSize) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const autoplay = window.setInterval(() => {
      setFeaturedStartIndex((current) => {
        const maxStartIndex = Math.max(0, featuredNow.length - featuredWindowSize);
        return current >= maxStartIndex ? 0 : current + featuredWindowSize;
      });
    }, 5000);

    return () => window.clearInterval(autoplay);
  }, [featuredNow.length, featuredWindowSize, mode]);

  const destinationCount = useMemo(
    () => new Set(data.deals.map((deal) => `${deal.destinationAirport}-${deal.destinationCity}`)).size,
    [data.deals],
  );
  const destinationOptions = useMemo<SelectOption[]>(
    () =>
      buildDestinationOptions(data.deals, draftFilters, now).map((option) =>
        option.value === "any" ? { ...option, label: t("common.anyDestination") } : option,
      ),
    [data.deals, draftFilters, now, t],
  );
  const departureWeekdayOptions = useMemo<SelectOption[]>(
    () =>
      buildAvailabilityOptions(
        DEPARTURE_WEEKDAY_OPTIONS,
        data.deals,
        draftFilters,
        now,
        (value) => ({
          ...draftFilters,
          departureWeekdayFilter: value as DepartureWeekdayFilter,
        }),
      ).map((option) => ({ ...option, label: t(`deals.weekday.${option.value}`) })),
    [data.deals, draftFilters, now, t],
  );
  const resultsWhenOptions = useMemo<SelectOption[]>(
    () =>
      buildAvailabilityOptions(WHEN_OPTIONS, data.deals, draftFilters, now, (value) => ({
        ...draftFilters,
        whenFilter: value as WhenFilter,
      })).map((option) => ({ ...option, label: t(`deals.when.${option.value}`) })),
    [data.deals, draftFilters, now, t],
  );
  const resultsTripOptions = useMemo<SelectOption[]>(
    () =>
      buildAvailabilityOptions(TRIP_OPTIONS, data.deals, draftFilters, now, (value) => ({
        ...draftFilters,
        tripFilter: value as TripFilter,
      })).map((option) => ({ ...option, label: t(`deals.trip.${option.value}`) })),
    [data.deals, draftFilters, now, t],
  );
  const resultsBudgetOptions = useMemo<SelectOption[]>(
    () =>
      buildAvailabilityOptions(BUDGET_OPTIONS, data.deals, draftFilters, now, (value) => ({
        ...draftFilters,
        budgetFilter: value as BudgetFilter,
      })).map((option) => ({ ...option, label: t(`deals.budget.${option.value}`) })),
    [data.deals, draftFilters, now, t],
  );
  const activeFilterChips = useMemo(
    () => {
      const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];

      if (
        effectiveFilters.destinationFilter !== "any" &&
        effectiveFilters.destinationFilter !== lockedDestinationFilter
      ) {
        chips.push({
          key: "destination",
          label: findOptionLabel(destinationOptions, effectiveFilters.destinationFilter),
          onRemove: () =>
            setDraftFilters((current) =>
              coerceFiltersForMode({ ...current, destinationFilter: "any" }),
            ),
        });
      }

      if (effectiveFilters.departureWeekdayFilter !== "any") {
        chips.push({
          key: "departureWeekday",
          label: findOptionLabel(departureWeekdayOptions, effectiveFilters.departureWeekdayFilter),
          onRemove: () =>
            setDraftFilters((current) => ({ ...current, departureWeekdayFilter: "any" })),
        });
      }

      if (effectiveFilters.whenFilter !== "any") {
        chips.push({
          key: "when",
          label: findOptionLabel(resultsWhenOptions, effectiveFilters.whenFilter),
          onRemove: () => setDraftFilters((current) => ({ ...current, whenFilter: "any" })),
        });
      }

      if (effectiveFilters.tripFilter !== "any") {
        chips.push({
          key: "trip",
          label: findOptionLabel(resultsTripOptions, effectiveFilters.tripFilter),
          onRemove: () => setDraftFilters((current) => ({ ...current, tripFilter: "any" })),
        });
      }

      if (effectiveFilters.budgetFilter !== "any") {
        chips.push({
          key: "budget",
          label: findOptionLabel(resultsBudgetOptions, effectiveFilters.budgetFilter),
          onRemove: () => setDraftFilters((current) => ({ ...current, budgetFilter: "any" })),
        });
      }

      if (effectiveFilters.directOnly) {
        chips.push({
          key: "directOnly",
          label: t("common.directOnly"),
          onRemove: () => setDraftFilters((current) => ({ ...current, directOnly: false })),
        });
      }

      for (const chip of appliedQuickChips) {
        chips.push({
          key: `quick-${chip}`,
          label: getChipTitle(chip, t),
          onRemove: () => setDraftFilters((current) => resetQuickChip(chip, current)),
        });
      }

      return chips;
    },
    [
      appliedQuickChips,
      coerceFiltersForMode,
      departureWeekdayOptions,
      destinationOptions,
      effectiveFilters,
      lockedDestinationFilter,
      resultsBudgetOptions,
      resultsTripOptions,
      resultsWhenOptions,
      t,
    ],
  );
  const directOnlyOptionAvailable = useMemo(
    () =>
      draftFilters.directOnly ||
      hasMatchingDealsForFilters(
        data.deals,
        {
          ...draftFilters,
          directOnly: true,
        },
        now,
      ),
    [data.deals, draftFilters, now],
  );

  const searchHref = buildDealsHrefForMode(draftFilters);

  const maxDiscount = useMemo(() => {
    const values = filteredDeals
      .map((deal) => (deal.dropRatio === null ? null : Math.max(0, Math.round((1 - deal.dropRatio) * 100))))
      .filter((value): value is number => value !== null);
    return values.length > 0 ? Math.max(...values) : null;
  }, [filteredDeals]);
  const cityHeroDeal = mode === "city" ? filteredDeals[0] ?? null : null;
  const cityLowestPrice = mode === "city" ? getLowestPrice(filteredDeals) : null;
  const breadcrumbCurrentLabel =
    mode === "city"
      ? lockedDestinationCity ?? selectedSearchGroup?.city ?? "Destination"
      : t("deals.searchResults");

  const travelStyles = useMemo<TravelStyleCard[]>(() => {
    const cards = [
      {
        key: "weekend",
        label: "Weekend escapes",
        description: "Thu-Sun, Fri-Sun and short breaks from Luxembourg.",
        hint: "Thu-Sun, Fri-Sun and more",
        deals: filteredDeals.filter((deal) => isWeekendDeal(deal)),
        chip: "weekend" as QuickChip,
        icon: "✈️",
        accentClass: "deals-style-card__icon--weekend",
      },
      {
        key: "weeklong",
        label: "Trips of 5 to 7 nights",
        description: "Saturday-to-Saturday and one-week sweet spots.",
        hint: "Sat-Sat, Sun-Sun and similar",
        deals: filteredDeals.filter((deal) => isWeeklongDeal(deal)),
        chip: "weeklong" as QuickChip,
        icon: "🗓️",
        accentClass: "deals-style-card__icon--weeklong",
      },
      {
        key: "school",
        label: "School-holiday friendly",
        description: "Trips that already match Luxembourg school breaks.",
        hint: "Families and calendar-friendly timing",
        deals: filteredDeals.filter((deal) =>
          Boolean(getMatchingLuxSchoolHoliday(deal.departureDate, deal.returnDate)),
        ),
        chip: "school_holidays" as QuickChip,
        icon: "🎓",
        accentClass: "deals-style-card__icon--school",
      },
      {
        key: "cheap_direct",
        label: "Direct under EUR 80",
        description: "Fast, easy wins without stopovers.",
        hint: "Direct, quick and low-friction",
        deals: filteredDeals.filter((deal) => deal.maxStops === "NON_STOP" && deal.dealPrice <= 80),
        chip: "cheap_direct" as QuickChip,
        icon: "🛫",
        accentClass: "deals-style-card__icon--direct",
      },
      {
        key: "beach",
        label: "Beach breaks",
        description: "Sea, sun and warm-weather escapes.",
        hint: "Beach and island ideas",
        deals: filteredDeals.filter((deal) => getDealTheme(deal) === "beach"),
        chip: "beach" as QuickChip,
        icon: "🌴",
        accentClass: "deals-style-card__icon--beach",
      },
      {
        key: "city",
        label: "City breaks",
        description: "Culture, food, museums and classic weekends.",
        hint: "Cities with iconic landmarks",
        deals: filteredDeals.filter((deal) => getDealTheme(deal) === "city"),
        chip: "city" as QuickChip,
        icon: "🏙️",
        accentClass: "deals-style-card__icon--city",
      },
    ];

    return cards
      .map((card) => ({
        ...getTravelStyleVisual(card.key),
        key: card.key,
        label: card.label,
        description: card.description,
        hint: card.hint,
        fromPrice: getLowestPrice(card.deals),
        matches: card.deals.length,
        chip: card.chip,
        icon: card.icon,
        accentClass: card.accentClass,
      }))
      .filter((card) => card.matches > 0);
  }, [filteredDeals]);
  const styleNavigationHrefs = useMemo(() => {
    return new Map(
      travelStyles.map((style) => [
        style.key,
        style.chip
          ? buildDealsSearchHref(
              appliedQuickChips.has(style.chip)
                ? resetQuickChip(style.chip, appliedFilters)
                : applyQuickChip(style.chip, appliedFilters),
            )
          : "/deals/search",
      ]),
    );
  }, [appliedFilters, appliedQuickChips, travelStyles]);

  useEffect(() => {
    if (mode !== "landing") {
      return;
    }

    for (const href of styleNavigationHrefs.values()) {
      router.prefetch(href);
    }
  }, [mode, router, styleNavigationHrefs]);

  const styleWindowSize = styleVisibleCount;
  const stylePageCount = Math.max(1, Math.ceil(travelStyles.length / styleWindowSize));
  const clampedStyleStartIndex = Math.min(
    styleStartIndex,
    Math.max(0, travelStyles.length - styleWindowSize),
  );
  const styleCurrentPage = Math.min(
    stylePageCount,
    Math.floor(clampedStyleStartIndex / styleWindowSize) + 1,
  );
  const canMoveStylePrev = clampedStyleStartIndex > 0;
  const canMoveStyleNext = clampedStyleStartIndex + styleWindowSize < travelStyles.length;

  useEffect(() => {
    setStyleStartIndex((current) =>
      Math.min(current, Math.max(0, travelStyles.length - styleWindowSize)),
    );
  }, [styleWindowSize, travelStyles.length]);

  const openOpportunityModal = useCallback(
    (deals: CampaignPreviewDeal[], dealId: string) => {
      setSelectedOpportunityDeals(deals);
      setSelectedOpportunityDealId(dealId);
    },
    [],
  );

  const closeOpportunityModal = useCallback(() => {
    setSelectedOpportunityDealId(null);
    setSelectedOpportunityDeals([]);
  }, []);

  const quickChipAvailability = useMemo(
    () =>
      new Map(
        SEARCH_QUICK_CHIPS.map((chip) => [chip, isQuickChipAvailable(chip, draftFilters, data.deals, now)]),
      ),
    [data.deals, draftFilters, now],
  );

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
    <div className={`deals-explorer${mode === "results" || mode === "city" ? " deals-explorer--results" : ""}`}>
      {mode === "landing" ? (
        <section className="deals-explorer__hero">
          <div className="deals-explorer__intro">
            <p className="deals-explorer__hero-kicker">{t("deals.landingKicker")}</p>
            <h1>
              {t("deals.landingTitleLine1")}
              <br />
              <span className="deals-explorer__headline-accent">{t("deals.landingTitleLine2")}</span>
            </h1>
            <p className="deals-explorer__lede">
              {t("deals.landingLede")}
            </p>
            <div className="deals-explorer__hero-actions">
              <Link className="deals-explorer__cta deals-explorer__cta--hero" href={searchHref}>
                {t("deals.exploreLiveDeals")}
              </Link>
              <a
                className="deals-explorer__secondary-link deals-explorer__secondary-link--hero"
                href="#deal-alerts"
              >
                {t("deals.getDailyAlerts")}
              </a>
            </div>
          </div>
        </section>
      ) : null}

      {mode === "results" ? (
        <nav className="deals-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">{t("common.home")}</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{breadcrumbCurrentLabel}</span>
        </nav>
      ) : null}

      {mode === "landing" ? (
        <section className="deals-explorer__filters">
          <div className="deals-explorer__toolbar">
            <div className="deals-control deals-control--static deals-control--origin-fixed">
              <span>{t("common.from")}</span>
              <strong>Luxembourg</strong>
            </div>

            <DealsSelect
              label={t("common.to")}
              onChange={(nextValue) =>
                setDraftFilters((current) => ({
                  ...current,
                  destinationFilter: nextValue,
                }))
              }
              options={destinationOptions}
              value={draftFilters.destinationFilter}
            />

            <DealsSelect
              label={t("common.when")}
              onChange={(nextValue) =>
                setDraftFilters((current) => ({
                  ...current,
                  whenFilter: nextValue as WhenFilter,
                }))
              }
              options={resultsWhenOptions}
              value={draftFilters.whenFilter}
            />

            <DealsSelect
              label={t("common.tripType")}
              onChange={(nextValue) =>
                setDraftFilters((current) => ({
                  ...current,
                  tripFilter: nextValue as TripFilter,
                }))
              }
              options={resultsTripOptions}
              value={draftFilters.tripFilter}
            />

            <DealsSelect
              label={t("common.budgetMax")}
              onChange={(nextValue) =>
                setDraftFilters((current) => ({
                  ...current,
                  budgetFilter: nextValue as BudgetFilter,
                }))
              }
              options={resultsBudgetOptions}
              value={draftFilters.budgetFilter}
            />

            <label
              className={`deals-toggle${!directOnlyOptionAvailable && !draftFilters.directOnly ? " is-disabled" : ""}`}
            >
              <input
                checked={draftFilters.directOnly}
                disabled={!directOnlyOptionAvailable && !draftFilters.directOnly}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    directOnly: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>{t("common.directOnly")}</span>
            </label>

            <Link className="deals-explorer__cta" href={searchHref}>
              {t("common.viewDeals")}
            </Link>
          </div>

          <div className="deals-explorer__chips">
            {SEARCH_QUICK_CHIPS.map((chip) => (
              <button
                aria-pressed={draftQuickChips.has(chip)}
                className={`deals-explorer__chip${draftQuickChips.has(chip) ? " is-active" : ""}${!quickChipAvailability.get(chip) ? " is-disabled" : ""}`}
                disabled={!quickChipAvailability.get(chip)}
                key={chip}
                onClick={() => {
                  if (!quickChipAvailability.get(chip)) {
                    return;
                  }
                  setDraftFilters((current) =>
                    draftQuickChips.has(chip)
                      ? resetQuickChip(chip, current)
                      : applyQuickChip(chip, current),
                  );
                }}
                type="button"
              >
                {getChipTitle(chip, t)}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {mode === "landing" ? (
        <section className="deals-explorer__signals deals-explorer__signals--below-search" aria-label="Live deal signals">
          <div>
            <span className="deals-explorer__signal-icon" aria-hidden="true">
              <SignalIcon kind="destinations" />
            </span>
            <div className="deals-explorer__signal-copy">
              <strong>
                {destinationCount > 0 ? `${destinationCount} destinations` : "New destinations daily"}
              </strong>
              <span>
                {destinationCount > 0
                  ? "Live from Luxembourg right now"
                  : "Scanned live from Luxembourg"}
              </span>
            </div>
          </div>
          <div>
            <span className="deals-explorer__signal-icon" aria-hidden="true">
              <SignalIcon kind="checked" />
            </span>
            <div className="deals-explorer__signal-copy">
              <strong>{data.updatedAt ? "Latest recorded scan" : "Fare board"}</strong>
              <span>
                {data.updatedAt ? formatVerifiedAge(data.updatedAt, t) : t("deals.updatedAsDealsLand")}
              </span>
            </div>
          </div>
          <div>
            <span className="deals-explorer__signal-icon deals-explorer__signal-icon--accent" aria-hidden="true">
              <SignalIcon kind="discount" />
            </span>
            <div className="deals-explorer__signal-copy">
              <strong>{maxDiscount !== null ? `Largest measured drop: ${maxDiscount}%` : "Historical price context"}</strong>
              <span>based on recorded scanner history</span>
            </div>
          </div>
        </section>
      ) : mode === "city" ? (
        <section className="deals-city-page">
          <div className="deals-city-page__content">
            <section className="deals-city-page__hero">
              <div className="deals-city-page__hero-copy">
                <nav className="deals-breadcrumb deals-breadcrumb--city-hero" aria-label="Breadcrumb">
                  <Link href="/">{t("common.home")}</Link>
                  <span aria-hidden="true">›</span>
                  <span aria-current="page">
                    {lockedDestinationCity ?? selectedSearchGroup?.city ?? t("common.destination")}
                  </span>
                </nav>
                <h1 className="deals-city-page__hero-title">
                  {lockedDestinationCity ?? selectedSearchGroup?.city ?? t("common.destination")}
                </h1>
                <span className="deals-city-page__hero-wave" aria-hidden="true" />
                <p className="deals-city-page__hero-desc">
                  {getDestinationHeroDescription(
                    lockedDestinationCity ?? selectedSearchGroup?.city ?? "this destination",
                    t,
                  )}
                </p>
                <ul className="deals-city-page__hero-trust">
                  <li>
                    <span className="deals-city-page__hero-trust-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                    </span>
                    <span className="deals-city-page__hero-trust-copy">
                      <strong>Recently checked fares</strong>
                      <small>{data.updatedAt ? formatVerifiedAge(data.updatedAt, t) : "No completed scan yet"}</small>
                    </span>
                  </li>
                  <li>
                    <span className="deals-city-page__hero-trust-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 7h16M4 17h16" />
                        <circle cx="9" cy="7" r="2.4" fill="currentColor" stroke="none" />
                        <circle cx="15" cy="17" r="2.4" fill="currentColor" stroke="none" />
                      </svg>
                    </span>
                    <span className="deals-city-page__hero-trust-copy">
                      <strong>{t("deals.hero.flexibleFilters")}</strong>
                      <small>{t("deals.hero.tailorSearch")}</small>
                    </span>
                  </li>
                  <li>
                    <span className="deals-city-page__hero-trust-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 3l7 3v5c0 4.6-3 7.7-7 9-4-1.3-7-4.4-7-9V6z" />
                        <path d="M9 12l2 2 4-4" />
                      </svg>
                    </span>
                    <span className="deals-city-page__hero-trust-copy">
                      <strong>Recorded fare details</strong>
                      <small>Dates, routing and verification time</small>
                    </span>
                  </li>
                </ul>
              </div>

              <div className="deals-city-page__hero-visual">
                {cityHeroDeal ? (
                  <figure className="deals-city-page__media" aria-hidden="true">
                    <LandmarkPhoto
                      alt={`${lockedDestinationCity ?? cityHeroDeal.destinationCity} landmark`}
                      destinationCity={lockedDestinationCity ?? cityHeroDeal.destinationCity}
                      landmarkTitle={getLandmarkTitle(cityHeroDeal)}
                      priority
                    />
                  </figure>
                ) : null}
                <div className="deals-city-page__hero-summary">
                  <span>
                    {opportunityDeals.length} {opportunityDeals.length === 1 ? t("deals.fare") : t("deals.fares")}
                  </span>
                  <strong>
                    <span className="deals-city-page__hero-summary-prefix">{t("common.from").toLowerCase()}</span>
                    {formatCurrency(cityLowestPrice ?? selectedSearchGroup?.lowestPrice ?? 0)}
                  </strong>
                  <small>
                    <span className="deals-city-page__hero-summary-clock" aria-hidden="true">
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
                    {data.updatedAt ? formatVerifiedAge(data.updatedAt, t) : t("deals.updatedAsDealsLand")}
                  </small>
                </div>
              </div>
            </section>

            <section className="deals-search-layout">
              <aside className="deals-search-layout__filters">
                <div className="deals-search-sidebar">
                  <div className="deals-search-sidebar__section">
                    <div className="deals-search-fixed-route">
                      <div className="deals-control deals-control--static deals-control--origin-fixed">
                        <span>{t("deals.searchFrom")}</span>
                        <strong>Luxembourg (LUX)</strong>
                      </div>
                      <div className="deals-search-fixed-route__destination">
                        <span>{t("common.destination")}</span>
                        <strong>{lockedDestinationCity ?? selectedSearchGroup?.city ?? t("common.destination")}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="deals-search-sidebar__section">
                    <DealsSelect
                      label={t("deals.departureDay")}
                      onChange={(nextValue) =>
                        setDraftFilters((current) => ({
                          ...current,
                          departureWeekdayFilter: nextValue as DepartureWeekdayFilter,
                        }))
                      }
                      options={departureWeekdayOptions}
                      value={draftFilters.departureWeekdayFilter}
                    />

                    <DealsSelect
                      label={t("common.when")}
                      onChange={(nextValue) =>
                        setDraftFilters((current) => ({
                          ...current,
                          whenFilter: nextValue as WhenFilter,
                        }))
                      }
                      options={resultsWhenOptions}
                      value={draftFilters.whenFilter}
                    />

                    <DealsSelect
                      label={t("common.tripType")}
                      onChange={(nextValue) =>
                        setDraftFilters((current) => ({
                          ...current,
                          tripFilter: nextValue as TripFilter,
                        }))
                      }
                      options={resultsTripOptions}
                      value={draftFilters.tripFilter}
                    />

                    <DealsSelect
                      label={t("common.budgetMax")}
                      onChange={(nextValue) =>
                        setDraftFilters((current) => ({
                          ...current,
                          budgetFilter: nextValue as BudgetFilter,
                        }))
                      }
                      options={resultsBudgetOptions}
                      value={draftFilters.budgetFilter}
                    />

                    <label
                      className={`deals-toggle${!directOnlyOptionAvailable && !draftFilters.directOnly ? " is-disabled" : ""}`}
                    >
                      <input
                        checked={draftFilters.directOnly}
                        disabled={!directOnlyOptionAvailable && !draftFilters.directOnly}
                        onChange={(event) =>
                          setDraftFilters((current) => ({
                            ...current,
                            directOnly: event.target.checked,
                          }))
                        }
                        type="checkbox"
                      />
                      <span>{t("common.directOnly")}</span>
                    </label>
                  </div>

                  <div className="deals-search-sidebar__section">
                    <p className="deals-explorer__kicker">{t("deals.quickFilters")}</p>
                    <div className="deals-search-sidebar__chips">
                      {SEARCH_QUICK_CHIPS.map((chip) => (
                        <button
                          aria-pressed={draftQuickChips.has(chip)}
                          className={`deals-explorer__chip${draftQuickChips.has(chip) ? " is-active" : ""}${!quickChipAvailability.get(chip) ? " is-disabled" : ""}`}
                          disabled={!quickChipAvailability.get(chip)}
                          key={chip}
                          onClick={() => {
                            if (!quickChipAvailability.get(chip)) {
                              return;
                            }
                            setDraftFilters((current) =>
                              draftQuickChips.has(chip)
                                ? resetQuickChip(chip, current)
                                : applyQuickChip(chip, current),
                            );
                          }}
                          type="button"
                        >
                          {getChipTitle(chip, t)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </aside>

              <div className="deals-search-layout__results">
                <section className="deals-explorer__featured">
                  <div className="deals-explorer__section-head">
                    <div>
                      <h2>{t("deals.liveFaresTitle", { destination: lockedDestinationCity ?? selectedSearchGroup?.city ?? t("deals.thisDestination") })}</h2>
                      <p>
                        {t("deals.liveFaresDesc")}
                      </p>
                    </div>
                    <div className="deals-explorer__section-actions">
                      <DealsSelect
                        className="deals-results-sort"
                        label="Sort by"
                        onChange={(nextValue) => setSortOrder(nextValue as DealSearchSort)}
                        options={DEAL_SORT_OPTIONS}
                        value={sortOrder}
                      />
                      <span>{opportunityDeals.length} {opportunityDeals.length === 1 ? t("deals.fare") : t("deals.fares")}</span>
                    </div>
                  </div>

                  {activeFilterChips.length > 0 ? (
                    <div className="deals-active-filters" aria-label={t("deals.activeFilters")}>
                      <span className="deals-active-filters__label">{t("deals.activeFilters")}</span>
                      <div className="deals-active-filters__chips">
                        {activeFilterChips.map((chip) => (
                          <button
                            className="deals-active-filters__chip"
                            key={chip.key}
                            onClick={chip.onRemove}
                            type="button"
                          >
                            <span>{chip.label}</span>
                            <i aria-hidden="true">×</i>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

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
                            combinationsCount={destinationCounts.get(getDestinationCountKey(deal)) ?? 1}
                            key={`results-${selectedSearchGroup.key}-${deal.id}`}
                            deal={deal}
                          />
                        ))}
                      </div>
                      <ResultsPagination
                        onPageChange={setResultsPage}
                        page={clampedResultsPage}
                        pageCount={resultsPageCount}
                        total={resultsSourceDeals.length}
                      />
                    </div>
                  ) : null}
                </section>
              </div>
            </section>
          </div>
        </section>
      ) : (
        <div className="deals-search-page-card">
          <section className="deals-search-layout">
            <aside className="deals-search-layout__filters">
              <div className="deals-search-sidebar">
              <div className="deals-search-sidebar__section">
                <div className="deals-control deals-control--static deals-control--origin-fixed">
                  <span>{t("deals.searchFrom")}</span>
                  <strong>Luxembourg (LUX)</strong>
                </div>
              </div>

              <div className="deals-search-sidebar__section">
                <DealsSelect
                  label={t("common.destination")}
                  onChange={(nextValue) =>
                    setDraftFilters((current) => ({
                      ...current,
                      destinationFilter: nextValue,
                    }))
                  }
                  options={destinationOptions}
                  value={draftFilters.destinationFilter}
                />

                <DealsSelect
                  label={t("deals.departureDay")}
                  onChange={(nextValue) =>
                    setDraftFilters((current) => ({
                      ...current,
                      departureWeekdayFilter: nextValue as DepartureWeekdayFilter,
                    }))
                  }
                  options={departureWeekdayOptions}
                  value={draftFilters.departureWeekdayFilter}
                />

                <DealsSelect
                  label={t("common.when")}
                  onChange={(nextValue) =>
                    setDraftFilters((current) => ({
                      ...current,
                      whenFilter: nextValue as WhenFilter,
                    }))
                  }
                  options={resultsWhenOptions}
                  value={draftFilters.whenFilter}
                />

                <DealsSelect
                  label={t("common.tripType")}
                  onChange={(nextValue) =>
                    setDraftFilters((current) => ({
                      ...current,
                      tripFilter: nextValue as TripFilter,
                    }))
                  }
                  options={resultsTripOptions}
                  value={draftFilters.tripFilter}
                />

                <DealsSelect
                  label={t("common.budgetMax")}
                  onChange={(nextValue) =>
                    setDraftFilters((current) => ({
                      ...current,
                      budgetFilter: nextValue as BudgetFilter,
                    }))
                  }
                  options={resultsBudgetOptions}
                  value={draftFilters.budgetFilter}
                />

                <label
                  className={`deals-toggle${!directOnlyOptionAvailable && !draftFilters.directOnly ? " is-disabled" : ""}`}
                >
                  <input
                    checked={draftFilters.directOnly}
                    disabled={!directOnlyOptionAvailable && !draftFilters.directOnly}
                    onChange={(event) =>
                      setDraftFilters((current) => ({
                        ...current,
                        directOnly: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  <span>{t("common.directOnly")}</span>
                </label>
              </div>

              <div className="deals-search-sidebar__section">
                <p className="deals-explorer__kicker">{t("deals.quickFilters")}</p>
                <div className="deals-search-sidebar__chips">
                  {SEARCH_QUICK_CHIPS.map((chip) => (
                    <button
                      aria-pressed={draftQuickChips.has(chip)}
                      className={`deals-explorer__chip${draftQuickChips.has(chip) ? " is-active" : ""}${!quickChipAvailability.get(chip) ? " is-disabled" : ""}`}
                      disabled={!quickChipAvailability.get(chip)}
                      key={chip}
                      onClick={() => {
                        if (!quickChipAvailability.get(chip)) {
                          return;
                        }
                        setDraftFilters((current) =>
                          draftQuickChips.has(chip)
                            ? resetQuickChip(chip, current)
                            : applyQuickChip(chip, current),
                        );
                      }}
                      type="button"
                    >
                      {getChipTitle(chip, t)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          <div className="deals-search-layout__results">
            <section className="deals-explorer__featured">
              <div className="deals-explorer__section-head">
                <div>
                  <h2>{searchResultsCopy.title}</h2>
                  <p>{searchResultsCopy.description}</p>
                </div>
                <div className="deals-explorer__section-actions">
                  <DealsSelect
                    className="deals-results-sort"
                    label="Sort by"
                    onChange={(nextValue) => setSortOrder(nextValue as DealSearchSort)}
                    options={DEAL_SORT_OPTIONS}
                    value={sortOrder}
                  />
                  <span>{opportunityDeals.length} {opportunityDeals.length === 1 ? t("deals.fare") : t("deals.fares")}</span>
                </div>
              </div>

              {activeFilterChips.length > 0 ? (
                <div className="deals-active-filters" aria-label={t("deals.activeFilters")}>
                  <span className="deals-active-filters__label">{t("deals.activeFilters")}</span>
                  <div className="deals-active-filters__chips">
                    {activeFilterChips.map((chip) => (
                      <button
                        className="deals-active-filters__chip"
                        key={chip.key}
                        onClick={chip.onRemove}
                        type="button"
                      >
                        <span>{chip.label}</span>
                        <i aria-hidden="true">×</i>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {opportunityDeals.length === 0 ? (
                <div className="deals-explorer__empty">
                  <h3>{t("deals.noFaresTitle")}</h3>
                  <p>{t("deals.noFaresDesc")}</p>
                </div>
              ) : selectedSearchGroup ? (
                <div className="deals-search-expanded">
                  <div className="deals-search-expanded__header">
                    <div className="deals-search-expanded__copy">
                      <p className="deals-explorer__kicker">{t("deals.selectedDestination")}</p>
                      <Link
                        className="deals-search-expanded__city-link"
                        href={buildDestinationDealsHref(selectedSearchGroup.city)}
                      >
                        {selectedSearchGroup.city}
                      </Link>
                      <p>
                        {selectedSearchGroup.deals.length}{" "}
                        {selectedSearchGroup.deals.length === 1 ? t("deals.deal") : t("deals.deals")} · {t("common.from").toLowerCase()}{" "}
                        {formatCurrency(selectedSearchGroup.lowestPrice)}
                      </p>
                    </div>
                    <div className="deals-search-expanded__actions">
                      <button
                        className="deals-explorer__secondary-link"
                        onClick={() => setOpenSearchCityGroups(new Set())}
                        type="button"
                      >
                        ← {t("deals.backToDestinations")}
                      </button>
                    </div>
                  </div>

                  <div className="deals-search-expanded__results">
                    {paginatedResultDeals.map((deal) => (
                      <SearchResultCard
                        combinationsCount={destinationCounts.get(getDestinationCountKey(deal)) ?? 1}
                        key={`results-${selectedSearchGroup.key}-${deal.id}`}
                        deal={deal}
                      />
                    ))}
                  </div>
                  <ResultsPagination
                    onPageChange={setResultsPage}
                    page={clampedResultsPage}
                    pageCount={resultsPageCount}
                    total={resultsSourceDeals.length}
                  />
                </div>
              ) : (
                <div className="deals-search-expanded">
                  <div className="deals-search-expanded__results">
                    {paginatedResultDeals.map((deal) => (
                      <SearchResultCard
                        combinationsCount={destinationCounts.get(getDestinationCountKey(deal)) ?? 1}
                        key={`results-all-${deal.id}`}
                        deal={deal}
                        showCityLabel
                      />
                    ))}
                  </div>
                  <ResultsPagination
                    onPageChange={setResultsPage}
                    page={clampedResultsPage}
                    pageCount={resultsPageCount}
                    total={resultsSourceDeals.length}
                  />
                </div>
              )}
              </section>
            </div>
          </section>
        </div>
      )}

      {mode === "landing" ? (
        <section className="deals-explorer__featured">
          <h2 className="sr-only">{t("deals.results.defaultTitle")}</h2>

          {opportunityDeals.length === 0 ? (
            <div className="deals-explorer__empty deals-explorer__empty--landing">
              <span className="deals-explorer__empty-icon" aria-hidden="true">
                <SignalIcon kind="destinations" />
              </span>
              <h3>{t("deals.boardRefreshingTitle")}</h3>
              <p>{t("deals.boardRefreshingDesc")}</p>
              <div className="deals-explorer__empty-actions">
                <a className="deals-explorer__cta" href="#deal-alerts">
                  {t("deals.getNotifiedFirst")}
                </a>
              </div>
            </div>
          ) : (
            <div className="deals-explorer__opportunity-stage">
              {featuredPageCount > 1 ? (
              <div className="deals-explorer__opportunity-hero-nav" aria-label="Featured destinations">
                <span className="deals-explorer__carousel-page">
                  {featuredCurrentPage}/{featuredPageCount}
                </span>
                <button
                  aria-label="Previous featured destination"
                  className="deals-explorer__carousel-button deals-explorer__carousel-button--hero"
                  disabled={!canMoveFeaturedPrev}
                  onClick={() =>
                    setFeaturedStartIndex((current) => Math.max(0, current - featuredWindowSize))
                  }
                  type="button"
                >
                  <CarouselChevronIcon direction="previous" />
                </button>
                <button
                  aria-label="Next featured destination"
                  className="deals-explorer__carousel-button deals-explorer__carousel-button--hero"
                  disabled={!canMoveFeaturedNext}
                  onClick={() =>
                    setFeaturedStartIndex((current) =>
                      Math.min(
                        Math.max(0, featuredNow.length - featuredWindowSize),
                        current + featuredWindowSize,
                      ),
                    )
                  }
                  type="button"
                >
                  <CarouselChevronIcon direction="next" />
                </button>
              </div>
              ) : null}
              <div
                className="deals-explorer__opportunity-viewport deals-explorer__opportunity-viewport--hero"
                style={
                  {
                    "--opportunity-visible": String(featuredWindowSize),
                  } as CSSProperties
                }
              >
                <div
                  className="deals-explorer__opportunity-track deals-explorer__opportunity-track--hero"
                  style={{
                    transform: `translateX(-${clampedFeaturedStartIndex * 100}%)`,
                  }}
                >
                  {featuredNow.map((deal) => (
                    <FeaturedOpportunityCard
                      combinationsCount={destinationCounts.get(getDestinationCountKey(deal)) ?? 1}
                      key={`featured-${deal.id}`}
                      deal={deal}
                      onOpen={() => openOpportunityModal(featuredNow, deal.id)}
                      variant="hero"
                    />
                  ))}
                </div>
              </div>
              {featuredNow.length > 1 ? (
              <div className="deals-explorer__carousel-dots" aria-label="Featured carousel slides">
                {featuredNow.map((deal, index) => (
                  <button
                    aria-current={index === clampedFeaturedStartIndex ? "true" : undefined}
                    aria-label={`Show featured destination ${index + 1}`}
                    className={`deals-explorer__carousel-dot${
                      index === clampedFeaturedStartIndex ? " is-active" : ""
                    }`}
                    key={`featured-dot-${deal.id}`}
                    onClick={() => setFeaturedStartIndex(index)}
                    type="button"
                  />
                ))}
              </div>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      {mode === "landing" && travelStyles.length > 0 ? (
        <section className="deals-explorer__styles">
        <div className="deals-explorer__section-head">
          <div>
            <h2>Explore the board by travel rhythm.</h2>
            <p>Each shortcut narrows the live board to a practical trip style.</p>
          </div>
          {stylePageCount > 1 ? (
          <div className="deals-explorer__carousel-nav">
            <span className="deals-explorer__carousel-page">
              {styleCurrentPage}/{stylePageCount}
            </span>
            <button
              aria-label="Show previous travel styles"
              className="deals-explorer__carousel-button"
              disabled={!canMoveStylePrev}
              onClick={() =>
                setStyleStartIndex((current) => Math.max(0, current - styleWindowSize))
              }
              type="button"
            >
              <CarouselChevronIcon direction="previous" />
            </button>
            <button
              aria-label="Show next travel styles"
              className="deals-explorer__carousel-button"
              disabled={!canMoveStyleNext}
              onClick={() =>
                setStyleStartIndex((current) =>
                  Math.min(
                    Math.max(0, travelStyles.length - styleWindowSize),
                    current + styleWindowSize,
                  ),
                )
              }
              type="button"
            >
              <CarouselChevronIcon direction="next" />
            </button>
          </div>
          ) : null}
        </div>

        <div
          className="deals-explorer__style-viewport"
          style={
            {
              "--style-visible": String(styleWindowSize),
            } as CSSProperties
          }
        >
          <div
            className="deals-explorer__style-track"
            style={{
              transform: `translateX(calc((((100% - (var(--style-gap) * (var(--style-visible) - 1))) / var(--style-visible)) + var(--style-gap)) * -${clampedStyleStartIndex}))`,
            }}
          >
            {travelStyles.map((style) => (
              <Link
                className={`deals-style-card${style.chip && appliedQuickChips.has(style.chip) ? " is-active" : ""}`}
                href={styleNavigationHrefs.get(style.key) ?? "/deals/search"}
                key={style.key}
              >
                <div className="deals-style-card__media" aria-hidden="true">
                  <LandmarkPhoto
                    alt={`${style.label} background`}
                    destinationCity={style.imageCity}
                    landmarkTitle={style.imageLandmarkTitle}
                  />
                  <div className="deals-style-card__overlay" />
                </div>
                <div className="deals-style-card__content">
                  <span className={`deals-style-card__icon ${style.accentClass}`} aria-hidden="true">
                    {style.icon}
                  </span>
                  <div className="deals-style-card__copy">
                    <strong>{style.label}</strong>
                    <p>{style.description}</p>
                    <em>{style.fromPrice !== null ? `from ${formatCurrency(style.fromPrice)}` : "No live fare yet"}</em>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
        </section>
      ) : null}

        <section className="deals-explorer__newsletter" id="deal-alerts">
          <div className="deals-explorer__newsletter-float deals-explorer__newsletter-float--top-left">
            <strong>Price context</strong>
            <span>Compared with history</span>
          </div>

          <div className="deals-explorer__newsletter-float deals-explorer__newsletter-float--top-right">
            <strong>Route alerts</strong>
            <span>From Luxembourg</span>
          </div>

          <div className="deals-explorer__newsletter-float deals-explorer__newsletter-float--bottom-left">
            <strong>Flexible dates</strong>
            <span>Useful trip patterns</span>
          </div>

          <div className="deals-explorer__newsletter-float deals-explorer__newsletter-float--bottom-right">
            <strong>Clear choices</strong>
            <span>Dates and routing shown</span>
          </div>

        <div className="deals-explorer__newsletter-content">
          <h2>Get daily flight drops. Book before they disappear</h2>

          <div className="deals-explorer__newsletter-panel">
            <NewsletterForm />
          </div>

          <div className="deals-explorer__newsletter-signals" aria-label="Newsletter benefits">
            <span>Price-drop alerts</span>
            <span>Direct route picks</span>
            <span>School-break matches</span>
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
              <p>Cheap flights from Luxembourg, shaped around real trips.</p>
            </div>
          </div>

          <div className="deals-explorer__footer-links">
            {DEALS_FOOTER_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </div>

          <div className="deals-explorer__footer-socials" aria-label="Social links">
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
            <span>Made in Luxembourg</span>
          </div>

          <div className="deals-explorer__footer-seal" aria-label="Made in Luxembourg">
            <div className="deals-explorer__footer-seal-copy">
              <strong>Made in Luxembourg</strong>
              <span>
                with
                <i aria-hidden="true">
                  <FooterSealHeartIcon />
                </i>
                for travelers
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
          combinationsCount={destinationCounts.get(getDestinationCountKey(selectedOpportunityDeal)) ?? 1}
          deal={selectedOpportunityDeal}
          onClose={closeOpportunityModal}
          onNext={() => {
            if (
              selectedOpportunityDealIndex >= 0 &&
              selectedOpportunityDealIndex < selectedOpportunityDeals.length - 1
            ) {
              setSelectedOpportunityDealId(
                selectedOpportunityDeals[selectedOpportunityDealIndex + 1]?.id ?? null,
              );
            }
          }}
          onPrevious={() => {
            if (selectedOpportunityDealIndex > 0) {
              setSelectedOpportunityDealId(
                selectedOpportunityDeals[selectedOpportunityDealIndex - 1]?.id ?? null,
              );
            }
          }}
        />
      ) : null}
    </div>
  );
}
