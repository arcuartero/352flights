import { toDestinationSlug } from "@/lib/destination-slugs";

export const TIKTOK_TEMPLATE = "cheap-flights-tiktok" as const;
export const TIKTOK_TRAVEL_OFFER_TEMPLATE = "travel-offer" as const;
export const TIKTOK_LANGUAGE = "es" as const;
export const TIKTOK_TRAVEL_OFFER_COUNT = 5;

export type TikTokSourceOffer = {
  id: number;
  originAirport: string;
  destinationAirport: string;
  destinationCity: string;
  departureDate: string;
  returnDate: string;
  price: number;
  currency: string;
  maxStops: string;
  scannedAt: string;
};

export type TikTokOrigin = {
  airport: string;
  city: string;
  flag: string;
};

export type TikTokGenerationOptions = {
  originAirport: string;
  startMonth: string;
  slideCount: number;
  offersPerSlide: number;
  now?: Date;
};

export type TikTokCarouselDocument = {
  template: typeof TIKTOK_TEMPLATE;
  language: typeof TIKTOK_LANGUAGE;
  cover: {
    title: string;
    subtitle: string;
    imageUrl: string;
    positionX: number;
    positionY: number;
    zoom: number;
    titleStyle: TextStyle;
    subtitleStyle: TextStyle;
  };
  slides: TikTokSlide[];
};

export type TikTokSlide = {
  month: string;
  monthNumber: number;
  year: number;
  imageUrl: string;
  positionX: number;
  positionY: number;
  zoom: number;
  headerStyle: TextStyle;
  offersStyle: TextStyle;
  origin: { city: string; airport: string };
  offers: Array<{
    destination: string;
    airport: string;
    departure: string;
    returnDate: string;
    price: number;
    currency: string;
  }>;
};

type TextStyle = {
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  shadow: number;
  padding: number;
  textAlign: string;
};

export type TikTokGenerationResult = {
  document: TikTokCarouselDocument;
  warnings: string[];
  preview: Array<{
    month: string;
    year: number;
    destinations: string[];
    offerCount: number;
  }>;
};

export type TikTokTravelOfferOptions = Pick<
  TikTokGenerationOptions,
  "originAirport" | "startMonth" | "slideCount" | "now"
>;

export type TikTokTravelOfferSlide = {
  title: string;
  country: string;
  origin: string;
  destination: string;
  outboundDate: string;
  returnDate: string;
  duration: string;
  direct: boolean;
  price: number;
  currency: string;
  cta: "Ver oferta";
};

export type TikTokTravelOfferDocument = {
  template: typeof TIKTOK_TRAVEL_OFFER_TEMPLATE;
  slides: TikTokTravelOfferSlide[];
};

export type TikTokTravelOfferGenerationResult = {
  document: TikTokTravelOfferDocument;
  warnings: string[];
  preview: Array<{
    title: string;
    country: string;
    dates: string;
    price: number;
    currency: string;
  }>;
};

const SPANISH_MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

const SPANISH_SHORT_MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sept",
  "oct",
  "nov",
  "dic",
] as const;

const TRAVEL_OFFER_SHORT_MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
] as const;

const ORIGIN_PRESENTATION: Record<string, TikTokOrigin> = {
  LUX: { airport: "LUX", city: "Luxemburgo", flag: "🇱🇺" },
};

