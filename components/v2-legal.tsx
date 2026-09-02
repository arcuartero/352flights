import Link from "next/link";
import { Heart } from "lucide-react";
import { LanguageSelector } from "@/components/language-selector";
import {
  getLocalizedLegalPath,
  legalCopy,
  type LegalPageKey,
} from "@/lib/legal-localization";
import { getLocalizedHomePath, type Locale } from "@/lib/locales";

type V2LegalProps = {
  locale: Locale;
  page: LegalPageKey;
};

export function V2Legal({ locale, page }: V2LegalProps) {
  const localeCopy = legalCopy[locale];
  const copy = localeCopy.pages[page];
  const homePath = getLocalizedHomePath(locale);

  return (
    <div className="v2 v2-legal">
      <header className="v2-topbar">
        <Link className="v2-topbar__brand" href={homePath} aria-label="352 Flights">
          <img src="/v2-logo.png" alt="352 Flights" />
        </Link>
        <div className="v2-topbar__actions">
          <LanguageSelector />
          <Link className="v2-topbar__cta" href={homePath}>
            {localeCopy.backHome}
          </Link>
        </div>
      </header>

      <main className="v2-legal__main">
        <p className="v2-eyebrow">{localeCopy.eyebrow}</p>
        <h1 className="v2-legal__title">{copy.title}</h1>
        <p className="v2-legal__intro">{copy.intro}</p>
        <div className="v2-legal__content">
          {copy.sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
      </main>

      <footer className="v2-footer v2-legal__footer">
        <span className="v2-footer__brand">
          +352 Flights <span aria-hidden="true">|</span> © 2026
        </span>
        <nav aria-label="Legal">
          <Link href={getLocalizedLegalPath(locale, "privacy")}>
            {legalCopy[locale].pages.privacy.title}
          </Link>
          <Link href={getLocalizedLegalPath(locale, "cookies")}>
            {legalCopy[locale].pages.cookies.title}
          </Link>
          <Link href={getLocalizedLegalPath(locale, "terms")}>
            {legalCopy[locale].pages.terms.title}
          </Link>
        </nav>
        <span className="v2-footer__made">
          {locale === "fr" ? "Fait avec" : locale === "de" ? "Gemacht mit" : locale === "pt" ? "Feito com" : locale === "it" ? "Fatto con" : locale === "es" ? "Hecho con" : "Made with"}
          <Heart className="v2-footer__heart" fill="currentColor" strokeWidth={0} aria-hidden="true" />
          {locale === "fr" ? "au Luxembourg" : locale === "de" ? "in Luxemburg" : locale === "pt" ? "no Luxemburgo" : locale === "it" ? "in Lussemburgo" : locale === "es" ? "en Luxemburgo" : "in Luxembourg"}
        </span>
      </footer>
    </div>
  );
}
