import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/env";
import {
  getLocalizedDealsSearchPath,
  getLocalizedDestinationPath,
  getLocalizedHomePath,
  htmlLangTags,
  locales,
  type Locale,
} from "@/lib/locales";
import { getSocialImageMetadata } from "@/lib/social-image";

type DealsSeoCopy = {
  searchTitle: string;
  searchDescription: string;
  cityTitle: (city: string) => string;
  cityDescription: (city: string) => string;
  homeLabel: string;
  searchLabel: string;
  offerName: (city: string, price: number) => string;
  flightName: (city: string) => string;
  itemListName: (city: string) => string;
  internalKicker: string;
  internalTitle: string;
  countryGroup: (country: string) => string;
  beachGroup: string;
  filtersGroup: (city: string) => string;
  weekend: string;
  direct: string;
  schoolHolidays: string;
};

export const dealsSeoCopy: Record<Locale, DealsSeoCopy> = {
  en: {
    searchTitle: "Search results",
    searchDescription: "A live shortlist balancing price, timing, directness, and travel shape.",
    cityTitle: (city) => `Cheap flights from Luxembourg to ${city}`,
    cityDescription: (city) =>
      `Find cheap flights from Luxembourg to ${city}. Compare live fares, dates, airlines, and trip lengths to find the option that fits your plans.`,
    homeLabel: "Home",
    searchLabel: "Cheap flights",
    offerName: (city, price) => `Flight from Luxembourg to ${city} from EUR ${price}`,
    flightName: (city) => `Luxembourg to ${city}`,
    itemListName: (city) => `Cheap flights from Luxembourg to ${city}`,
    internalKicker: "More ideas from LUX",
    internalTitle: "Useful links to plan your trip",
    countryGroup: (country) => `More flights to ${country}`,
    beachGroup: "Beach destinations from Luxembourg",
    filtersGroup: (city) => `Useful filters for ${city}`,
    weekend: "Weekend",
    direct: "Direct flights",
    schoolHolidays: "School holidays",
  },
  fr: {
    searchTitle: "Résultats de recherche",
    searchDescription: "Une sélection en direct équilibrant prix, horaires, vols directs et type de voyage.",
    cityTitle: (city) => `Vols pas chers de Luxembourg à ${city}`,
    cityDescription: (city) =>
      `Trouvez des vols pas chers de Luxembourg à ${city}. Comparez les tarifs, les dates, les compagnies et la durée du séjour.`,
    homeLabel: "Accueil",
    searchLabel: "Vols pas chers",
    offerName: (city, price) => `Vol de Luxembourg à ${city} à partir de ${price} EUR`,
    flightName: (city) => `Luxembourg à ${city}`,
    itemListName: (city) => `Vols pas chers de Luxembourg à ${city}`,
    internalKicker: "Plus d'idées depuis LUX",
    internalTitle: "Liens utiles pour préparer votre voyage",
    countryGroup: (country) => `Plus de vols vers ${country}`,
    beachGroup: "Destinations plage depuis Luxembourg",
    filtersGroup: (city) => `Filtres utiles pour ${city}`,
    weekend: "Week-end",
    direct: "Vols directs",
    schoolHolidays: "Vacances scolaires",
  },
  de: {
    searchTitle: "Suchergebnisse",
    searchDescription: "Eine Live-Auswahl nach Preis, Flugzeiten, Direktverbindungen und Reiseart.",
    cityTitle: (city) => `Günstige Flüge von Luxemburg nach ${city}`,
    cityDescription: (city) =>
      `Finden Sie günstige Flüge von Luxemburg nach ${city}. Vergleichen Sie aktuelle Preise, Reisedaten, Airlines und Reisedauer.`,
    homeLabel: "Startseite",
    searchLabel: "Günstige Flüge",
    offerName: (city, price) => `Flug von Luxemburg nach ${city} ab ${price} EUR`,
    flightName: (city) => `Luxemburg nach ${city}`,
    itemListName: (city) => `Günstige Flüge von Luxemburg nach ${city}`,
    internalKicker: "Mehr Ideen ab LUX",
    internalTitle: "Nützliche Links für Ihre Reiseplanung",
    countryGroup: (country) => `Mehr Flüge nach ${country}`,
    beachGroup: "Strandziele ab Luxemburg",
    filtersGroup: (city) => `Nützliche Filter für ${city}`,
    weekend: "Wochenende",
    direct: "Direktflüge",
    schoolHolidays: "Schulferien",
  },
  pt: {
    searchTitle: "Resultados da pesquisa",
    searchDescription: "Uma seleção em direto que equilibra preço, horários, voos diretos e tipo de viagem.",
    cityTitle: (city) => `Voos baratos do Luxemburgo para ${city}`,
    cityDescription: (city) =>
      `Encontre voos baratos do Luxemburgo para ${city}. Compare preços atuais, datas, companhias aéreas e duração da viagem.`,
    homeLabel: "Início",
    searchLabel: "Voos baratos",
    offerName: (city, price) => `Voo do Luxemburgo para ${city} desde ${price} EUR`,
    flightName: (city) => `Luxemburgo para ${city}`,
    itemListName: (city) => `Voos baratos do Luxemburgo para ${city}`,
    internalKicker: "Mais ideias a partir de LUX",
    internalTitle: "Links úteis para planear a viagem",
    countryGroup: (country) => `Mais voos para ${country}`,
    beachGroup: "Destinos de praia a partir do Luxemburgo",
    filtersGroup: (city) => `Filtros úteis para ${city}`,
    weekend: "Fim de semana",
    direct: "Voos diretos",
    schoolHolidays: "Férias escolares",
  },
  it: {
    searchTitle: "Risultati di ricerca",
    searchDescription: "Una selezione in tempo reale basata su prezzo, orari, voli diretti e tipo di viaggio.",
    cityTitle: (city) => `Voli economici dal Lussemburgo a ${city}`,
    cityDescription: (city) =>
      `Trova voli economici dal Lussemburgo a ${city}. Confronta prezzi aggiornati, date, compagnie aeree e durata del viaggio.`,
    homeLabel: "Home",
    searchLabel: "Voli economici",
    offerName: (city, price) => `Volo dal Lussemburgo a ${city} da ${price} EUR`,
    flightName: (city) => `Lussemburgo a ${city}`,
    itemListName: (city) => `Voli economici dal Lussemburgo a ${city}`,
    internalKicker: "Altre idee da LUX",
    internalTitle: "Link utili per organizzare il viaggio",
    countryGroup: (country) => `Altri voli per ${country}`,
    beachGroup: "Destinazioni di mare dal Lussemburgo",
    filtersGroup: (city) => `Filtri utili per ${city}`,
    weekend: "Fine settimana",
    direct: "Voli diretti",
    schoolHolidays: "Vacanze scolastiche",
  },
  es: {
    searchTitle: "Resultados de búsqueda",
    searchDescription: "Una selección en directo equilibrando precio, horarios, vuelos directos y tipo de viaje.",
    cityTitle: (city) => `Vuelos baratos de Luxemburgo a ${city}`,
    cityDescription: (city) =>
      `Encuentra vuelos baratos de Luxemburgo a ${city}. Compara precios actuales, fechas, aerolíneas y duración del viaje.`,
    homeLabel: "Inicio",
    searchLabel: "Vuelos baratos",
    offerName: (city, price) => `Vuelo de Luxemburgo a ${city} desde ${price} EUR`,
    flightName: (city) => `Luxemburgo a ${city}`,
    itemListName: (city) => `Vuelos baratos de Luxemburgo a ${city}`,
    internalKicker: "Más ideas desde LUX",
    internalTitle: "Enlaces útiles para planificar el viaje",
    countryGroup: (country) => `Más vuelos a ${country}`,
    beachGroup: "Destinos de playa desde Luxemburgo",
    filtersGroup: (city) => `Filtros útiles para ${city}`,
    weekend: "Fin de semana",
    direct: "Vuelos directos",
    schoolHolidays: "Vacaciones escolares",
  },
};