const COUNTRY_AIRPORTS: Record<string, readonly string[]> = {
  Alemania: ["BER", "MUC", "FRA", "HAM", "HDF", "GWT"],
  Austria: ["VIE"],
  Bulgaria: ["BOJ", "VAR"],
  "Cabo Verde": ["BVC", "RAI", "SID", "VXE"],
  Chequia: ["PRG"],
  China: ["CGO"],
  Croacia: ["ZAD", "BWK", "DBV"],
  Dinamarca: ["CPH"],
  Egipto: ["HRG", "RMF"],
  Eslovenia: ["LJU"],
  España: [
    "BCN", "MAD", "PMI", "AGP", "ALC", "SVQ", "VLC", "IBZ", "TFS", "LPA",
    "XRY", "LEI", "BIO", "FUE", "GRO", "ACE", "MAH", "SPC",
  ],
  "Estados Unidos": ["JFK", "EWR"],
  Finlandia: ["HEL", "RVN"],
  Francia: [
    "CDG", "NCE", "MRS", "TLS", "FSC", "CLY", "AJA", "BIA", "BIQ", "BOD", "MPL", "TLN",
  ],
  Grecia: ["ATH", "KGS", "CFU", "CHQ", "HER", "RHO", "GPA", "SKG", "ZTH"],
  Hungría: ["BUD"],
  Irlanda: ["DUB"],
  Italia: [
    "MXP", "LIN", "BGY", "FCO", "RMI", "PSR", "BRI", "BLQ", "BZO", "BDS",
    "CAG", "CTA", "FLR", "SUF", "NAP", "OLB", "PMO", "QSR", "VCE",
  ],
  Japón: ["NRT"],
  Malta: ["MLA"],
  Marruecos: ["RAK", "AGA"],
  Montenegro: ["TIV"],
  Noruega: ["OSL"],
  "Países Bajos": ["AMS"],
  Polonia: ["KRK", "WAW"],
  Portugal: ["LIS", "OPO", "FAO", "FNC", "PXO"],
  "Reino Unido": ["LHR", "LGW", "STN", "LCY", "EDI", "MAN"],
  Rumanía: ["OTP"],
  Senegal: ["DSS"],
  Suecia: ["ARN"],
  Suiza: ["ZRH", "GVA"],
  Túnez: ["TUN", "DJE", "NBE", "MIR"],
  Turquía: ["IST", "AYT", "ADB"],
  "Emiratos Árabes Unidos": ["DXB", "DWC", "AUH"],
};

const COUNTRY_BY_AIRPORT = new Map(
  Object.entries(COUNTRY_AIRPORTS).flatMap(([country, airports]) =>
    airports.map((airport) => [airport, country] as const),
  ),
);

const SPANISH_CITY_NAMES: Record<string, string> = {
  athens: "Atenas",
  bologna: "Bolonia",
  bordeaux: "Burdeos",
  bucharest: "Bucarest",
  copenhagen: "Copenhague",
  edinburgh: "Edimburgo",
  florence: "Florencia",
  hamburg: "Hamburgo",
  "lamezia terme": "Lamezia Terme",
  lisbon: "Lisboa",
  london: "Londres",
  marseille: "Marsella",
  milan: "Milán",
  munich: "Múnich",
  naples: "Nápoles",
  "new york": "Nueva York",
  paris: "París",
  porto: "Oporto",
  prague: "Praga",
  rome: "Roma",
  seville: "Sevilla",
  thessaloniki: "Tesalónica",
  tokyo: "Tokio",
  tunis: "Túnez",
  venice: "Venecia",
  vienna: "Viena",
  warsaw: "Varsovia",
};

const TITLE_STYLE: TextStyle = {
  x: 50.2,
  y: 44,
  width: 82,
  fontSize: 7.2,
  fontFamily: "sans",
  fontWeight: 700,
  textColor: "#ffffff",
  backgroundColor: "#000000",
  backgroundOpacity: 0,
  borderColor: "#ffffff",
  borderWidth: 0,
  borderRadius: 0,
  shadow: 0,
  padding: 0,
  textAlign: "center",
};

const SUBTITLE_STYLE: TextStyle = {
  x: 50.2,
  y: 50.4,
  width: 82,
  fontSize: 5.3,
  fontFamily: "sans",
  fontWeight: 700,
  textColor: "#ffffff",
  backgroundColor: "#000000",
  backgroundOpacity: 0,
  borderColor: "#ffffff",
  borderWidth: 0,
  borderRadius: 0,
  shadow: 0,
  padding: 0,
  textAlign: "center",
};

const HEADER_STYLE: TextStyle = {
  x: 50.4,
  y: 38.5,
  width: 58,
  fontSize: 4.1,
  fontFamily: "sans",
  fontWeight: 700,
  textColor: "#000000",
  backgroundColor: "#ffffff",
  backgroundOpacity: 100,
  borderColor: "#ffffff",
  borderWidth: 0,
  borderRadius: 2,
  shadow: 16,
  padding: 2,
  textAlign: "center",
};

