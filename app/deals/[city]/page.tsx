import type { Metadata } from "next";
import Link from "next/link";

import { PublicDealsExplorer } from "@/components/public-deals-explorer";
import routes from "@/data/lux-routes.json";
import { getDestinationContent, getDestinationTheme } from "@/lib/destination-content";
import { matchesDestinationSlug, toDestinationSlug } from "@/lib/destination-slugs";
import { getSiteUrl } from "@/lib/env";
import { getPublicDealsPageData, type PublicDealsPageData } from "@/lib/ops";
import type { CampaignPreviewDeal } from "@/lib/ops-shared";
import {
  parseDealSearchFilters,
  parseDealSearchSort,
} from "@/lib/public-deals-search";

export const dynamic = "force-dynamic";

type DealsCityPageProps = {
  params: Promise<{
    city: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type InternalLinkGroup = {
  title: string;
  links: Array<{
    href: string;
    label: string;
  }>;
};

function formatCitySlug(citySlug: string) {
  return citySlug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function hasSearchParams(searchParams: Record<string, string | string[] | undefined>) {
  return Object.values(searchParams).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== undefined,
  );
}

function getCityNameFromSlug(citySlug: string) {
  const route = routes.find((item) => toDestinationSlug(item.destination_city) === citySlug);
  return route?.destination_city ?? formatCitySlug(citySlug);
}

function getAbsoluteUrl(pathname: string) {
  return new URL(pathname, getSiteUrl()).toString();
}

function buildCityMetadata(cityName: string, citySlug: string, noindex: boolean): Metadata {
  const content = getDestinationContent(cityName);
  const canonicalPath = `/deals/${citySlug}`;

  return {
    title: `Vuelos baratos de Luxemburgo a ${content.titleLabel}`,
    description: content.metaDescription,
    alternates: {
      canonical: canonicalPath,
      languages: {
        "es-LU": canonicalPath,
      },
    },
    openGraph: {
      title: `Vuelos baratos de Luxemburgo a ${content.titleLabel}`,
      description: content.metaDescription,
      url: canonicalPath,
      type: "website",
      locale: "es_LU",
    },
    robots: noindex
      ? {
          index: false,
          follow: true,
        }
      : {
          index: true,
          follow: true,
        },
  };
}

export async function generateMetadata({
  params,
  searchParams,
}: DealsCityPageProps): Promise<Metadata> {
  const [resolvedParams, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const citySlug = toDestinationSlug(decodeURIComponent(resolvedParams.city));
  const cityName = getCityNameFromSlug(citySlug);

  return buildCityMetadata(cityName, citySlug, hasSearchParams(resolvedSearchParams));
}

function buildCityJsonLd(cityName: string, citySlug: string, deals: CampaignPreviewDeal[]) {
  const canonicalUrl = getAbsoluteUrl(`/deals/${citySlug}`);
  const topDeals = deals.slice(0, 10);
  const offers = topDeals.map((deal, index) => ({
    "@type": "Offer",
    "@id": `${canonicalUrl}#offer-${encodeURIComponent(deal.id)}`,
    name: `Vuelo de Luxemburgo a ${deal.destinationCity} desde ${Math.round(deal.dealPrice)} EUR`,
    url: deal.bookingUrl ?? canonicalUrl,
    price: deal.dealPrice,
    priceCurrency: "EUR",
    availability: "https://schema.org/InStock",
    validFrom: deal.verifiedAt ?? undefined,
    itemOffered: {
      "@type": "Flight",
      name: `Luxemburgo a ${deal.destinationCity}`,
      flightNumber: deal.airlineSummary ?? undefined,
      departureAirport: {
        "@type": "Airport",
        name: "Luxembourg Airport",
        iataCode: "LUX",
      },
      arrivalAirport: {
        "@type": "Airport",
        name: `${deal.destinationCity} Airport`,
        iataCode: deal.destinationAirport,
      },
      departureTime: deal.outboundDepartureAt ?? deal.departureDate ?? undefined,
      arrivalTime: deal.outboundArrivalAt ?? undefined,
    },
    position: index + 1,
  }));

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "@id": `${canonicalUrl}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Inicio",
            item: getAbsoluteUrl("/"),
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Vuelos baratos",
            item: getAbsoluteUrl("/deals"),
          },
          {
            "@type": "ListItem",
            position: 3,
            name: cityName,
            item: canonicalUrl,
          },
        ],
      },
      {
        "@type": "ItemList",
        "@id": `${canonicalUrl}#offers`,
        name: `Vuelos baratos de Luxemburgo a ${cityName}`,
        itemListElement: offers.map((offer) => ({
          "@type": "ListItem",
          position: offer.position,
          url: offer.url,
          item: {
            "@id": offer["@id"],
          },
        })),
      },
      ...offers.map(({ position: _position, ...offer }) => offer),
    ],
  };
}

