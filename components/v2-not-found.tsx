"use client";

import { Heart, House, Plane } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { LanguageSelector } from "@/components/language-selector";
import { V2AlertsButton } from "@/components/v2-alerts";
import { contactCopy, getLocalizedContactPath } from "@/lib/contact-localization";
import { useI18n, type Locale } from "@/lib/i18n";
import { getLocalizedLegalPath } from "@/lib/legal-localization";
import {
  getLocalizedDealsSearchPath,
  getLocalizedDestinationPath,
  getLocalizedHomePath,
} from "@/lib/locales";

const copy: Record<
  Locale,
  {
    eyebrow: string;
    title: string;
    body: [string, string];
    search: string;
    home: string;
    popular: string;
    illustration: string;
  }
> = {
  en: {
    eyebrow: "Route not found",
    title: "It looks like this route doesn't exist",
    body: [
      "The page you're looking for doesn't exist or has moved.",
      "But there are still plenty of deals taking off from Luxembourg.",
    ],
    search: "Find cheap flights",
    home: "Back to home",
    popular: "Or explore popular destinations",
    illustration: "Three luggage tags marked LUX and 404",
  },
  fr: {
    eyebrow: "Route introuvable",
    title: "On dirait que cette route n'existe pas",
    body: [
      "La page que vous recherchez n'existe pas ou a changé d'adresse.",
      "Mais de nombreuses offres décollent toujours du Luxembourg.",
    ],
    search: "Rechercher des vols pas chers",
    home: "Retour à l'accueil",
    popular: "Ou explorez des destinations populaires",
    illustration: "Trois étiquettes de bagage marquées LUX et 404",
  },
  de: {
    eyebrow: "Route nicht gefunden",
    title: "Diese Route scheint nicht zu existieren",
    body: [
      "Die gesuchte Seite existiert nicht oder wurde verschoben.",
      "Aber es starten weiterhin viele Angebote ab Luxemburg.",
    ],
    search: "Günstige Flüge suchen",
    home: "Zur Startseite",
    popular: "Oder beliebte Reiseziele entdecken",
    illustration: "Drei Gepäckanhänger mit den Aufschriften LUX und 404",
  },
  pt: {
    eyebrow: "Rota não encontrada",
    title: "Parece que esta rota não existe",
    body: [
      "A página que procura não existe ou mudou de endereço.",
      "Mas ainda há muitas ofertas a descolar do Luxemburgo.",
    ],
    search: "Procurar voos baratos",
    home: "Voltar ao início",
    popular: "Ou explore destinos populares",
    illustration: "Três etiquetas de bagagem com LUX e 404",
  },
  it: {
    eyebrow: "Rotta non trovata",
    title: "Sembra che questa rotta non esista",
    body: [
      "La pagina che cerchi non esiste o ha cambiato indirizzo.",
      "Ma ci sono ancora molte offerte in partenza dal Lussemburgo.",
    ],
    search: "Cerca voli economici",
    home: "Torna alla home",
    popular: "Oppure esplora le destinazioni più popolari",
    illustration: "Tre etichette per bagagli con le scritte LUX e 404",
  },
  es: {
    eyebrow: "Ruta no encontrada",
    title: "Parece que esta ruta no existe",
    body: [
      "La página que buscas no existe o ha cambiado de ruta.",
      "Pero todavía hay muchas ofertas despegando desde Luxemburgo.",
    ],
    search: "Buscar vuelos baratos",
    home: "Volver al inicio",
    popular: "O explora destinos populares",
    illustration: "Tres etiquetas de equipaje con LUX y 404",
  },
};

const popularDestinations: Array<{
  slug: string;
  labels: Record<Locale, string>;
}> = [
  {
    slug: "barcelona",
    labels: { en: "Barcelona", fr: "Barcelone", de: "Barcelona", pt: "Barcelona", it: "Barcellona", es: "Barcelona" },
  },
  {
    slug: "lisbon",
    labels: { en: "Lisbon", fr: "Lisbonne", de: "Lissabon", pt: "Lisboa", it: "Lisbona", es: "Lisboa" },
  },
  {
    slug: "rome",
    labels: { en: "Rome", fr: "Rome", de: "Rom", pt: "Roma", it: "Roma", es: "Roma" },
  },
  {
    slug: "london",
    labels: { en: "London", fr: "Londres", de: "London", pt: "Londres", it: "Londra", es: "Londres" },
  },
];

export function V2NotFound() {
  const { locale, t } = useI18n();
  const content = copy[locale];

  return (
    <div className="v2 v2-not-found">
      <header className="v2-topbar">
        <Link aria-label="352 Flights" className="v2-topbar__brand" href={getLocalizedHomePath(locale)}>
          <img alt="352 Flights" src="/v2-logo.png" />
        </Link>
        <div className="v2-topbar__actions">
          <LanguageSelector />
          <V2AlertsButton />
        </div>
      </header>

      <main className="v2-not-found__main">
        <section aria-labelledby="not-found-title" className="v2-not-found__panel">
          <div className="v2-not-found__copy">
            <p className="v2-eyebrow">{content.eyebrow}</p>
            <h1 id="not-found-title">{content.title}</h1>
            <p className="v2-not-found__body">
              {content.body[0]}
              <br />
              {content.body[1]}
            </p>

            <div className="v2-not-found__actions">
              <Link
                className="v2-not-found__action v2-not-found__action--primary"
                href={getLocalizedDealsSearchPath(locale)}
              >
                {content.search}
                <Plane aria-hidden="true" strokeWidth={2} />
              </Link>
              <Link
                className="v2-not-found__action v2-not-found__action--secondary"
                href={getLocalizedHomePath(locale)}
              >
                <House aria-hidden="true" strokeWidth={1.9} />
                {content.home}
              </Link>
            </div>

            <nav aria-label={content.popular} className="v2-not-found__popular">
              <p>{content.popular}</p>
              <ul>
                {popularDestinations.map((destination) => (
                  <li key={destination.slug}>
                    <Link href={getLocalizedDestinationPath(locale, destination.slug)}>
                      {destination.labels[locale]}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <figure className="v2-not-found__illustration">
            <Image
              alt={content.illustration}
              height={1254}
              priority
              sizes="(max-width: 760px) 84vw, 42vw"
              src="/404-luggage-tags-transparent.png"
              width={1254}
            />
          </figure>
        </section>
      </main>

      <footer className="v2-footer v2-not-found__footer">
        <span className="v2-footer__brand">
          +352 Flights <span aria-hidden="true">|</span> © 2026
        </span>
        <nav aria-label={t("common.legalNavigation")}>
          <Link href={getLocalizedContactPath(locale)}>{contactCopy[locale].navLabel}</Link>
          <Link href={getLocalizedLegalPath(locale, "privacy")}>{t("common.privacy")}</Link>
          <Link href={getLocalizedLegalPath(locale, "cookies")}>{t("common.cookies")}</Link>
          <Link href={getLocalizedLegalPath(locale, "terms")}>{t("common.terms")}</Link>
        </nav>
        <span className="v2-footer__made">
          {t("bottom.madeWith")}
          <Heart
            aria-hidden="true"
            className="v2-footer__heart"
            fill="currentColor"
            strokeWidth={0}
          />
          {t("bottom.inLuxembourg")}
        </span>
      </footer>
    </div>
  );
}
