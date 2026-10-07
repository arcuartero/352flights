import "server-only";
import type { CampaignSendType } from "@/lib/ops-shared";
import { weeklyEmailCopy } from "@/lib/weekly-email-copy";
import {
  type EmailLocale,
  campaignRouteCopy,
  getCopy,
  multiCityAirportNames,
  normalizeEmailLocale,
} from "./copy";

export const BRAND_NAME = "+352 Flights";

const EMAIL_ASSET_REVISION = "20260822-1";

export function versionEmailAsset(url: string) {
  return `${url}?v=${EMAIL_ASSET_REVISION}`;
}

export type RenderableDeal = {
  id: string;
  title: string;
  summary: string;
  routeLabel: string;
  routeBucket: string;
  destinationCity: string;
  destinationAirport: string;
  dealPrice: number;
  baselinePrice: number | null;
  dropRatio: number | null;
  departureDate: string | null;
  returnDate: string | null;
  tripNights: number;
  maxStops: string;
  airlineSummary: string | null;
  outboundDepartureAt: string | null;
  outboundArrivalAt: string | null;
  returnDepartureAt: string | null;
  returnArrivalAt: string | null;
  destinationStayHours: number | null;
  verifiedAt: string | null;
  bookingUrl: string | null;
};

function splitCampaignRouteLabel(routeLabel: string) {
  const divider = " · ";
  const dividerIndex = routeLabel.indexOf(divider);

  if (dividerIndex === -1) {
    return { routeLabel: routeLabel.trim(), patternLabel: null };
  }

  return {
    routeLabel: routeLabel.slice(0, dividerIndex).trim(),
    patternLabel:
      routeLabel.slice(dividerIndex + divider.length).trim() || null,
  };
}

export function formatCampaignRouteLabel(deal: RenderableDeal) {
  const { routeLabel } = splitCampaignRouteLabel(deal.routeLabel);
  const airportName =
    multiCityAirportNames[deal.destinationAirport.toUpperCase()];

  if (!airportName) {
    return routeLabel;
  }

  const cityAndAirport = `${deal.destinationCity} · ${airportName}`;
  return /\([^)]*\)\s*$/.test(routeLabel)
    ? routeLabel.replace(/\([^)]*\)\s*$/, `(${cityAndAirport})`)
    : `${routeLabel} (${cityAndAirport})`;
}

function localizeCampaignPattern(
  patternLabel: string | null,
  locale?: EmailLocale | null,
) {
  if (!patternLabel) {
    return null;
  }

  const normalizedLocale = normalizeEmailLocale(locale);
  const routeCopy = campaignRouteCopy[normalizedLocale];
  const match = patternLabel.match(
    /^([A-Za-z]{3})\s*->\s*(next\s+)?([A-Za-z]{3})$/i,
  );

  if (!match) {
    return null;
  }

  const departureKey = `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}`;
  const arrivalKey = `${match[3][0].toUpperCase()}${match[3].slice(1).toLowerCase()}`;
  const departure = routeCopy.weekdays[departureKey];
  const arrival = routeCopy.weekdays[arrivalKey];

  if (!departure || !arrival) {
    return null;
  }

  return match[2]
    ? routeCopy.nextPattern(departure, arrival)
    : `${departure} -> ${arrival}`;
}

export function formatCampaignDealTitle(
  deal: RenderableDeal,
  locale?: EmailLocale | null,
) {
  const normalizedLocale = normalizeEmailLocale(locale);
  return campaignRouteCopy[normalizedLocale].title(deal.destinationCity);
}

export function formatCampaignDealPattern(
  deal: RenderableDeal,
  locale?: EmailLocale | null,
) {
  const normalizedLocale = normalizeEmailLocale(locale);
  const { patternLabel } = splitCampaignRouteLabel(deal.routeLabel);
  return localizeCampaignPattern(patternLabel, normalizedLocale);
}

