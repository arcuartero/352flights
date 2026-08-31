import type { MetadataRoute } from "next";

import { getDestinationLanguageAlternates } from "@/lib/deals-seo";
import { getDestinationSlugs } from "@/lib/destination-routes";
import { getSiteUrl } from "@/lib/env";
import { getHomeLanguageAlternates } from "@/lib/home-localization";
import {
  getLocalizedDestinationPath,
  getLocalizedHomePath,
  locales,
} from "@/lib/locales";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const now = new Date();
  const homePages: MetadataRoute.Sitemap = locales.map((locale) => ({
    url: new URL(getLocalizedHomePath(locale), siteUrl).toString(),
    lastModified: now,
    changeFrequency: "daily",
    priority: 1,
    alternates: {
      languages: Object.fromEntries(
        Object.entries(getHomeLanguageAlternates()).map(([language, pathname]) => [
          language,
          new URL(pathname, siteUrl).toString(),
        ]),
      ),
    },
  }));
  const cityPages: MetadataRoute.Sitemap = getDestinationSlugs().flatMap((slug) =>
    locales.map((locale) => ({
      url: new URL(getLocalizedDestinationPath(locale, slug), siteUrl).toString(),
      lastModified: now,
      changeFrequency: "hourly" as const,
      priority: slug === "gran-canaria" ? 0.9 : 0.8,
      alternates: {
        languages: Object.fromEntries(
          Object.entries(getDestinationLanguageAlternates(slug)).map(
            ([language, pathname]) => [language, new URL(pathname, siteUrl).toString()],
          ),
        ),
      },
    })),
  );

  return [...homePages, ...cityPages];
}
