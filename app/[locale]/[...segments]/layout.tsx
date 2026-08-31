import Link from "next/link";
import { notFound } from "next/navigation";

import { LanguageSelector } from "@/components/language-selector";
import { V2AlertsButton } from "@/components/v2-alerts";
import { V2Outro } from "@/components/v2-outro";
import { getLocalizedHomePath, isLocalizedHomeLocale } from "@/lib/locales";

import "../../home.css";
import "../../deals/deals-redesign.css";

type LocalizedDealsLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string; segments: string[] }>;
};

export default async function LocalizedDealsLayout({
  children,
  params,
}: LocalizedDealsLayoutProps) {
  const { locale } = await params;
  if (!isLocalizedHomeLocale(locale)) {
    notFound();
  }

  return (
    <div className="deals-redesign">
      <header className="v2-topbar deals-redesign__topbar">
        <Link
          aria-label="352 Flights"
          className="v2-topbar__brand"
          href={getLocalizedHomePath(locale)}
        >
          <img src="/v2-logo.png" alt="352 Flights" />
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