export function formatCurrency(
  value: number,
  locale?: EmailLocale | null,
  currency: string = "EUR",
) {
  const copy = getCopy(locale);
  return new Intl.NumberFormat(copy.intlLocale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDateWithWeekday(
  value: string | null,
  locale?: EmailLocale | null,
) {
  if (!value) {
    return getCopy(locale).flexibleDates;
  }

  return new Intl.DateTimeFormat(getCopy(locale).intlLocale, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatCampaignDateRange(
  from: string | null,
  to: string | null,
  locale?: EmailLocale | null,
) {
  if (!from || !to) {
    return getCopy(locale).flexibleDates;
  }

  const intlLocale = getCopy(locale).intlLocale;
  const departure = new Intl.DateTimeFormat(intlLocale, {
    day: "2-digit",
    month: "short",
  }).format(new Date(from));
  const arrival = new Intl.DateTimeFormat(intlLocale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(to));

  return `${departure} — ${arrival}`;
}

export function formatCampaignTiming(
  label: string,
  departure: string,
  arrival: string,
) {
  return `${label} ${departure} — ${arrival}`;
}

export function formatFlightClock(value: string | null, locale?: EmailLocale | null) {
  if (!value) {
    return getCopy(locale).notAvailable;
  }

  return new Intl.DateTimeFormat(getCopy(locale).intlLocale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Luxembourg",
  }).format(new Date(value));
}

export function formatFlightWeekdayClock(
  value: string | null,
  locale?: EmailLocale | null,
) {
  if (!value) {
    return getCopy(locale).notAvailable;
  }

  return new Intl.DateTimeFormat(getCopy(locale).intlLocale, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Luxembourg",
  }).format(new Date(value));
}

export function formatStayHours(value: number | null, locale?: EmailLocale | null) {
  if (value === null) {
    return null;
  }

  const rounded = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  return getCopy(locale).stayHours(rounded);
}

export function formatVerifiedAge(
  value: string | null,
  locale?: EmailLocale | null,
  now: Date = new Date(),
) {
  const copy = getCopy(locale);
  if (!value) {
    return copy.verifiedRecently;
  }

  const diffMs = now.getTime() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 60_000) {
    return copy.verifiedJustNow;
  }

  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 60) {
    return copy.verifiedMinutesAgo(diffMinutes);
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return copy.verifiedHoursAgo(diffHours);
  }

  const diffDays = Math.round(diffHours / 24);
  return copy.verifiedDaysAgo(diffDays);
}

export function formatStops(maxStops: string, locale?: EmailLocale | null) {
  const copy = getCopy(locale);
  if (maxStops === "NON_STOP" || maxStops === "ONE_STOP_OR_FEWER") {
    return copy.stops[maxStops];
  }

  return copy.unknownStops(maxStops);
}

export function formatDrop(dropRatio: number | null, locale?: EmailLocale | null) {
  if (dropRatio === null) {
    return getCopy(locale).drop(null);
  }

  return getCopy(locale).drop(Math.round((1 - dropRatio) * 100));
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderPlainEmailAddress(value: string) {
  const separatorIndex = value.lastIndexOf("@");

  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return escapeHtml(value);
  }

  return [
    `<span>${escapeHtml(value.slice(0, separatorIndex))}</span>`,
    `<span>&#64;</span>`,
    `<span>${escapeHtml(value.slice(separatorIndex + 1))}</span>`,
  ].join("");
}

export function buildDealHeadline(
  sendType: CampaignSendType,
  deals: RenderableDeal[],
  locale?: EmailLocale | null,
) {
  const copy = getCopy(locale);
  if (sendType === "weekly")
    return weeklyEmailCopy[normalizeEmailLocale(locale)].title;
  if (sendType === "flash") {
    return copy.headlineFlash;
  }

  return deals.length === 1 ? copy.headlineSingle : copy.headlineDigest;
}
