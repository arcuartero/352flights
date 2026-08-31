import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicDealsExplorer } from "@/components/public-deals-explorer";
import routes from "@/data/lux-routes.json";
import {
  dealsSeoCopy,
  getDealsCityMetadata,
  getLocalizedDealsBreadcrumb,
} from "@/lib/deals-seo";
import { getDestinationContent, getDestinationTheme } from "@/lib/destination-content";
import { getDestinationPhotoUrlMap } from "@/lib/destination-photo-storage";
import { getDestinationCityFromSlug } from "@/lib/destination-routes";
import { matchesDestinationSlug, toDestinationSlug } from "@/lib/destination-slugs";
import { getSiteUrl } from "@/lib/env";
import { getLocalizedDestinationPath, type Locale } from "@/lib/locales";
import { getPublicCityDealsPageData, type PublicDealsPageData } from "@/lib/ops";
import type { CampaignPreviewDeal } from "@/lib/ops-shared";
import {
  parseDealSearchFilters,
  parseDealSearchSort,
} from "@/lib/public-deals-search";
import { getRequestLocale } from "@/lib/request-locale";

export const revalidate = 300;

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

function hasSearchParams(searchParams: Record<string, string | string[] | undefined>) {
  return Object.values(searchParams).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== undefined,
  );
}

function getAbsoluteUrl(pathname: string) {
  return new URL(pathname, getSiteUrl()).toString();
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
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  return getDealsCityMetadata(
    await getRequestLocale(),
    cityName,
    citySlug,
    hasSearchParams(resolvedSearchParams),
  );
}

function buildCityJsonLd(
  locale: Locale,
  cityName: string,
  citySlug: string,
  deals: CampaignPreviewDeal[],
) {
  const copy = dealsSeoCopy[locale];
  const breadcrumb = getLocalizedDealsBreadcrumb(locale, citySlug);
  const canonicalUrl = getAbsoluteUrl(breadcrumb.city);
  const topDeals = deals.slice(0, 10);
  const offers = topDeals.map((deal, index) => ({
    "@type": "Offer",
    "@id": `${canonicalUrl}#offer-${encodeURIComponent(deal.id)}`,
    name: copy.offerName(deal.destinationCity, Math.round(deal.dealPrice)),
    url: deal.bookingUrl ?? canonicalUrl,
    price: deal.dealPrice,
    priceCurrency: "EUR",
    availability: "https://schema.org/InStock",
    validFrom: deal.verifiedAt ?? undefined,
    itemOffered: {
      "@type": "Flight",
      name: copy.flightName(deal.destinationCity),
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
            name: copy.homeLabel,
            item: getAbsoluteUrl(breadcrumb.home),
          },
          {
            "@type": "ListItem",
            position: 2,
            name: copy.searchLabel,
            item: getAbsoluteUrl(breadcrumb.search),
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
        name: copy.itemListName(cityName),
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

function buildInternalLinkGroups(
  locale: Locale,
  cityName: string,
  citySlug: string,
): InternalLinkGroup[] {
  const copy = dealsSeoCopy[locale];
  const content = getDestinationContent(cityName);
  const destinations = getUniqueDestinations();
  const countryLinks = destinations
    .filter((item) => item.country === content.country && item.slug !== citySlug)
    .slice(0, 8)
    .map((item) => ({
      href: getLocalizedDestinationPath(locale, item.slug),
      label: item.city,
    }));
  const beachLinks = destinations
    .filter((item) => item.theme === "beach" && item.slug !== citySlug)
    .slice(0, 8)
    .map((item) => ({
      href: getLocalizedDestinationPath(locale, item.slug),
      label: item.city,
    }));

  return [
    {
      title: copy.countryGroup(content.country),
      links: countryLinks,
    },
    {
      title: copy.beachGroup,
      links: beachLinks,
    },
    {
      title: copy.filtersGroup(content.titleLabel),
      links: [
        {
          href: `${getLocalizedDestinationPath(locale, citySlug)}?trip=weekend`,
          label: copy.weekend,
        },
        {
          href: `${getLocalizedDestinationPath(locale, citySlug)}?direct=1`,
          label: copy.direct,
        },
        {
          href: `${getLocalizedDestinationPath(locale, citySlug)}?when=school_holidays`,
          label: copy.schoolHolidays,
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
  locale,
  cityName,
  citySlug,
}: {
  locale: Locale;
  cityName: string;
  citySlug: string;
}) {
  const copy = dealsSeoCopy[locale];
  const linkGroups = buildInternalLinkGroups(locale, cityName, citySlug);

  return (
    <section className="deals-city-internal-links" aria-labelledby="city-internal-links-title">
      <div className="deals-city-internal-links__inner">
        <div>
          <p className="deals-city-internal-links__kicker">{copy.internalKicker}</p>
          <h2 id="city-internal-links-title">{copy.internalTitle}</h2>
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
  const resolvedParams = await params;
  const citySlug = toDestinationSlug(decodeURIComponent(resolvedParams.city));
  const knownCityName = getDestinationCityFromSlug(citySlug);
  if (!knownCityName) {
    notFound();
  }

  const [destinationPhotoUrls, resolvedSearchParams, data, locale] = await Promise.all([
    getDestinationPhotoUrlMap(),
    searchParams,
    getPublicCityDealsPageData(citySlug),
    getRequestLocale(),
  ]);
  const cityData = filterCityDealsPageData(data, citySlug);
  const cityName = cityData.deals[0]?.destinationCity ?? knownCityName;
  const jsonLd = buildCityJsonLd(locale, cityName, citySlug, cityData.deals);
  const sharedFareParam = resolvedSearchParams.fare;
  const initialSharedFareId = Array.isArray(sharedFareParam)
    ? sharedFareParam[0] ?? null
    : sharedFareParam ?? null;

  return (
    <main className="page-shell page-shell--deals-city">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PublicDealsExplorer
        data={cityData}
        destinationPhotoUrls={destinationPhotoUrls}
        initialFilters={parseDealSearchFilters(resolvedSearchParams)}
        initialSharedFareId={initialSharedFareId}
        initialSort={parseDealSearchSort(resolvedSearchParams)}
        lockedDestinationCity={cityName}
        mode="city"
        searchPathname={getLocalizedDestinationPath(locale, citySlug)}
      />
      <CityInternalLinks locale={locale} cityName={cityName} citySlug={citySlug} />
    </main>
  );
}
