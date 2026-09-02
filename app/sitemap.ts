import type { MetadataRoute } from "next";

import { getDestinationLanguageAlternates } from "@/lib/deals-seo";
import { getDestinationSlugs } from "@/lib/destination-routes";
import { isDestinationIndexable } from "@/lib/destination-seo-policy";
import { getSiteUrl } from "@/lib/env";
import { getHomeLanguageAlternates } from "@/lib/home-localization";
import {
  getLegalLanguageAlternates,
  getLocalizedLegalPath,
  type LegalPageKey,
} from "@/lib/legal-localization";
import {
  getLocalizedDestinationPath,
  getLocalizedHomePath,
  locales,
} from "@/lib/locales";
import { getPublicSearchDealsPageData } from "@/lib/ops";

export const revalidate = 1800;

const legalPages: LegalPageKey[] = ["privacy", "cookies", "terms"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const now = new Date();
  const publicDeals = await getPublicSearchDealsPageData();
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
  const indexableDestinationSlugs = getDestinationSlugs().filter((slug) =>
    isDestinationIndexable(slug, publicDeals),
  );
  const cityPages: MetadataRoute.Sitemap = indexableDestinationSlugs.flatMap((slug) =>
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
  const localizedLegalPages: MetadataRoute.Sitemap = legalPages.flatMap((page) =>
    locales.map((locale) => ({
      url: new URL(getLocalizedLegalPath(locale, page), siteUrl).toString(),
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.2,
      alternates: {
        languages: Object.fromEntries(
          Object.entries(getLegalLanguageAlternates(page)).map(([language, pathname]) => [
            language,
            new URL(pathname, siteUrl).toString(),
          ]),
        ),
      },
    })),
  );

  return [...homePages, ...cityPages, ...localizedLegalPages];
}
