import { toDestinationSlug } from "@/lib/destination-slugs";
import type { Locale } from "@/lib/locales";

const localizedNames: Partial<Record<string, Partial<Record<Locale, string>>>> = {
  almeria: { es: "Almería" },
  athens: { fr: "Athènes", de: "Athen", pt: "Atenas", it: "Atene", es: "Atenas" },
  brac: { fr: "Brač", de: "Brač", pt: "Brač", it: "Brač", es: "Brač" },
  bucharest: { fr: "Bucarest", de: "Bukarest", pt: "Bucareste", it: "Bucarest", es: "Bucarest" },
  copenhagen: { fr: "Copenhague", de: "Kopenhagen", pt: "Copenhaga", it: "Copenaghen", es: "Copenhague" },
  corfu: { fr: "Corfou", de: "Korfu", pt: "Corfu", it: "Corfù", es: "Corfú" },
  edinburgh: { fr: "Édimbourg", de: "Edinburgh", pt: "Edimburgo", it: "Edimburgo", es: "Edimburgo" },
  florence: { fr: "Florence", de: "Florenz", pt: "Florença", it: "Firenze", es: "Florencia" },
  geneva: { fr: "Genève", de: "Genf", pt: "Genebra", it: "Ginevra", es: "Ginebra" },
  heraklion: { fr: "Héraklion", de: "Heraklion", pt: "Heraclião", it: "Candia", es: "Heraclión" },
  istanbul: { es: "Estambul" },
  krakow: { fr: "Cracovie", de: "Krakau", pt: "Cracóvia", it: "Cracovia", es: "Cracovia" },
  lisbon: { fr: "Lisbonne", de: "Lissabon", pt: "Lisboa", it: "Lisbona", es: "Lisboa" },
  london: { fr: "Londres", pt: "Londres", it: "Londra", es: "Londres" },
  malaga: { fr: "Malaga", de: "Málaga", pt: "Málaga", it: "Malaga", es: "Málaga" },
  milan: { fr: "Milan", de: "Mailand", pt: "Milão", it: "Milano", es: "Milán" },
  munich: { fr: "Munich", de: "München", pt: "Munique", it: "Monaco di Baviera", es: "Múnich" },
  naples: { fr: "Naples", de: "Neapel", pt: "Nápoles", it: "Napoli", es: "Nápoles" },
  "new-york": { fr: "New York", de: "New York", pt: "Nova Iorque", it: "New York", es: "Nueva York" },
  nice: { de: "Nizza", it: "Nizza", es: "Niza" },
  paris: { de: "Paris", pt: "Paris", it: "Parigi", es: "París" },
  prague: { fr: "Prague", de: "Prag", pt: "Praga", it: "Praga", es: "Praga" },
  rhodes: { fr: "Rhodes", de: "Rhodos", pt: "Rodes", it: "Rodi", es: "Rodas" },
  rome: { fr: "Rome", de: "Rom", pt: "Roma", it: "Roma", es: "Roma" },
  "sao-vicente": { fr: "São Vicente", de: "São Vicente", pt: "São Vicente", it: "São Vicente", es: "São Vicente" },
  seville: { fr: "Séville", de: "Sevilla", pt: "Sevilha", it: "Siviglia", es: "Sevilla" },
  thessaloniki: { fr: "Thessalonique", de: "Thessaloniki", pt: "Salónica", it: "Salonicco", es: "Salónica" },
  tokyo: { fr: "Tokyo", de: "Tokio", pt: "Tóquio", it: "Tokyo", es: "Tokio" },
  venice: { fr: "Venise", de: "Venedig", pt: "Veneza", it: "Venezia", es: "Venecia" },
  vienna: { fr: "Vienne", de: "Wien", pt: "Viena", it: "Vienna", es: "Viena" },
  warsaw: { fr: "Varsovie", de: "Warschau", pt: "Varsóvia", it: "Varsavia", es: "Varsovia" },
  zurich: { fr: "Zurich", de: "Zürich", pt: "Zurique", it: "Zurigo", es: "Zúrich" },
};

export function getLocalizedDestinationName(destination: string, locale: Locale) {
  return localizedNames[toDestinationSlug(destination)]?.[locale] ?? destination;
}

export function getLocalizedCountryName(countryCode: string | undefined, locale: Locale) {
  if (!countryCode) return null;
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(countryCode) ?? null;
  } catch {
    return null;
  }
}
