import type { Metadata } from "next";

import { DealsCityPageContent } from "@/components/deals-city-page-content";
import { getDealsCityMetadata } from "@/lib/deals-seo";
import { getDestinationCityFromSlug } from "@/lib/destination-routes";
import { toDestinationSlug } from "@/lib/destination-slugs";

export const revalidate = 1800;

type DealsCityPageProps = {
  params: Promise<{ city: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function hasSearchParams(searchParams: Record<string, string | string[] | undefined>) {
  return Object.values(searchParams).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== undefined,
  );
}

export async function generateMetadata({
  params,
  searchParams,
}: DealsCityPageProps): Promise<Metadata> {
  const [resolvedParams, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const citySlug = toDestinationSlug(decodeURIComponent(resolvedParams.city));
  const cityName = getDestinationCityFromSlug(citySlug);
  if (!cityName) {
    return {
      title: "Destination not found",
      robots: { index: false, follow: false },
    };
  }

  return getDealsCityMetadata(
    "en",
    cityName,
    citySlug,
    hasSearchParams(resolvedSearchParams),
  );
}

export default function DealsCityPage({ params, searchParams }: DealsCityPageProps) {
  return <DealsCityPageContent locale="en" params={params} searchParams={searchParams} />;
}
