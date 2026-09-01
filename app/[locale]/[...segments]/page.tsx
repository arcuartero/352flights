import type { Metadata } from "next";
import { notFound } from "next/navigation";

import DealsCityPage from "@/app/deals/[city]/page";
import DealsSearchPage from "@/app/deals/search/page";
import { getDealsCityMetadata, getDealsSearchMetadata } from "@/lib/deals-seo";
import { getDestinationCityFromSlug } from "@/lib/destination-routes";
import {
  dealsPathSegments,
  isLocalizedHomeLocale,
  type LocalizedHomeLocale,
} from "@/lib/locales";

export const revalidate = 1800;

type LocalizedDealsPageProps = {
  params: Promise<{ locale: string; segments: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ResolvedLocalizedDealsRoute =
  | { locale: LocalizedHomeLocale; kind: "search" }
  | { locale: LocalizedHomeLocale; kind: "destination"; citySlug: string; cityName: string };

function hasSearchParams(searchParams: Record<string, string | string[] | undefined>) {
  return Object.values(searchParams).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== undefined,
  );
}

async function resolveLocalizedDealsRoute(
  params: LocalizedDealsPageProps["params"],
): Promise<ResolvedLocalizedDealsRoute> {
  const { locale, segments } = await params;
  if (!isLocalizedHomeLocale(locale) || segments.length !== 2) {
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

  return route.kind === "search"
    ? getDealsSearchMetadata(route.locale)
    : getDealsCityMetadata(
        route.locale,
        route.cityName,
        route.citySlug,
        hasSearchParams(resolvedSearchParams),
      );
}

export default async function LocalizedDealsPage({
  params,
  searchParams,
}: LocalizedDealsPageProps) {
  const route = await resolveLocalizedDealsRoute(params);

  if (route.kind === "search") {
    return <DealsSearchPage searchParams={searchParams} />;
  }

  return (
    <DealsCityPage
      params={Promise.resolve({ city: route.citySlug })}
      searchParams={searchParams}
    />
  );
}
