"use client";

import Link from "next/link";
import { Heart } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { contactCopy, getLocalizedContactPath } from "@/lib/contact-localization";
import { getLocalizedLegalPath, legalCopy } from "@/lib/legal-localization";

export function V2Footer() {
  const { locale, t } = useI18n();
  const pages = legalCopy[locale].pages;

  return (
    <footer className="v2-footer v2-footer--standalone">
      <span className="v2-footer__brand">
        +352 Flights <span aria-hidden="true">|</span> © 2026
      </span>
      <nav aria-label="Legal">
        <Link href={getLocalizedContactPath(locale)}>{contactCopy[locale].navLabel}</Link>
        <Link href={getLocalizedLegalPath(locale, "privacy")}>{pages.privacy.title}</Link>
        <Link href={getLocalizedLegalPath(locale, "cookies")}>{pages.cookies.title}</Link>
        <Link href={getLocalizedLegalPath(locale, "terms")}>{pages.terms.title}</Link>
      </nav>
      <span className="v2-footer__made">
        {t("bottom.madeWith")}
        <Heart className="v2-footer__heart" fill="currentColor" strokeWidth={0} aria-hidden="true" />
        {t("bottom.inLuxembourg")}
      </span>
    </footer>
  );
}
