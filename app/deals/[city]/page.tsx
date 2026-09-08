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

export async function generateMetadata({
  params,
}: DealsCityPageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const citySlug = toDestinationSlug(decodeURIComponent(resolvedParams.city));
  const cityName = getDestinationCityFromSlug(citySlug);
  if (!cityName) {
    return {
      title: "Destination not found",
      robots: { index: false, follow: false },
    };
  }

  return getDealsCityMetadata("en", cityName, citySlug);
}

export default function DealsCityPage({ params, searchParams }: DealsCityPageProps) {
  return <DealsCityPageContent locale="en" params={params} searchParams={searchParams} />;
}
