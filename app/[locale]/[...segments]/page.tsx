import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DealsCityPageContent } from "@/components/deals-city-page-content";
import { DealsSearchPageContent } from "@/components/deals-search-page-content";
import { V2Legal } from "@/components/v2-legal";
import { getDealsCityMetadata, getDealsSearchMetadata } from "@/lib/deals-seo";
import { getDestinationCityFromSlug } from "@/lib/destination-routes";
import { getLocalizedDestinationName } from "@/lib/destination-localization";
import { isDestinationIndexable } from "@/lib/destination-seo-policy";
import {
  getLegalMetadata,
  getLegalPageFromSegment,
  type LegalPageKey,
} from "@/lib/legal-localization";
import {
  dealsPathSegments,
  isLocalizedHomeLocale,
  type LocalizedHomeLocale,
} from "@/lib/locales";
import { getPublicCityDealsPageData } from "@/lib/ops";

export const revalidate = 1800;

type LocalizedDealsPageProps = {
  params: Promise<{ locale: string; segments: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ResolvedLocalizedDealsRoute =
  | { locale: LocalizedHomeLocale; kind: "search" }
  | { locale: LocalizedHomeLocale; kind: "destination"; citySlug: string; cityName: string }
  | { locale: LocalizedHomeLocale; kind: "legal"; page: LegalPageKey };

function hasSearchParams(searchParams: Record<string, string | string[] | undefined>) {
  return Object.values(searchParams).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== undefined,
  );
}

async function resolveLocalizedDealsRoute(
  params: LocalizedDealsPageProps["params"],
): Promise<ResolvedLocalizedDealsRoute> {
  const { locale, segments } = await params;
  if (!isLocalizedHomeLocale(locale)) {
    notFound();
  }

  if (segments.length === 1) {
    const legalPage = getLegalPageFromSegment(locale, segments[0]);
    if (legalPage) {
      return { locale, kind: "legal", page: legalPage };
    }
    notFound();
  }

  if (segments.length !== 2) {
    notFound();
  }

  const expectedSegments = dealsPathSegments[locale];
  if (segments[0] !== expectedSegments.deals) {
    notFound();
  }

  if (segments[1] === expectedSegments.search) {
    return { locale, kind: "search" };
  }

  const citySlug = decodeURIComponent(segments[1]);
  const cityName = getDestinationCityFromSlug(citySlug);
  if (!cityName) {
    notFound();
  }

  return { locale, kind: "destination", citySlug, cityName };
}

export async function generateMetadata({
  params,
  searchParams,
}: LocalizedDealsPageProps): Promise<Metadata> {
  const [route, resolvedSearchParams] = await Promise.all([
    resolveLocalizedDealsRoute(params),
    searchParams,
  ]);

  if (route.kind === "search") {
    return getDealsSearchMetadata(route.locale);
  }

  if (route.kind === "legal") {
    return getLegalMetadata(route.locale, route.page);
  }

  const isFilteredPage = hasSearchParams(resolvedSearchParams);
  const cityData = isFilteredPage ? null : await getPublicCityDealsPageData(route.citySlug);
  const noindex =
    isFilteredPage || (cityData !== null && !isDestinationIndexable(route.citySlug, cityData));

  return getDealsCityMetadata(
    route.locale,
    getLocalizedDestinationName(route.cityName, route.locale),
    route.citySlug,
    noindex,
  );
}

export default async function LocalizedDealsPage({
  params,
  searchParams,
}: LocalizedDealsPageProps) {
  const route = await resolveLocalizedDealsRoute(params);

  if (route.kind === "search") {
    return <DealsSearchPageContent locale={route.locale} searchParams={searchParams} />;
  }

  if (route.kind === "legal") {
    return <V2Legal locale={route.locale} page={route.page} />;
  }

  return (
    <DealsCityPageContent
      locale={route.locale}
      params={Promise.resolve({ city: route.citySlug })}
      searchParams={searchParams}
    />
  );
}
