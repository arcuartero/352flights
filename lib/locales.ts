export const locales = ["en", "fr", "de", "pt", "it", "es"] as const;

export type Locale = (typeof locales)[number];

export const localizedHomeLocales = ["fr", "de", "pt", "it", "es"] as const;

export type LocalizedHomeLocale = (typeof localizedHomeLocales)[number];

export const localeCookieName = "luxflightdeals-locale";

export const htmlLangTags: Record<Locale, string> = {
  en: "en-LU",
  fr: "fr-LU",
  de: "de-LU",
  pt: "pt-LU",
  it: "it-LU",
  es: "es-LU",
};

export const dealsPathSegments: Record<Locale, { deals: string; search: string }> = {
  en: { deals: "deals", search: "search" },
  fr: { deals: "offres", search: "recherche" },
  de: { deals: "angebote", search: "suche" },
  pt: { deals: "ofertas", search: "pesquisa" },
  it: { deals: "offerte", search: "ricerca" },
  es: { deals: "ofertas", search: "busqueda" },
};

export type LocalizedDealsRoute =
  | { locale: Locale; kind: "search" }
  | { locale: Locale; kind: "destination"; citySlug: string };

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

export function getLocalizedDealsSearchPath(locale: Locale) {
  const { deals, search } = dealsPathSegments[locale];
  return locale === "en" ? `/${deals}/${search}` : `/${locale}/${deals}/${search}`;
}

export function getLocalizedDestinationPath(locale: Locale, citySlug: string) {
  const { deals } = dealsPathSegments[locale];
  const encodedCitySlug = encodeURIComponent(citySlug);
  return locale === "en"
    ? `/${deals}/${encodedCitySlug}`
    : `/${locale}/${deals}/${encodedCitySlug}`;
}

export function parseLocalizedDealsPathname(pathname: string): LocalizedDealsRoute | null {
  const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const locale = isLocalizedHomeLocale(segments[0]) ? segments[0] : "en";
  const routeSegments = locale === "en" ? segments : segments.slice(1);
  const expected = dealsPathSegments[locale];

  if (routeSegments.length !== 2 || routeSegments[0] !== expected.deals) {
    return null;
  }

  if (routeSegments[1] === expected.search) {
    return { locale, kind: "search" };
  }

  return {
    locale,
    kind: "destination",
    citySlug: routeSegments[1],
  };
}

export function getLocalizedPublicPath(pathname: string, locale: Locale) {
  if (getHomeLocaleFromPathname(pathname)) {
    return getLocalizedHomePath(locale);
  }

  const dealsRoute = parseLocalizedDealsPathname(pathname);
  if (dealsRoute) {
    return dealsRoute.kind === "search"
      ? getLocalizedDealsSearchPath(locale)
      : getLocalizedDestinationPath(locale, dealsRoute.citySlug);
  }

  const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const currentLocale = isLocalizedHomeLocale(segments[0]) ? segments[0] : "en";
  const routeSegments = currentLocale === "en" ? segments : segments.slice(1);
  if (routeSegments.length === 1) {
    const contactSegments: Record<Locale, string> = {
      en: "contact",
      fr: "contact",
      de: "kontakt",
      pt: "contacto",
      it: "contatti",
      es: "contacto",
    };
    if (routeSegments[0] === contactSegments[currentLocale]) {
      const segment = contactSegments[locale];
      return locale === "en" ? `/${segment}` : `/${locale}/${segment}`;
    }

    // Kept as a lazy import-free lookup to avoid coupling the core locale helpers
    // to the metadata module.
    const legalSegments: Record<Locale, Record<string, string>> = {
      en: { privacy: "privacy", cookies: "cookies", terms: "terms" },
      fr: { privacy: "confidentialite", cookies: "cookies", terms: "conditions" },
      de: { privacy: "datenschutz", cookies: "cookies", terms: "nutzungsbedingungen" },
      pt: { privacy: "privacidade", cookies: "cookies", terms: "termos" },
      it: { privacy: "privacy", cookies: "cookie", terms: "termini" },
      es: { privacy: "privacidad", cookies: "cookies", terms: "terminos" },
    };
    const page = Object.entries(legalSegments[currentLocale]).find(
      ([, segment]) => segment === routeSegments[0],
    )?.[0];
    if (page) {
      const segment = legalSegments[locale][page];
      return locale === "en" ? `/${segment}` : `/${locale}/${segment}`;
    }
  }

  return null;
}

export function getLocaleFromPathname(pathname: string): Locale | null {
  if (
    pathname === "/" ||
    pathname === "/contact" ||
    pathname === "/deals" ||
    pathname.startsWith("/deals/")
  ) {
    return "en";
  }

  const [firstSegment] = pathname.split("/").filter(Boolean);
  return isLocalizedHomeLocale(firstSegment) ? firstSegment : null;
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
