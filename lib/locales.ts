export const locales = ["en", "fr", "de", "pt", "it", "es"] as const;

export type Locale = (typeof locales)[number];

export const localizedHomeLocales = ["fr", "de", "pt", "it", "es"] as const;

export type LocalizedHomeLocale = (typeof localizedHomeLocales)[number];

export const localeCookieName = "luxflightdeals-locale";
export const localeRequestHeader = "x-352flights-locale";

export const htmlLangTags: Record<Locale, string> = {
  en: "en-LU",
  fr: "fr-LU",
  de: "de-LU",
  pt: "pt-LU",
  it: "it-LU",
  es: "es-LU",
};

export function isLocale(value: string | null | undefined): value is Locale {
  return Boolean(value && locales.includes(value as Locale));
}

export function isLocalizedHomeLocale(
  value: string | null | undefined,
): value is LocalizedHomeLocale {
  return Boolean(value && localizedHomeLocales.includes(value as LocalizedHomeLocale));
}

export function getLocalizedHomePath(locale: Locale) {
  return locale === "en" ? "/" : `/${locale}`;
}

export function getHomeLocaleFromPathname(pathname: string): Locale | null {
  if (pathname === "/") {
    return "en";
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 1 && isLocalizedHomeLocale(segments[0])) {
    return segments[0];
  }

  return null;
}
