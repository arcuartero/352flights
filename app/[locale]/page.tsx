import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HomePageContent } from "@/components/home-page-content";
import { getHomeMetadata } from "@/lib/home-localization";
import {
  isLocalizedHomeLocale,
  type LocalizedHomeLocale,
} from "@/lib/locales";

import "../home.css";

export const revalidate = 3600;

type LocalizedHomePageProps = {
  params: Promise<{ locale: string }>;
};

async function getLocale(params: LocalizedHomePageProps["params"]): Promise<LocalizedHomeLocale> {
  const { locale } = await params;
  if (!isLocalizedHomeLocale(locale)) {
    notFound();
  }
  return locale;
}

export async function generateMetadata({ params }: LocalizedHomePageProps): Promise<Metadata> {
  return getHomeMetadata(await getLocale(params));
}

export default async function LocalizedHomePage({ params }: LocalizedHomePageProps) {
  await getLocale(params);
  return <HomePageContent />;
}