export function getDestinationLanguageAlternates(citySlug: string): Record<string, string> {
  return Object.fromEntries([
    ...locales.map((locale) => [
      htmlLangTags[locale],
      getLocalizedDestinationPath(locale, citySlug),
    ]),
    ["x-default", getLocalizedDestinationPath("en", citySlug)],
  ]);
}

export function getDealsSearchMetadata(locale: Locale): Metadata {
  const copy = dealsSeoCopy[locale];
  const pathname = getLocalizedDealsSearchPath(locale);
  const socialImage = getSocialImageMetadata();

  return {
    title: copy.searchTitle,
    description: copy.searchDescription,
    alternates: { canonical: pathname },
    robots: { index: false, follow: true },
    openGraph: {
      title: copy.searchTitle,
      description: copy.searchDescription,
      type: "website",
      url: pathname,
      locale: htmlLangTags[locale].replace("-", "_"),
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.searchTitle,
      description: copy.searchDescription,
      images: [socialImage],
    },
  };
}

export function getDealsCityMetadata(
  locale: Locale,
  cityName: string,
  citySlug: string,
  noindex: boolean,
): Metadata {
  const copy = dealsSeoCopy[locale];
  const pathname = getLocalizedDestinationPath(locale, citySlug);
  const title = copy.cityTitle(cityName);
  const description = copy.cityDescription(cityName);
  const socialImage = getSocialImageMetadata(
    citySlug,
    `+352 Flights — ${cityName}`,
  );

  return {
    title,
    description,
    alternates: {
      canonical: pathname,
      languages: getDestinationLanguageAlternates(citySlug),
    },
    openGraph: {
      title,
      description,
      url: new URL(pathname, getSiteUrl()),
      type: "website",
      locale: htmlLangTags[locale].replace("-", "_"),
      images: [socialImage],
      alternateLocale: locales
        .filter((candidate) => candidate !== locale)
        .map((candidate) => htmlLangTags[candidate].replace("-", "_")),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
    robots: noindex ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export function getLocalizedDealsBreadcrumb(locale: Locale, citySlug: string) {
  return {
    home: getLocalizedHomePath(locale),
    search: getLocalizedDealsSearchPath(locale),
    city: getLocalizedDestinationPath(locale, citySlug),
  };
}
