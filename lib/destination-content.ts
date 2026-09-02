import { toDestinationSlug } from "@/lib/destination-slugs";
import type { ThemeFilter } from "@/lib/public-deals-search";

type DestinationTheme = Exclude<ThemeFilter, "any">;

type DestinationContent = {
  country: string;
  theme: DestinationTheme;
  titleLabel: string;
  metaDescription: string;
  heroDescription: string;
};

const COUNTRY_BY_DESTINATION: Record<string, string> = {
  "abu-dhabi": "Emiratos Árabes Unidos",
  agadir: "Marruecos",
  ajaccio: "Francia",
  alicante: "España",
  amsterdam: "Países Bajos",
  antalya: "Turquía",
  athens: "Grecia",
  barcelona: "España",
  berlin: "Alemania",
  bucharest: "Rumania",
  budapest: "Hungría",
  calvi: "Francia",
  chania: "Grecia",
  copenhagen: "Dinamarca",
  corfu: "Grecia",
  djerba: "Túnez",
  dubai: "Emiratos Árabes Unidos",
  dublin: "Irlanda",
  edinburgh: "Reino Unido",
  faro: "Portugal",
  figari: "Francia",
  frankfurt: "Alemania",
  funchal: "Portugal",
  geneva: "Suiza",
  "gran-canaria": "España",
  helsinki: "Finlandia",
  heraklion: "Grecia",
  hurghada: "Egipto",
  ibiza: "España",
  istanbul: "Turquía",
  "jerez-de-la-frontera": "España",
  kos: "Grecia",
  krakow: "Polonia",
  lisbon: "Portugal",
  ljubljana: "Eslovenia",
  london: "Reino Unido",
  madrid: "España",
  malaga: "España",
  malta: "Malta",
  manchester: "Reino Unido",
  marrakech: "Marruecos",
  milan: "Italia",
  munich: "Alemania",
  "new-york": "Estados Unidos",
  nice: "Francia",
  oslo: "Noruega",
  "palma-de-mallorca": "España",
  paris: "Francia",
  pescara: "Italia",
  porto: "Portugal",
  prague: "República Checa",
  rhodes: "Grecia",
  rimini: "Italia",
  rome: "Italia",
  seville: "España",
  stockholm: "Suecia",
  tenerife: "España",
  tokyo: "Japón",
  tunis: "Túnez",
  valencia: "España",
  vienna: "Austria",
  warsaw: "Polonia",
  zadar: "Croacia",
  zurich: "Suiza",
};

const THEME_BY_DESTINATION: Record<string, DestinationTheme> = {
  agadir: "beach",
  ajaccio: "beach",
  alicante: "beach",
  antalya: "beach",
  calvi: "beach",
  chania: "beach",
  corfu: "beach",
  djerba: "beach",
  faro: "beach",
  figari: "beach",
  funchal: "nature",
  "gran-canaria": "beach",
  heraklion: "beach",
  hurghada: "beach",
  ibiza: "beach",
  kos: "beach",
  malaga: "beach",
  malta: "beach",
  nice: "beach",
  "palma-de-mallorca": "beach",
  rhodes: "beach",
  rimini: "beach",
  tenerife: "beach",
  valencia: "beach",
  zadar: "nature",
  zurich: "nature",
};

const DESTINATION_CONTENT_OVERRIDES: Record<string, Partial<DestinationContent>> = {
  "gran-canaria": {
    titleLabel: "Gran Canaria",
    country: "España",
    theme: "beach",
    metaDescription:
      "Compara vuelos baratos de Luxemburgo a Gran Canaria para vacaciones de playa en Canarias, con tarifas verificadas, fechas flexibles y opciones directas cuando existen.",
    heroDescription:
      "Encuentra vuelos baratos de Luxemburgo a Gran Canaria para disfrutar de Las Palmas, las dunas de Maspalomas, Puerto de Mogán y escapadas de sol en las Islas Canarias.",
  },
  tenerife: {
    country: "España",
    theme: "beach",
    heroDescription:
      "Compara vuelos baratos de Luxemburgo a Tenerife para playas, rutas por el Teide y vacaciones de invierno con buen clima.",
  },
  "palma-de-mallorca": {
    country: "España",
    theme: "beach",
    titleLabel: "Palma de Mallorca",
    heroDescription:
      "Compara vuelos baratos de Luxemburgo a Palma de Mallorca para calas, costa mediterránea y escapadas largas o de fin de semana.",
  },
  malaga: {
    country: "España",
    theme: "beach",
    heroDescription:
      "Compara vuelos baratos de Luxemburgo a Málaga para la Costa del Sol, playa, gastronomía andaluza y escapadas con buen clima.",
  },
};

export function hasDestinationEditorialContent(destination: string) {
  const slug = toDestinationSlug(destination);
  return Object.prototype.hasOwnProperty.call(DESTINATION_CONTENT_OVERRIDES, slug);
}

function humanizeDestination(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getDestinationContent(destination: string): DestinationContent {
  const slug = toDestinationSlug(destination);
  const titleLabel = humanizeDestination(slug);
  const theme = THEME_BY_DESTINATION[slug] ?? "city";
  const country = COUNTRY_BY_DESTINATION[slug] ?? "Europa";
  const override = DESTINATION_CONTENT_OVERRIDES[slug] ?? {};

  return {
    country,
    theme,
    titleLabel,
    metaDescription:
      theme === "beach"
        ? `Compara vuelos baratos de Luxemburgo a ${titleLabel} para playa, vacaciones y escapadas con fechas flexibles desde LUX.`
        : `Compara vuelos baratos de Luxemburgo a ${titleLabel} con tarifas verificadas, fechas flexibles y opciones para escapadas desde LUX.`,
    heroDescription:
      theme === "beach"
        ? `Compara tarifas registradas recientemente de Luxemburgo a ${titleLabel} para escapadas de playa, vacaciones y viajes flexibles desde LUX.`
        : `Compara tarifas registradas recientemente de Luxemburgo a ${titleLabel}, ajusta las fechas y elige la opcion que encaje con tu viaje desde LUX.`,
    ...override,
  };
}

export function getDestinationTheme(destination: string): DestinationTheme {
  return getDestinationContent(destination).theme;
}

export function getDestinationHeroDescription(destination: string) {
  return getDestinationContent(destination).heroDescription;
}
