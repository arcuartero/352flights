import type { MetadataRoute } from "next";

import { getDestinationLanguageAlternates } from "@/lib/deals-seo";
import { getDestinationSlugs } from "@/lib/destination-routes";
import { matchesDestinationSlug } from "@/lib/destination-slugs";
import { isDestinationIndexable } from "@/lib/destination-seo-policy";
import { getLocalizedContactPath } from "@/lib/contact-localization";
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
const HOME_LAST_MODIFIED = new Date("2026-09-02T21:21:09.000Z");
const LEGAL_LAST_MODIFIED = new Date("2026-09-02T21:21:09.000Z");
const CONTACT_LAST_MODIFIED = new Date("2026-09-05T00:00:00.000Z");

function getDestinationLastModified(
  slug: string,
  deals: Awaited<ReturnType<typeof getPublicSearchDealsPageData>>["deals"],
) {
  const latestVerifiedAt = deals.reduce<string | null>((latest, deal) => {
    if (!matchesDestinationSlug(deal.destinationCity, slug) || !deal.verifiedAt) return latest;
    if (!latest) return deal.verifiedAt;
    return Date.parse(deal.verifiedAt) > Date.parse(latest) ? deal.verifiedAt : latest;
  }, null);

  return latestVerifiedAt ? new Date(latestVerifiedAt) : HOME_LAST_MODIFIED;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const publicDeals = await getPublicSearchDealsPageData();
  const homePages: MetadataRoute.Sitemap = locales.map((locale) => ({
    url: new URL(getLocalizedHomePath(locale), siteUrl).toString(),
    lastModified: HOME_LAST_MODIFIED,
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
      lastModified: getDestinationLastModified(slug, publicDeals.deals),
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
      lastModified: LEGAL_LAST_MODIFIED,
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
  const contactPages: MetadataRoute.Sitemap = locales.map((locale) => ({
    url: new URL(getLocalizedContactPath(locale), siteUrl).toString(),
    lastModified: CONTACT_LAST_MODIFIED,
    changeFrequency: "yearly",
    priority: 0.4,
    alternates: {
      languages: Object.fromEntries(
        locales.map((language) => [
          language,
          new URL(getLocalizedContactPath(language), siteUrl).toString(),
        ]),
      ),
    },
  }));

  return [...homePages, ...cityPages, ...localizedLegalPages, ...contactPages];
}
