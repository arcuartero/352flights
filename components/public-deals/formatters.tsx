"use client";

import { type Locale } from "@/lib/i18n";
import type { CampaignPreviewDeal } from "@/lib/ops-shared";
import {
  getPublicAirlineNames,
  normalizePublicAirlineName,
} from "@/lib/public-airlines";
import {
  type DepartureWeekdayFilter,
  type DurationFilter,
} from "@/lib/public-deals-search";
import { normalizeStayBucket } from "@/lib/stay-buckets";
import { type Translate } from "@/components/public-deals/types";
import {
  AIRLINE_LOGO_CODE_BY_NAME,
  AIRPORT_TIME_ZONE_BY_CODE,
  STRONG_PRICE_VISUAL_RATIO,
} from "@/components/public-deals/constants";

export function getIntlLocale(locale: Locale) {
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

export function normalizeDestinationKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function formatCurrency(value: number, currency: string = "EUR") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDateWithWeekday(value: string | null, locale: Locale) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDateWithoutWeekday(value: string | null, locale: Locale) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatLegDate(value: string | null, locale: Locale) {
  if (!value) {
    return "n/a";
  }

  const formatted = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
    .format(new Date(value))
    .replace(/,/g, "");

  return `${formatted.charAt(0).toUpperCase()}${formatted.slice(1)}`;
}

export function formatFlightClock(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatFlightTime(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function parseLocalDateTimeParts(value: string) {
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

export function getArrivalDayOffset(
  departureAt: string | null,
  arrivalAt: string | null,
) {
  if (!departureAt || !arrivalAt) {
    return 0;
  }

  const departure = parseLocalDateTimeParts(departureAt);
  const arrival = parseLocalDateTimeParts(arrivalAt);
  if (!departure || !arrival) {
    return 0;
  }

  const departureDay = Date.UTC(
    departure.year,
    departure.month - 1,
    departure.day,
  );
  const arrivalDay = Date.UTC(arrival.year, arrival.month - 1, arrival.day);
  const dayOffset = Math.round((arrivalDay - departureDay) / 86_400_000);

  return Math.max(0, dayOffset);
}

export function formatArrivalDayOffsetLabel(dayOffset: number, locale: Locale) {
  return new Intl.RelativeTimeFormat(locale, {
    numeric: "always",
    style: "long",
  }).format(dayOffset, "day");
}

export function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
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

export function localAirportDateTimeToUtcMs(
  value: string,
  airportCode: string,
) {
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

export function formatFlightDuration(
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

export function formatStayHours(
  value: number | null,
  nights: number,
  t?: Translate,
) {
  if (value === null) {
    return `${nights} ${
      nights === 1
        ? t
          ? t("deals.night")
          : "night"
        : t
          ? t("deals.nights")
          : "nights"
    }`;
  }

  const rounded = Math.max(0, Math.round(value));
  const days = Math.floor(rounded / 24);
  const hours = rounded % 24;

  if (days > 0 && hours > 0) {
    return t
      ? t("deals.duration.daysHours", { days, hours })
      : `${days}d and ${hours}h`;
  }

  if (days > 0) {
    return t ? t("deals.duration.days", { days }) : `${days}d`;
  }

  return t ? t("deals.duration.hours", { hours }) : `${hours}h`;
}

export function formatDestinationStay(
  value: number | null,
  nights: number,
  t: Translate,
) {
  return t("deals.stayAtDestination", {
    duration: formatStayHours(value, nights, t),
  });
}

export function formatVerifiedAge(
  value: string | null,
  t?: Translate,
  now: Date = new Date(),
) {
  if (!value) {
    return t ? t("deals.verifiedFresh") : "Freshly checked";
  }

  const diffMs = now.getTime() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 60_000) {
    return t ? t("deals.verifiedJustNow") : "Verified just now";
  }

  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 60) {
    return t
      ? t("deals.verifiedMinutesAgo", { count: diffMinutes })
      : `Verified ${diffMinutes} min ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return t
      ? t("deals.verifiedHoursAgo", { count: diffHours })
      : `Verified ${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return t
    ? t("deals.verifiedDaysAgo", { count: diffDays })
    : `Verified ${diffDays}d ago`;
}

export function formatDepartureMonth(
  value: string | null,
  locale: Locale,
  t: Translate,
) {
  if (!value) {
    return t("deals.newsletter.flexibleDates");
  }

  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    month: "short",
  }).format(new Date(value));
}

export function formatSearchSavingsLabel(
  deal: CampaignPreviewDeal,
  t?: Translate,
) {
  const belowPct = Math.max(0, Math.round((1 - (deal.dropRatio ?? 1)) * 100));
  const abovePct = Math.max(0, Math.round(((deal.dropRatio ?? 1) - 1) * 100));
  const usualPrice =
    deal.baselinePrice !== null ? formatCurrency(deal.baselinePrice) : "";
  const usualSuffix = usualPrice ? ` (${usualPrice})` : "";

  switch (deal.pricePosition) {
    case "exceptional":
    case "below_usual":
      return t
        ? `${t("deals.belowUsual", { pct: belowPct })}${usualSuffix}`
        : `${belowPct}% below usual${usualSuffix}`;
    case "typical":
      return t
        ? t("deals.priceTypical", { usualSuffix })
        : `Around the usual price${usualSuffix}`;
    case "above_usual":
      return t
        ? t("deals.priceAboveUsual", { pct: abovePct, usualSuffix })
        : `${abovePct}% above the usual price${usualSuffix}`;
    case "new_price":
    default:
      return t ? t("deals.priceNew") : "Fresh fare · building price history";
  }
}

export function formatComparisonWeekday(value: string | null, locale: Locale) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

export function formatUsualPriceExplanation(
  deal: CampaignPreviewDeal,
  locale: Locale,
  t?: Translate,
) {
  if (deal.baselinePrice === null) {
    return null;
  }

  const duration = `${deal.tripNights} ${
    deal.tripNights === 1
      ? t
        ? t("deals.night")
        : "night"
      : t
        ? t("deals.nights")
        : "nights"
  }`;
  const values = {
    count: deal.historyPoints,
    destination: deal.destinationCity,
    outboundWeekday: formatComparisonWeekday(deal.departureDate, locale),
    returnWeekday: formatComparisonWeekday(deal.returnDate, locale),
    duration,
  };

  return t
    ? t("deals.usualPriceExplanation", values)
    : `Usual price: median of ${values.count} recent fares to ${values.destination} leaving on ${values.outboundWeekday}, returning on ${values.returnWeekday}, with a ${values.duration} stay.`;
}

export function isStrongPriceDeal(deal: CampaignPreviewDeal) {
  return deal.dropRatio !== null && deal.dropRatio <= STRONG_PRICE_VISUAL_RATIO;
}

export function getDurationFilterValue(
  deal: CampaignPreviewDeal,
): Exclude<DurationFilter, "any"> {
  const nights = Math.max(1, deal.tripNights);
  return nights >= 6
    ? "6_plus"
    : (String(nights) as Exclude<DurationFilter, "any">);
}

export function getDepartureWeekdayFilterValue(
  value: string | null,
): DepartureWeekdayFilter {
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

export function formatDropLine(deal: CampaignPreviewDeal, t: Translate) {
  if (deal.baselinePrice === null || deal.dropRatio === null) {
    return t("deals.modal.freshMarketFare");
  }

  if (deal.pricePosition === "above_usual") {
    const pct = Math.max(0, Math.round((deal.dropRatio - 1) * 100));
    return t("deals.modal.aboveUsual", {
      price: formatCurrency(deal.baselinePrice),
      pct,
    });
  }

  if (deal.pricePosition === "typical") {
    return t("deals.modal.typicalPrice", {
      price: formatCurrency(deal.baselinePrice),
    });
  }

  const saved = Math.max(0, deal.baselinePrice - deal.dealPrice);
  const pct = Math.max(0, Math.round((1 - deal.dropRatio) * 100));
  return t("deals.modal.savings", {
    price: formatCurrency(deal.baselinePrice),
    saved: formatCurrency(saved),
    pct,
  });
}

export function getFareBadgeLabel(deal: CampaignPreviewDeal, t: Translate) {
  if (deal.pricePosition === "new_price") {
    return t("deals.newFare");
  }

  if (deal.pricePosition === "typical") {
    return t("deals.typical");
  }

  if (deal.pricePosition === "above_usual") {
    return `+${Math.max(0, Math.round(((deal.dropRatio ?? 1) - 1) * 100))}%`;
  }

  return `${Math.max(0, Math.round((1 - (deal.dropRatio ?? 1)) * 100))}% ↓`;
}

export function getTravelStyleVisual(key: string) {
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

export function getPublicTripStyle(deal: CampaignPreviewDeal, t: Translate) {
  const bucketKey = normalizeDestinationKey(deal.routeBucket);

  if (bucketKey.includes("weekend")) {
    return t("deals.style.weekend");
  }

  if (deal.tripNights >= 5 && deal.tripNights <= 7) {
    return t("deals.style.weeklong");
  }

  if (bucketKey.includes("long")) {
    return t("deals.style.longStay");
  }

  return t("deals.style.smartFare");
}

export function getPublicAirlineLine(deal: CampaignPreviewDeal, t: Translate) {
  if (!deal.airlineSummary) {
    return t("deals.fromLuxembourg");
  }

  return `${t("deals.fromLuxembourg")} · ${deal.airlineSummary}`;
}

export function formatLegStops(
  stopCount: number | null,
  maxStops: string,
  t: Translate,
) {
  if (stopCount !== null && Number.isInteger(stopCount) && stopCount >= 0) {
    if (stopCount === 0) {
      return t("deals.direct");
    }

    return stopCount === 1
      ? t("deals.oneStop")
      : t("deals.stopCount", { count: stopCount });
  }

  return maxStops === "NON_STOP"
    ? t("deals.direct")
    : t("deals.stopsUnavailable");
}

export function formatItineraryStops(deal: CampaignPreviewDeal, t: Translate) {
  const outbound = formatLegStops(deal.outboundStopCount, deal.maxStops, t);
  const returnLeg = formatLegStops(deal.returnStopCount, deal.maxStops, t);

  return outbound === returnLeg
    ? outbound
    : `${t("deals.outbound")}: ${outbound} · ${t("deals.return")}: ${returnLeg}`;
}

export function getDisplayAirlineSummary(
  deal: CampaignPreviewDeal,
  t?: Translate,
) {
  if (!deal.airlineSummary) {
    return t ? t("deals.airlinePending") : "Airline pending";
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

export function formatLocalizedStayBucket(bucket: string, t: Translate) {
  return normalizeStayBucket(bucket) === "long_stay"
    ? t("deals.trip.long_stay")
    : t("deals.trip.weekend");
}

export function normalizeAirlineName(value: string) {
  return normalizePublicAirlineName(value);
}

export function getPrimaryAirlineName(deal: CampaignPreviewDeal) {
  const displaySummary = getDisplayAirlineSummary(deal);
  const [primaryAirline] = displaySummary
    .split(/,|\+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return primaryAirline ?? displaySummary;
}

export function getDealAirlineNames(deal: CampaignPreviewDeal) {
  return getPublicAirlineNames(deal.airlineSummary);
}

export function getAirlineLogoCode(
  airlineName: string,
  primaryAirlineCode: string | null,
) {
  const normalizedCode = primaryAirlineCode?.trim().toUpperCase() ?? "";
  if (/^[A-Z0-9]{2,3}$/.test(normalizedCode)) {
    return normalizedCode;
  }

  return AIRLINE_LOGO_CODE_BY_NAME[normalizeAirlineName(airlineName)] ?? null;
}
