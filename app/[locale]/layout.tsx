import { notFound } from "next/navigation";

import { LanguageProvider } from "@/lib/i18n";
import {
  htmlLangTags,
  isLocalizedHomeLocale,
} from "@/lib/locales";

type LocalizedLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return ["fr", "de", "pt", "it", "es"].map((locale) => ({ locale }));
}

export default async function LocalizedLayout({
  children,
  params,
}: LocalizedLayoutProps) {
  const { locale } = await params;
  if (!isLocalizedHomeLocale(locale)) {
    notFound();
  }

  const htmlLang = htmlLangTags[locale];
  const localeScript = `document.documentElement.lang=${JSON.stringify(htmlLang)};document.documentElement.dataset.locale=${JSON.stringify(locale)};`;

  return (
    <LanguageProvider initialLocale={locale}>
      <script dangerouslySetInnerHTML={{ __html: localeScript }} />
      {children}
    </LanguageProvider>
  );
}
