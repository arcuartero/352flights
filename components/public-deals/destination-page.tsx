"use client";

import Link from "next/link";
import { useMemo } from "react";
import { DestinationVisual as LandmarkPhoto } from "@/components/public-destination-visual";
import { useI18n } from "@/lib/i18n";
import { getLocalizedHomePath } from "@/lib/locales";
import type { CampaignPreviewDeal } from "@/lib/ops-shared";
import { type DestinationPhotoUrlMap } from "@/components/public-deals/types";
import {
  countDealsPerDestination,
  getDestinationCountKey,
  getDestinationPhotoSrc,
  getLandmarkTitle,
  getLowestPrice,
} from "@/components/public-deals/filters";
import {
  formatCurrency,
  formatVerifiedAge,
} from "@/components/public-deals/formatters";
import { DealFlightCard } from "@/components/public-deals/fare-cards";

export function PublicDealsDestinationPage({
  cityName,
  deals,
  destinationPhotoUrls,
  updatedAt,
}: {
  cityName: string;
  deals: CampaignPreviewDeal[];
  destinationPhotoUrls?: DestinationPhotoUrlMap;
  updatedAt: string | null;
}) {
  const { locale, t } = useI18n();
  const destinationCounts = useMemo(
    () => countDealsPerDestination(deals),
    [deals],
  );
  const heroDeal = deals[0] ?? null;
  const lowestPrice = getLowestPrice(deals);

  return (
    <section className="deals-city-page">
      <div className="deals-city-page__hero">
        <div className="deals-city-page__hero-copy">
          <Link
            className="deals-explorer__secondary-link"
            href={getLocalizedHomePath(locale)}
          >
            ← {t("common.home")}
          </Link>
          <p className="deals-explorer__kicker">
            {t("deals.destinationBoard")}
          </p>
          <h1>{cityName}</h1>
          <p>{t("deals.destinationBoardDesc", { destination: cityName })}</p>
        </div>

        <div className="deals-city-page__hero-summary">
          <span>
            {deals.length}{" "}
            {deals.length === 1 ? t("deals.fare") : t("deals.fares")}
          </span>
          <strong>
            {t("common.from").toLowerCase()}{" "}
            {formatCurrency(lowestPrice ?? deals[0]?.dealPrice ?? 0)}
          </strong>
          <small>
            {updatedAt
              ? formatVerifiedAge(updatedAt, t)
              : t("deals.updatedAsDealsLand")}
          </small>
        </div>
      </div>

      {heroDeal ? (
        <figure className="deals-city-page__media" aria-hidden="true">
          <LandmarkPhoto
            alt={t("deals.a11y.destinationLandmark", { destination: cityName })}
            destinationCity={cityName}
            landmarkTitle={getLandmarkTitle(heroDeal)}
            photoSrc={getDestinationPhotoSrc(destinationPhotoUrls, cityName)}
          />
          <div className="deals-card__media-overlay" />
        </figure>
      ) : null}

      <div className="deals-city-page__results">
        {deals.map((deal) => (
          <DealFlightCard
            combinationsCount={
              destinationCounts.get(getDestinationCountKey(deal)) ?? 1
            }
            key={`city-deal-${deal.id}`}
            deal={deal}
            layout="route"
            shiftDurationLeft
            showCityLabel={false}
            showAirlineLogo
            showArrivalDate
            showMobileAirlineName
            showWeekdayInDate={false}
          />
        ))}
      </div>
    </section>
  );
}
