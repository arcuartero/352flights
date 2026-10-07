import Link from "next/link";
import { notFound } from "next/navigation";

import { LanguageSelector } from "@/components/language-selector";
import { V2AlertsButton } from "@/components/v2-alerts";
import { V2Outro } from "@/components/v2-outro";
import { isContactSegment } from "@/lib/contact-localization";
import { getLegalPageFromSegment } from "@/lib/legal-localization";
import { getLocalizedHomePath, isLocalizedHomeLocale } from "@/lib/locales";
import { BrandLogo } from "@/components/brand-logo";

import "../../home.css";
import "../../deals/deals-redesign.css";
import "../../deals/deals-ticket.css";

type LocalizedDealsLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string; segments: string[] }>;
};

export default async function LocalizedDealsLayout({
  children,
  params,
}: LocalizedDealsLayoutProps) {
  const { locale, segments } = await params;
  if (!isLocalizedHomeLocale(locale)) {
    notFound();
  }

  if (
    segments.length === 1 &&
    (getLegalPageFromSegment(locale, segments[0]) || isContactSegment(locale, segments[0]))
  ) {
    return children;
  }

  return (
    <div className="deals-redesign">
      <header className="v2-topbar deals-redesign__topbar">
        <Link
          aria-label="352 Flights"
          className="v2-topbar__brand"
          href={getLocalizedHomePath(locale)}
        >
          <BrandLogo priority />
        </Link>
        <div className="v2-topbar__actions">
          <LanguageSelector />
          <V2AlertsButton />
        </div>
      </header>
      {children}
      <V2Outro />
    </div>
  );
}