const OFFERS_STYLE: TextStyle = {
  x: 50,
  y: 50,
  width: 66,
  fontSize: 3.55,
  fontFamily: "sans",
  fontWeight: 600,
  textColor: "#000000",
  backgroundColor: "#ffffff",
  backgroundOpacity: 100,
  borderColor: "#ffffff",
  borderWidth: 0,
  borderRadius: 2,
  shadow: 16,
  padding: 3,
  textAlign: "left",
};

export function resolveTikTokOrigin(airport: string): TikTokOrigin {
  const normalized = airport.trim().toUpperCase();
  return ORIGIN_PRESENTATION[normalized] ?? {
    airport: normalized,
    city: normalized,
    flag: "",
  };
}

function parseDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day, date };
}

function getTodayKey(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Luxembourg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : now.toISOString().slice(0, 10);
}

function getMonthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function addMonths(startMonth: string, offset: number) {
  const match = /^(\d{4})-(\d{2})$/.exec(startMonth);
  if (!match) throw new Error("El mes inicial no es válido.");
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error("El mes inicial no es válido.");
  const date = new Date(Date.UTC(Number(match[1]), month - 1 + offset, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function getTikTokCarouselDateRange(
  startMonth: string,
  slideCount: number,
  now = new Date(),
) {
  const boundedSlideCount = Math.min(12, Math.max(1, Math.trunc(slideCount)));
  const start = addMonths(startMonth, 0);
  const end = addMonths(startMonth, boundedSlideCount);
  const requestedStart = `${getMonthKey(start.year, start.month)}-01`;

  return {
    fromDate: requestedStart > getTodayKey(now) ? requestedStart : getTodayKey(now),
    toDateExclusive: `${getMonthKey(end.year, end.month)}-01`,
  };
}

function isValidOffer(offer: TikTokSourceOffer, originAirport: string, todayKey: string) {
  const departure = parseDateKey(offer.departureDate);
  const returnDate = parseDateKey(offer.returnDate);
  return Boolean(
    departure &&
      returnDate &&
      offer.originAirport.trim().toUpperCase() === originAirport &&
      offer.destinationCity.trim() &&
      offer.destinationAirport.trim() &&
      Number.isFinite(offer.price) &&
      offer.price > 0 &&
      offer.currency.trim() &&
      offer.departureDate >= todayKey &&
      offer.returnDate >= offer.departureDate,
  );
}

function itineraryKey(offer: TikTokSourceOffer) {
  return [
    offer.originAirport.toUpperCase(),
    offer.destinationAirport.toUpperCase(),
    offer.departureDate,
    offer.returnDate,
  ].join(":");
}

function dedupeAndSort(offers: TikTokSourceOffer[]) {
  const best = new Map<string, TikTokSourceOffer>();
  for (const offer of offers) {
    const key = itineraryKey(offer);
    const current = best.get(key);
    if (
      !current ||
      offer.price < current.price ||
      (offer.price === current.price && offer.scannedAt > current.scannedAt)
    ) {
      best.set(key, offer);
    }
  }
  return [...best.values()].sort(
    (left, right) =>
      left.price - right.price ||
      left.destinationCity.localeCompare(right.destinationCity, "es") ||
      left.departureDate.localeCompare(right.departureDate),
  );
}

export function selectMonthlyOffers(offers: TikTokSourceOffer[], limit: number) {
  const sorted = dedupeAndSort(offers);
  const selected: TikTokSourceOffer[] = [];
  const destinations = new Set<string>();

  for (const offer of sorted) {
    const key = offer.destinationCity.trim().toLocaleLowerCase("es");
    if (!destinations.has(key)) {
      selected.push(offer);
      destinations.add(key);
    }
    if (selected.length === limit) return selected;
  }

  for (const offer of sorted) {
    if (!selected.includes(offer)) selected.push(offer);
    if (selected.length === limit) break;
  }
  return selected;
}

function formatShortDate(value: string) {
  const parsed = parseDateKey(value);
  if (!parsed) return value;
  return `${parsed.day} ${SPANISH_SHORT_MONTHS[parsed.month - 1]}`;
}

function formatTravelOfferDate(value: string) {
  const parsed = parseDateKey(value);
  if (!parsed) return value;
  return `${parsed.day} ${TRAVEL_OFFER_SHORT_MONTHS[parsed.month - 1]}`;
}

function currencySymbol(currency: string) {
  const normalized = currency.trim().toUpperCase();
  if (normalized === "EUR" || normalized === "€") return "€";
  if (normalized === "USD" || normalized === "$") return "$";
  if (normalized === "GBP" || normalized === "£") return "£";
  return currency.trim();
}

function uniquenessKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es");
}

function destinationCountry(offer: TikTokSourceOffer) {
  return COUNTRY_BY_AIRPORT.get(offer.destinationAirport.trim().toUpperCase())
    ?? "País no identificado";
}

function destinationTitle(city: string) {
  const trimmed = city.trim();
  return SPANISH_CITY_NAMES[uniquenessKey(trimmed)] ?? trimmed;
}

function formatDuration(departureDate: string, returnDate: string) {
  const departure = parseDateKey(departureDate);
  const arrival = parseDateKey(returnDate);
  if (!departure || !arrival) return "";
  const dayCount = Math.round(
    (arrival.date.getTime() - departure.date.getTime()) / 86_400_000,
  ) + 1;
  return `${dayCount} ${dayCount === 1 ? "día" : "días"}`;
}

export function selectUniqueTravelOffers(
  offers: TikTokSourceOffer[],
  originAirport: string,
  now = new Date(),
  limit = TIKTOK_TRAVEL_OFFER_COUNT,
) {
  const normalizedOrigin = originAirport.trim().toUpperCase();
  const todayKey = getTodayKey(now);
  const selected: TikTokSourceOffer[] = [];
  const cities = new Set<string>();
  const countries = new Set<string>();

  for (const offer of dedupeAndSort(offers)) {
    if (!isValidOffer(offer, normalizedOrigin, todayKey)) continue;
    const cityKey = uniquenessKey(offer.destinationCity);
    const countryKey = uniquenessKey(destinationCountry(offer));
    if (cities.has(cityKey) || countries.has(countryKey)) continue;
    cities.add(cityKey);
    countries.add(countryKey);
    selected.push(offer);
    if (selected.length === limit) break;
  }

  return selected;
}

export function generateTikTokTravelOffers(
  sourceOffers: TikTokSourceOffer[],
  options: TikTokTravelOfferOptions,
): TikTokTravelOfferGenerationResult {
  const dateRange = getTikTokCarouselDateRange(
    options.startMonth,
    options.slideCount,
    options.now,
  );
  const offersInRange = sourceOffers.filter(
    (offer) =>
      offer.departureDate >= dateRange.fromDate &&
      offer.departureDate < dateRange.toDateExclusive,
  );
  const selected = selectUniqueTravelOffers(
    offersInRange,
    options.originAirport,
    options.now,
  );
  const warnings = selected.length < TIKTOK_TRAVEL_OFFER_COUNT
    ? [
        `Solo hay ${selected.length} ofertas válidas sin repetir ciudad ni país de las ${TIKTOK_TRAVEL_OFFER_COUNT} solicitadas.`,
      ]
    : [];
  const slides: TikTokTravelOfferSlide[] = selected.map((offer) => ({
    title: destinationTitle(offer.destinationCity),
    country: destinationCountry(offer),
    origin: offer.originAirport.trim().toUpperCase(),
    destination: offer.destinationAirport.trim().toUpperCase(),
    outboundDate: formatTravelOfferDate(offer.departureDate),
    returnDate: formatTravelOfferDate(offer.returnDate),
    duration: formatDuration(offer.departureDate, offer.returnDate),
    direct: offer.maxStops.trim().toUpperCase() === "NON_STOP",
    price: Math.round(offer.price),
    currency: currencySymbol(offer.currency),
    cta: "Ver oferta",
  }));

  return {
    document: {
      template: TIKTOK_TRAVEL_OFFER_TEMPLATE,
      slides,
    },
    warnings,
    preview: slides.map((slide) => ({
      title: slide.title,
      country: slide.country,
      dates: `${slide.outboundDate} → ${slide.returnDate}`,
      price: slide.price,
      currency: slide.currency,
    })),
  };
}

function chooseSlideImage(
  offers: TikTokSourceOffer[],
  photoUrls: Record<string, string>,
  usedSlugs: Set<string>,
) {
  const candidates = offers
    .map((offer) => toDestinationSlug(offer.destinationCity))
    .filter((slug, index, all) => all.indexOf(slug) === index && photoUrls[slug]);
  const slug = candidates.find((candidate) => !usedSlugs.has(candidate)) ?? candidates[0];
  if (!slug) return { slug: null, url: "" };
  usedSlugs.add(slug);
  return { slug, url: photoUrls[slug] };
}

export function generateTikTokCarousel(
  sourceOffers: TikTokSourceOffer[],
  photoUrls: Record<string, string>,
  options: TikTokGenerationOptions,
): TikTokGenerationResult {
  const originAirport = options.originAirport.trim().toUpperCase();
  const origin = resolveTikTokOrigin(originAirport);
  const todayKey = getTodayKey(options.now ?? new Date());
  const slideCount = Math.min(12, Math.max(1, Math.trunc(options.slideCount)));
  const offersPerSlide = [3, 4, 5].includes(options.offersPerSlide)
    ? options.offersPerSlide
    : 3;
  const validOffers = sourceOffers.filter((offer) =>
    isValidOffer(offer, originAirport, todayKey),
  );
  const warnings: string[] = [];
  const usedImageSlugs = new Set<string>();
  const slideImages: string[] = [];

  const slides = Array.from({ length: slideCount }, (_, index): TikTokSlide => {
    const { year, month } = addMonths(options.startMonth, index);
    const monthKey = getMonthKey(year, month);
    const monthlyOffers = validOffers.filter(
      (offer) => offer.departureDate.slice(0, 7) === monthKey,
    );
    const selected = selectMonthlyOffers(monthlyOffers, offersPerSlide);
    if (selected.length < offersPerSlide) {
      warnings.push(
        selected.length === 0
          ? `${SPANISH_MONTHS[month - 1]} ${year}: no hay ofertas válidas para este mes.`
          : `${SPANISH_MONTHS[month - 1]} ${year}: solo hay ${selected.length} de ${offersPerSlide} ofertas solicitadas.`,
      );
    }
    const image = chooseSlideImage(selected, photoUrls, usedImageSlugs);
    if (!image.url) {
      warnings.push(`${SPANISH_MONTHS[month - 1]} ${year}: ninguna ciudad seleccionada tiene foto.`);
    }
    slideImages.push(image.url);

    return {
      month: SPANISH_MONTHS[month - 1],
      monthNumber: month,
      year,
      imageUrl: image.url,
      positionX: 50,
      positionY: 50,
      zoom: 100,
      headerStyle: { ...HEADER_STYLE },
      offersStyle: { ...OFFERS_STYLE },
      origin: { city: origin.city, airport: origin.airport },
      offers: selected.map((offer) => ({
        destination: offer.destinationCity,
        airport: offer.destinationAirport,
        departure: formatShortDate(offer.departureDate),
        returnDate: formatShortDate(offer.returnDate),
        price: Number(offer.price.toFixed(2)),
        currency: currencySymbol(offer.currency),
      })),
    };
  });

  const coverImage = slideImages.find(Boolean) ?? "";
  if (!coverImage) warnings.push("La portada no tiene una foto de destino disponible.");

  return {
    document: {
      template: TIKTOK_TEMPLATE,
      language: TIKTOK_LANGUAGE,
      cover: {
        title: "VUELOS BARATOS",
        subtitle: `Desde ${origin.city}${origin.flag ? ` ${origin.flag}` : ""}`,
        imageUrl: coverImage,
        positionX: 50,
        positionY: 50,
        zoom: 100,
        titleStyle: { ...TITLE_STYLE },
        subtitleStyle: { ...SUBTITLE_STYLE },
      },
      slides,
    },
    warnings,
    preview: slides.map((slide) => ({
      month: slide.month,
      year: slide.year,
      destinations: slide.offers.map((offer) => offer.destination),
      offerCount: slide.offers.length,
    })),
  };
}
