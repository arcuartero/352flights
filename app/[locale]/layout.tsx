import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RootDocument } from "@/components/root-document";
import { getSiteUrl } from "@/lib/env";
import { getHomeMetadata } from "@/lib/home-localization";
import {
  isLocalizedHomeLocale,
} from "@/lib/locales";

import "../globals.css";
import "../public-deals-date-picker.css";
import "../public-deals-price-range.css";

type LocalizedLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return ["fr", "de", "pt", "it", "es"].map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LocalizedLayoutProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocalizedHomeLocale(locale)) {
    notFound();
  }

  return {
    ...getHomeMetadata(locale),
    metadataBase: new URL(getSiteUrl()),
  };
}

export default async function LocalizedLayout({
  children,
  params,
}: LocalizedLayoutProps) {
  const { locale } = await params;
  if (!isLocalizedHomeLocale(locale)) {
    notFound();
  }

  return <RootDocument locale={locale}>{children}</RootDocument>;
}
