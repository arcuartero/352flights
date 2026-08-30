import type { MetadataRoute } from "next";

import routes from "@/data/lux-routes.json";
import { toDestinationSlug } from "@/lib/destination-slugs";
import { getSiteUrl } from "@/lib/env";
import { getHomeLanguageAlternates } from "@/lib/home-localization";
import { getLocalizedHomePath, locales } from "@/lib/locales";

function uniqueDestinationSlugs() {
  return Array.from(
    new Set(routes.map((route) => toDestinationSlug(route.destination_city))),
  ).sort((left, right) => left.localeCompare(right));
}

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
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/deals`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.9,
    },
  ];

  const cityPages: MetadataRoute.Sitemap = uniqueDestinationSlugs().map((slug) => ({
    url: `${siteUrl}/deals/${slug}`,
    lastModified: now,
    changeFrequency: "hourly",
    priority: slug === "gran-canaria" ? 0.9 : 0.8,
  }));

  return [...homePages, ...staticPages, ...cityPages];
}