function getUniqueDestinations() {
  const seen = new Set<string>();
  return routes
    .map((route) => ({
      city: route.destination_city,
      slug: toDestinationSlug(route.destination_city),
      country: getDestinationContent(route.destination_city).country,
      theme: getDestinationTheme(route.destination_city),
    }))
    .filter((item) => {
      if (seen.has(item.slug)) {
        return false;
      }
      seen.add(item.slug);
      return true;
    });
}

function buildInternalLinkGroups(cityName: string, citySlug: string): InternalLinkGroup[] {
  const content = getDestinationContent(cityName);
  const destinations = getUniqueDestinations();
  const countryLinks = destinations
    .filter((item) => item.country === content.country && item.slug !== citySlug)
    .slice(0, 8)
    .map((item) => ({
      href: `/deals/${item.slug}`,
      label: item.city,
    }));
  const beachLinks = destinations
    .filter((item) => item.theme === "beach" && item.slug !== citySlug)
    .slice(0, 8)
    .map((item) => ({
      href: `/deals/${item.slug}`,
      label: item.city,
    }));

  return [
    {
      title: `Mas vuelos a ${content.country}`,
      links: countryLinks,
    },
    {
      title: "Playas desde Luxemburgo",
      links: beachLinks,
    },
    {
      title: `Filtros utiles para ${content.titleLabel}`,
      links: [
        {
          href: `/deals/${citySlug}?trip=weekend`,
          label: "Fin de semana",
        },
        {
          href: `/deals/${citySlug}?direct=1`,
          label: "Vuelos directos",
        },
        {
          href: `/deals/${citySlug}?when=school_holidays`,
          label: "Vacaciones escolares",
        },
      ],
    },
  ].filter((group) => group.links.length > 0);
}

function filterCityDealsPageData(data: PublicDealsPageData, citySlug: string): PublicDealsPageData {
  const cityDeals = data.deals
    .filter((deal) => matchesDestinationSlug(deal.destinationCity, citySlug))
    .sort((left, right) => {
      if (left.dealPrice !== right.dealPrice) {
        return left.dealPrice - right.dealPrice;
      }

      return right.score - left.score;
    });

  return {
    ...data,
    deals: cityDeals,
    sections: data.sections
      .map((section) => ({
        ...section,
        items: section.items.filter((deal) => matchesDestinationSlug(deal.destinationCity, citySlug)),
      }))
      .filter((section) => section.items.length > 0),
  };
}

function CityInternalLinks({
  cityName,
  citySlug,
}: {
  cityName: string;
  citySlug: string;
}) {
  const linkGroups = buildInternalLinkGroups(cityName, citySlug);

  return (
    <section className="deals-city-internal-links" aria-labelledby="city-internal-links-title">
      <div className="deals-city-internal-links__inner">
        <div>
          <p className="deals-city-internal-links__kicker">Mas ideas desde LUX</p>
          <h2 id="city-internal-links-title">Enlaces utiles para planificar el viaje</h2>
        </div>
        <div className="deals-city-internal-links__groups">
          {linkGroups.map((group) => (
            <div className="deals-city-internal-links__group" key={group.title}>
              <h3>{group.title}</h3>
              <ul>
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default async function DealsCityPage({ params, searchParams }: DealsCityPageProps) {
  const [resolvedParams, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const citySlug = toDestinationSlug(decodeURIComponent(resolvedParams.city));
  const data = filterCityDealsPageData(await getPublicDealsPageData(), citySlug);
  const cityName = data.deals[0]?.destinationCity ?? getCityNameFromSlug(citySlug);
  const jsonLd = buildCityJsonLd(cityName, citySlug, data.deals);

  return (
    <main className="page-shell page-shell--deals-city">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PublicDealsExplorer
        data={data}
        initialFilters={parseDealSearchFilters(resolvedSearchParams)}
        initialSort={parseDealSearchSort(resolvedSearchParams)}
        lockedDestinationCity={cityName}
        mode="city"
        searchPathname={`/deals/${encodeURIComponent(citySlug)}`}
      />
      <CityInternalLinks cityName={cityName} citySlug={citySlug} />
    </main>
  );
}
