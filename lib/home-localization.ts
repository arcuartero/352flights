import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/env";
import {
  getLocalizedHomePath,
  htmlLangTags,
  locales,
  type Locale,
} from "@/lib/locales";

type HomeMetadataCopy = {
  title: string;
  description: string;
};

export const homeMetadataCopy: Record<Locale, HomeMetadataCopy> = {
  en: {
    title: "You know when to fly. We'll find where.",
    description:
      "We watch every fare out of LUX and write to you only when it's genuinely cheap. No noise — just the right deals, at the right time.",
  },
  fr: {
    title: "Vous savez quand partir. Nous trouvons où aller.",
    description:
      "Nous surveillons chaque tarif au départ de LUX et vous écrivons seulement quand il est vraiment intéressant. Pas de bruit — seulement les bonnes offres, au bon moment.",
  },
  de: {
    title: "Du weißt, wann du fliegen möchtest. Wir finden das Reiseziel.",
    description:
      "Wir beobachten jeden Tarif ab LUX und schreiben nur, wenn er wirklich günstig ist. Kein Lärm — nur die richtigen Deals zur richtigen Zeit.",
  },
  pt: {
    title: "Você sabe quando quer voar. Nós encontramos o destino.",
    description:
      "Monitorizamos todas as tarifas a partir de LUX e escrevemos apenas quando são realmente boas. Sem ruído — só as ofertas certas, no momento certo.",
  },
  it: {
    title: "Sai quando vuoi partire. Noi troviamo la destinazione.",
    description:
      "Monitoriamo ogni tariffa da LUX e ti scriviamo solo quando è davvero conveniente. Niente rumore — solo le offerte giuste al momento giusto.",
  },
  es: {
    title: "Tú sabes cuándo quieres volar. Nosotros encontramos el destino.",
    description:
      "Vigilamos cada tarifa desde LUX y te escribimos solo cuando merece la pena. Sin ruido: solo las ofertas correctas, en el momento correcto.",
  },
};

export function getHomeLanguageAlternates(): Record<string, string> {
  return Object.fromEntries([
    ...locales.map((locale) => [htmlLangTags[locale], getLocalizedHomePath(locale)]),
    ["x-default", "/"],
  ]);
}

export function getHomeMetadata(locale: Locale): Metadata {
  const copy = homeMetadataCopy[locale];
  const pathname = getLocalizedHomePath(locale);
  const siteUrl = getSiteUrl();
  const title = `${copy.title} | +352 Flights`;

  return {
    title: { absolute: title },
    description: copy.description,
    alternates: {
      canonical: pathname,
      languages: getHomeLanguageAlternates(),
    },
    openGraph: {
      type: "website",
      siteName: "+352 Flights",
      title,
      description: copy.description,
      url: new URL(pathname, siteUrl),
      locale: htmlLangTags[locale].replace("-", "_"),
      alternateLocale: locales
        .filter((candidate) => candidate !== locale)
        .map((candidate) => htmlLangTags[candidate].replace("-", "_")),
    },
    twitter: {
      card: "summary",
      title,
      description: copy.description,
    },
  };
}
