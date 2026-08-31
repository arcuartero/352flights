"use client";

import { ArrowRight, Heart, House, MapPinOff, Plane } from "lucide-react";
import Link from "next/link";

import { LanguageSelector } from "@/components/language-selector";
import { V2AlertsButton } from "@/components/v2-alerts";
import { useI18n, type Locale } from "@/lib/i18n";
import { getLocalizedHomePath } from "@/lib/locales";

const copy: Record<
  Locale,
  {
    eyebrow: string;
    title: string;
    body: string;
    search: string;
    home: string;
    illustration: string;
  }
> = {
  en: {
    eyebrow: "Off the route map",
    title: "Destination not found",
    body: "We couldn't find a route from Luxembourg with that name. Go back to the results and try another city.",
    search: "Search again",
    home: "Back to home",
    illustration: "A plane flying away from an unavailable destination",
  },
  fr: {
    eyebrow: "Hors de la carte",
    title: "Destination introuvable",
    body: "Nous n'avons trouvé aucun itinéraire depuis Luxembourg portant ce nom. Revenez aux résultats et essayez une autre ville.",
    search: "Relancer la recherche",
    home: "Retour à l'accueil",
    illustration: "Un avion s'éloignant d'une destination indisponible",
  },
  de: {
    eyebrow: "Nicht auf der Routenkarte",
    title: "Reiseziel nicht gefunden",
    body: "Wir konnten keine Route ab Luxemburg mit diesem Namen finden. Kehren Sie zu den Ergebnissen zurück und versuchen Sie eine andere Stadt.",
    search: "Erneut suchen",
    home: "Zur Startseite",
    illustration: "Ein Flugzeug fliegt von einem nicht verfügbaren Reiseziel weg",
  },
  pt: {
    eyebrow: "Fora do mapa de rotas",
    title: "Destino não encontrado",
    body: "Não encontrámos uma rota a partir do Luxemburgo com esse nome. Volte aos resultados e experimente outra cidade.",
    search: "Pesquisar novamente",
    home: "Voltar ao início",
    illustration: "Um avião a afastar-se de um destino indisponível",
  },
  it: {
    eyebrow: "Fuori dalla mappa delle rotte",
    title: "Destinazione non trovata",
    body: "Non abbiamo trovato una rotta dal Lussemburgo con questo nome. Torna ai risultati e prova un'altra città.",
    search: "Cerca di nuovo",
    home: "Torna alla home",
    illustration: "Un aereo si allontana da una destinazione non disponibile",
  },
  es: {
    eyebrow: "Fuera del mapa de rutas",
    title: "Destino no encontrado",
    body: "No hemos encontrado una ruta desde Luxemburgo con ese nombre. Vuelve a los resultados y prueba con otra ciudad.",
    search: "Volver a buscar",
    home: "Ir al inicio",
    illustration: "Un avión alejándose de un destino no disponible",
  },
};

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
            <h1 id="not-found-title">
              <span>404</span>
              {content.title}
            </h1>
            <p className="v2-not-found__body">{content.body}</p>

            <div className="v2-not-found__actions">
              <Link className="v2-not-found__action v2-not-found__action--primary" href="/deals/search">
                {content.search}
                <ArrowRight aria-hidden="true" strokeWidth={2} />
              </Link>
              <Link
                className="v2-not-found__action v2-not-found__action--secondary"
                href={getLocalizedHomePath(locale)}
              >
                <House aria-hidden="true" strokeWidth={1.9} />
                {content.home}
              </Link>
            </div>
          </div>

          <div aria-label={content.illustration} className="v2-not-found__illustration" role="img">
            <span aria-hidden="true" className="v2-not-found__route" />
            <span aria-hidden="true" className="v2-not-found__plane">
              <Plane strokeWidth={1.8} />
            </span>
            <span aria-hidden="true" className="v2-not-found__pin">
              <MapPinOff strokeWidth={1.7} />
            </span>
            <span aria-hidden="true" className="v2-not-found__code">
              404
            </span>
          </div>
        </section>
      </main>

      <footer className="v2-footer v2-not-found__footer">
        <span className="v2-footer__brand">
          +352 Flights <span aria-hidden="true">|</span> © 2026
        </span>
        <nav aria-label={t("common.legalNavigation")}>
          <Link href="/privacy">{t("common.privacy")}</Link>
          <Link href="/cookies">{t("common.cookies")}</Link>
          <Link href="/terms">{t("common.terms")}</Link>
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
