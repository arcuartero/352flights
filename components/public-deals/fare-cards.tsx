"use client";

import Link from "next/link";
import { useId } from "react";
import { ArrowDown, Info, Plane, Sparkle } from "lucide-react";
import { DestinationVisual as LandmarkPhoto } from "@/components/public-destination-visual";
import { PublicDealsSelect as DealsSelect } from "@/components/public-deals-select";
import { useI18n } from "@/lib/i18n";
import type { CampaignPreviewDeal } from "@/lib/ops-shared";
import {
  getLocalizedLuxSchoolHolidayLabel,
  getMatchingLuxSchoolHoliday,
} from "@/lib/lux-school-holidays";
import { getLocalizedDestinationName } from "@/lib/destination-localization";
import {
  type DestinationPhotoUrlMap,
  type SearchCityGroup,
} from "@/components/public-deals/types";
import {
  buildDestinationDealsHref,
  getDestinationPhotoSrc,
  getLandmarkTitle,
} from "@/components/public-deals/filters";
import { RESULTS_PAGE_SIZE_OPTIONS } from "@/components/public-deals/constants";
import {
  formatArrivalDayOffsetLabel,
  formatCurrency,
  formatDateWithWeekday,
  formatDateWithoutWeekday,
  formatDepartureMonth,
  formatDestinationStay,
  formatFlightClock,
  formatFlightDuration,
  formatFlightTime,
  formatItineraryStops,
  formatLegDate,
  formatLegStops,
  formatLocalizedStayBucket,
  formatSearchSavingsLabel,
  formatStayHours,
  formatUsualPriceExplanation,
  formatVerifiedAge,
  getArrivalDayOffset,
  getDisplayAirlineSummary,
  getFareBadgeLabel,
  getPrimaryAirlineName,
  getPublicAirlineLine,
  getPublicTripStyle,
  isStrongPriceDeal,
} from "@/components/public-deals/formatters";
import { AirlineLogo } from "@/components/public-deals/airlines";
import {
  HeroPlaneIcon,
  OpportunityCalendarIcon,
  OpportunityShieldIcon,
} from "@/components/public-deals/icons";
import { DealShareButton } from "@/components/public-deals/share-button";

export function PublicDealCard({
  deal,
  combinationsCount,
  compact = false,
  destinationPhotoUrls,
}: {
  deal: CampaignPreviewDeal;
  combinationsCount: number;
  compact?: boolean;
  destinationPhotoUrls?: DestinationPhotoUrlMap;
}) {
  const { locale, t } = useI18n();
  const destinationName = getLocalizedDestinationName(
    deal.destinationCity,
    locale,
  );
  const holidayMatch = getMatchingLuxSchoolHoliday(
    deal.departureDate,
    deal.returnDate,
  );
  const savingsLabel = formatSearchSavingsLabel(deal, t);
  const travelMeta = [
    formatItineraryStops(deal, t),
    `${deal.tripNights} ${deal.tripNights === 1 ? t("deals.night") : t("deals.nights")}`,
    formatDepartureMonth(deal.departureDate, locale, t).toLowerCase(),
  ].join(" · ");
  const moreDealsCount = Math.max(0, combinationsCount - 1);
  const ctaLabel =
    moreDealsCount > 0
      ? t("deals.card.seeDealAndMore", { count: moreDealsCount })
      : t("deals.card.seeDeal");

  return (
    <article className={`deals-card${compact ? " deals-card--compact" : ""}`}>
      <figure className="deals-card__media">
        <LandmarkPhoto
          alt={t("deals.a11y.destinationLandmark", {
            destination: destinationName,
          })}
          destinationCity={deal.destinationCity}
          landmarkTitle={getLandmarkTitle(deal)}
          photoSrc={getDestinationPhotoSrc(
            destinationPhotoUrls,
            deal.destinationCity,
          )}
        />
        <div className="deals-card__media-overlay" />
      </figure>

      <div className="deals-card__body">
        <div className="deals-card__eyebrow">
          <p>{getPublicTripStyle(deal, t)}</p>
          <strong>
            {t("common.from").toLowerCase()} {formatCurrency(deal.dealPrice)}
          </strong>
        </div>

        <div className="deals-card__title">
          <h3>{destinationName}</h3>
          <p>{travelMeta}</p>
        </div>

        {holidayMatch ? (
          <p className="deals-card__holiday">
            {t("deals.matches")}{" "}
            {getLocalizedLuxSchoolHolidayLabel(
              holidayMatch,
              locale,
            ).toLowerCase()}
          </p>
        ) : null}

        <div className="deals-card__meta-line">
          <span>{getPublicAirlineLine(deal, t)}</span>
          <span>{formatItineraryStops(deal, t)}</span>
        </div>

        <div className="deals-card__reason">
          <strong>{savingsLabel}</strong>
          <span>{formatVerifiedAge(deal.verifiedAt, t)}</span>
        </div>

        <div className="deals-card__detail-strip">
          <span>
            {formatDateWithWeekday(deal.departureDate, locale)}{" "}
            {t("common.to").toLowerCase()}{" "}
            {formatDateWithWeekday(deal.returnDate, locale)}
          </span>
          <span>
            {formatDestinationStay(
              deal.destinationStayHours,
              deal.tripNights,
              t,
            )}
          </span>
        </div>

        <div className="deals-card__actions">
          <span className="deals-card__matches">
            {t("deals.card.goodCombinations", {
              count: combinationsCount,
              noun:
                combinationsCount === 1
                  ? t("deals.card.combination")
                  : t("deals.card.combinations"),
            })}
          </span>
          {deal.bookingUrl ? (
            <a
              className="deals-card__cta"
              href={deal.bookingUrl}
              rel="noreferrer"
              target="_blank"
            >
              {t("deals.card.view")} ↗
            </a>
          ) : (
            <span className="deals-card__cta deals-card__cta--ghost">
              {t("deals.card.pending")}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

export function FeaturedOpportunityCard({
  deal,
  combinationsCount,
  destinationPhotoUrls,
  onOpen,
  variant = "default",
}: {
  deal: CampaignPreviewDeal;
  combinationsCount: number;
  destinationPhotoUrls?: DestinationPhotoUrlMap;
  onOpen: () => void;
  variant?: "default" | "hero";
}) {
  const { locale, t } = useI18n();
  const destinationName = getLocalizedDestinationName(
    deal.destinationCity,
    locale,
  );
  const savingsLabel = formatSearchSavingsLabel(deal, t);
  const savingsBadgeLabel = getFareBadgeLabel(deal, t);
  const travelMeta = [
    formatItineraryStops(deal, t),
    `${deal.tripNights} ${deal.tripNights === 1 ? t("deals.night") : t("deals.nights")}`,
    formatDepartureMonth(deal.departureDate, locale, t).toLowerCase(),
  ].join(" · ");
  const moreDealsCount = Math.max(0, combinationsCount - 1);
  const ctaLabel =
    moreDealsCount > 0
      ? t("deals.card.seeMore", {
          count: moreDealsCount,
          noun: moreDealsCount === 1 ? t("deals.fare") : t("deals.fares"),
        })
      : t("deals.card.seeFare");
  const tripSnapshot = `${formatDateWithWeekday(deal.departureDate, locale)} · ${formatDestinationStay(deal.destinationStayHours, deal.tripNights, t)}`;
  const verifiedLabel = formatVerifiedAge(deal.verifiedAt, t);

  if (variant === "hero") {
    return (
      <button
        aria-label={t("deals.a11y.openDestinationDetails", {
          destination: destinationName,
        })}
        aria-haspopup="dialog"
        className="deals-opportunity-card deals-opportunity-card--hero"
        onClick={onOpen}
        type="button"
      >
        <figure className="deals-opportunity-card__media">
          <LandmarkPhoto
            alt={t("deals.a11y.destinationLandmark", {
              destination: destinationName,
            })}
            destinationCity={deal.destinationCity}
            landmarkTitle={getLandmarkTitle(deal)}
            photoSrc={getDestinationPhotoSrc(
              destinationPhotoUrls,
              deal.destinationCity,
            )}
          />
          <div className="deals-opportunity-card__hero-overlay" />
        </figure>

        <div className="deals-opportunity-card__hero-copy">
          <div className="deals-opportunity-card__hero-main">
            <span className="deals-opportunity-card__hero-kicker">
              {t("deals.results.defaultTitle")}
            </span>
            <strong className="deals-opportunity-card__hero-city">
              {destinationName.toUpperCase()}
            </strong>
            <p className="deals-opportunity-card__hero-price">
              <small>{t("common.from")}</small> {formatCurrency(deal.dealPrice)}
            </p>
            <strong className="deals-opportunity-card__hero-savings">
              {savingsLabel}
            </strong>
            <div
              className="deals-opportunity-card__hero-detail-list"
              aria-label={t("deals.a11y.dealSummary")}
            >
              <span className="deals-opportunity-card__hero-detail">
                <i aria-hidden="true">
                  <OpportunityCalendarIcon />
                </i>
                <span>{tripSnapshot}</span>
              </span>
              <span className="deals-opportunity-card__hero-detail">
                <i aria-hidden="true">
                  <HeroPlaneIcon />
                </i>
                <span>{travelMeta}</span>
              </span>
              <span className="deals-opportunity-card__hero-detail">
                <i aria-hidden="true">
                  <OpportunityShieldIcon />
                </i>
                <span>{verifiedLabel}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="deals-opportunity-card__hero-cta-wrap">
          <div className="deals-opportunity-card__footer">
            <span>{ctaLabel}</span>
            <span aria-hidden="true" className="deals-opportunity-card__view">
              →
            </span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      aria-label={t("deals.a11y.openDestinationDetails", {
        destination: destinationName,
      })}
      aria-haspopup="dialog"
      className="deals-opportunity-card"
      onClick={onOpen}
      type="button"
    >
      <figure className="deals-opportunity-card__media">
        <LandmarkPhoto
          alt={t("deals.a11y.destinationLandmark", {
            destination: destinationName,
          })}
          destinationCity={deal.destinationCity}
          landmarkTitle={getLandmarkTitle(deal)}
          photoSrc={getDestinationPhotoSrc(
            destinationPhotoUrls,
            deal.destinationCity,
          )}
        />
        <div className="deals-card__media-overlay" />
        {savingsBadgeLabel ? (
          <span className="deals-opportunity-card__badge">
            {savingsBadgeLabel}
          </span>
        ) : null}
      </figure>

      <div className="deals-opportunity-card__body">
        <div className="deals-opportunity-card__title-row">
          <strong>{destinationName}</strong>
          <span>
            {t("common.from").toLowerCase()} {formatCurrency(deal.dealPrice)}
          </span>
        </div>

        <p className="deals-opportunity-card__meta">{travelMeta}</p>
        <div className="deals-opportunity-card__footer">
          <span>{ctaLabel}</span>
          <span aria-hidden="true" className="deals-opportunity-card__view">
            →
          </span>
        </div>
      </div>
    </button>
  );
}

export function SearchCityGroupCard({
  group,
  destinationPhotoUrls,
  onToggle,
}: {
  group: SearchCityGroup;
  destinationPhotoUrls?: DestinationPhotoUrlMap;
  onToggle: () => void;
}) {
  const { locale, t } = useI18n();
  const heroDeal = group.deals[0];
  const destinationName = getLocalizedDestinationName(group.city, locale);

  return (
    <section className="deals-search-group">
      <button
        className="deals-search-group__header"
        onClick={onToggle}
        type="button"
      >
        <figure className="deals-search-group__media" aria-hidden="true">
          <LandmarkPhoto
            alt={t("deals.a11y.destinationLandmark", {
              destination: destinationName,
            })}
            destinationCity={group.city}
            landmarkTitle={getLandmarkTitle(heroDeal)}
            photoSrc={getDestinationPhotoSrc(destinationPhotoUrls, group.city)}
          />
          <div className="deals-search-group__media-overlay" />
        </figure>
        <div className="deals-search-group__header-content">
          <div className="deals-search-group__header-copy">
            <strong>{destinationName}</strong>
            <span>
              {group.deals.length}{" "}
              {group.deals.length === 1 ? t("deals.fare") : t("deals.fares")} ·{" "}
              {t("common.from").toLowerCase()}{" "}
              {formatCurrency(group.lowestPrice)}
            </span>
          </div>
          <span className="deals-search-group__header-meta">
            <em>{t("deals.showDeals")}</em>
            <i aria-hidden="true">+</i>
          </span>
        </div>
      </button>
    </section>
  );
}

export function DealFlightCard({
  deal,
  combinationsCount,
  className,
  showCityLabel = true,
  showBooking = true,
  showFacts = true,
  ctaHref = deal.bookingUrl,
  ctaLabel,
  ctaExternal = true,
  pendingLabel = "Skyscanner link pending",
  showArrivalDate = false,
  showWeekdayInDate = true,
  shiftDurationLeft = false,
  showAirlineLogo = false,
  showMobileAirlineName = false,
  showMobileCityLabel = false,
  layout = "default",
}: {
  deal: CampaignPreviewDeal;
  combinationsCount: number;
  className?: string;
  showCityLabel?: boolean;
  showBooking?: boolean;
  showFacts?: boolean;
  ctaHref?: string | null;
  ctaLabel?: string;
  ctaExternal?: boolean;
  pendingLabel?: string;
  showArrivalDate?: boolean;
  showWeekdayInDate?: boolean;
  shiftDurationLeft?: boolean;
  showAirlineLogo?: boolean;
  showMobileAirlineName?: boolean;
  showMobileCityLabel?: boolean;
  layout?: "default" | "route";
}) {
  const { locale, t } = useI18n();
  const destinationName = getLocalizedDestinationName(
    deal.destinationCity,
    locale,
  );
  const usualTooltipId = useId();
  const savingsLabel = formatSearchSavingsLabel(deal, t);
  const usualPriceExplanation = formatUsualPriceExplanation(deal, locale, t);
  const outboundDuration = formatFlightDuration(
    deal.outboundDepartureAt,
    deal.outboundArrivalAt,
    "LUX",
    deal.destinationAirport,
  );
  const returnDuration = formatFlightDuration(
    deal.returnDepartureAt,
    deal.returnArrivalAt,
    deal.destinationAirport,
    "LUX",
  );
  const outboundArrivalDayOffset = getArrivalDayOffset(
    deal.outboundDepartureAt,
    deal.outboundArrivalAt,
  );
  const returnArrivalDayOffset = getArrivalDayOffset(
    deal.returnDepartureAt,
    deal.returnArrivalAt,
  );
  const holidayMatch = getMatchingLuxSchoolHoliday(
    deal.departureDate,
    deal.returnDate,
  );
  const airlineName = getPrimaryAirlineName(deal);
  const outboundStopsLabel = formatLegStops(
    deal.outboundStopCount,
    deal.maxStops,
    t,
  );
  const returnStopsLabel = formatLegStops(
    deal.returnStopCount,
    deal.maxStops,
    t,
  );
  const resolvedCtaLabel = ctaLabel ?? t("deals.viewFlights");
  const resolvedPendingLabel =
    pendingLabel === "Skyscanner link pending"
      ? t("deals.skyscannerPending")
      : pendingLabel;
  const strongPrice = isStrongPriceDeal(deal);
  const routeLayout = layout === "route";
  const hasTicketSavings =
    routeLayout &&
    deal.pricePosition !== "new_price" &&
    deal.baselinePrice !== null &&
    Number.isFinite(deal.baselinePrice) &&
    deal.baselinePrice > deal.dealPrice &&
    deal.dealPrice > 0;
  const savedAmount = hasTicketSavings
    ? deal.baselinePrice! - deal.dealPrice
    : 0;
  const savedPercent = hasTicketSavings
    ? Math.round((savedAmount / deal.baselinePrice!) * 100)
    : 0;
  const cardClassName = `${className ?? "deals-search-card"}${strongPrice ? " deals-search-card--strong-price" : ""}${routeLayout ? " deals-search-card--route-layout deals-search-card--ticket" : ""}${hasTicketSavings ? " deals-search-card--ticket-savings" : ""}`;
  const destinationHref = buildDestinationDealsHref(
    deal.destinationCity,
    locale,
  );

  return (
    <article className={cardClassName}>
      {showBooking ? (
        <DealShareButton
          className="deals-share-button--card-corner"
          deal={deal}
        />
      ) : null}
      <div className="deals-search-card__content">
        {routeLayout ? (
          <div className="deals-ticket__airline">
            <AirlineLogo
              airlineName={airlineName}
              primaryAirlineCode={deal.primaryAirlineCode}
            />
            <div>
              {showCityLabel || showMobileCityLabel ? (
                <Link
                  className="deals-ticket__destination"
                  href={destinationHref}
                >
                  {destinationName}
                </Link>
              ) : (
                <strong>{airlineName}</strong>
              )}
            </div>
          </div>
        ) : showCityLabel || showMobileCityLabel || showAirlineLogo ? (
          <div
            className={`deals-search-card__meta-bar${showCityLabel ? "" : " deals-search-card__meta-bar--mobile-only"}`}
          >
            {showCityLabel || showMobileCityLabel ? (
              <Link
                className={`deals-search-card__city-link${showCityLabel ? "" : " deals-search-card__city-link--mobile-only"}`}
                href={destinationHref}
              >
                {destinationName}
              </Link>
            ) : null}
            {showAirlineLogo ? (
              <div
                aria-hidden={showMobileAirlineName || undefined}
                className="deals-search-card__mobile-airline-logo"
              >
                <AirlineLogo
                  airlineName={airlineName}
                  primaryAirlineCode={deal.primaryAirlineCode}
                />
              </div>
            ) : null}
            {showMobileAirlineName ? (
              <span
                className="deals-search-card__mobile-airline-name"
                title={airlineName}
              >
                {airlineName}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="deals-search-card__segments">
          <div className="deals-search-card__segment">
            <div className="deals-search-card__airline">
              {showAirlineLogo ? (
                <AirlineLogo
                  airlineName={airlineName}
                  primaryAirlineCode={deal.primaryAirlineCode}
                />
              ) : (
                <span>{getDisplayAirlineSummary(deal, t)}</span>
              )}
              {!routeLayout ? <small>{t("deals.outbound")}</small> : null}
            </div>
            {routeLayout ? (
              <Plane
                aria-hidden="true"
                className="deals-search-card__direction-icon deals-search-card__direction-icon--outbound"
                size={38}
                strokeWidth={2.2}
              />
            ) : null}

            <div className="deals-search-card__journey">
              {routeLayout ? (
                <div className="deals-search-card__leg-heading">
                  <strong>{t("deals.outbound")}</strong>
                  <time dateTime={deal.departureDate ?? undefined}>
                    {formatLegDate(deal.departureDate, locale)}
                  </time>
                </div>
              ) : null}
              <div className="deals-search-card__timeline">
                <div className="deals-search-card__timepoint deals-search-card__timepoint--departure">
                  {!routeLayout ? (
                    <small className="deals-search-card__timepoint-date">
                      {showWeekdayInDate
                        ? formatDateWithWeekday(deal.departureDate, locale)
                        : formatDateWithoutWeekday(deal.departureDate, locale)}
                    </small>
                  ) : null}
                  <strong>
                    {(routeLayout
                      ? formatFlightTime(deal.outboundDepartureAt)
                      : formatFlightClock(deal.outboundDepartureAt)) ??
                      t("deals.timeNA")}
                  </strong>
                  <span>LUX</span>
                </div>
                <div
                  className={`deals-search-card__duration${shiftDurationLeft ? " deals-search-card__duration--shifted" : ""}`}
                >
                  <span>
                    {outboundDuration ??
                      `${deal.tripNights} ${t("deals.nights")}`}
                  </span>
                  {routeLayout ? (
                    <time
                      className="deals-search-card__mobile-date"
                      dateTime={deal.departureDate ?? undefined}
                    >
                      {formatLegDate(deal.departureDate, locale)}
                    </time>
                  ) : null}
                  <strong>{outboundStopsLabel}</strong>
                </div>
                <div
                  className="deals-search-card__timepoint deals-search-card__timepoint--arrival"
                  title={
                    routeLayout && showArrivalDate
                      ? formatLegDate(deal.outboundArrivalAt, locale)
                      : undefined
                  }
                >
                  {!routeLayout && showArrivalDate ? (
                    <small className="deals-search-card__timepoint-date">
                      {showWeekdayInDate
                        ? formatDateWithWeekday(deal.outboundArrivalAt, locale)
                        : formatDateWithoutWeekday(
                            deal.outboundArrivalAt,
                            locale,
                          )}
                    </small>
                  ) : null}
                  <strong>
                    {(routeLayout
                      ? formatFlightTime(deal.outboundArrivalAt)
                      : formatFlightClock(deal.outboundArrivalAt)) ??
                      t("deals.timeNA")}
                    {outboundArrivalDayOffset > 0 ? (
                      <small
                        aria-label={formatArrivalDayOffsetLabel(
                          outboundArrivalDayOffset,
                          locale,
                        )}
                        className="deals-search-card__arrival-day-offset"
                        title={formatArrivalDayOffsetLabel(
                          outboundArrivalDayOffset,
                          locale,
                        )}
                      >
                        +{outboundArrivalDayOffset}
                      </small>
                    ) : null}
                  </strong>
                  <span>{deal.destinationAirport}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="deals-search-card__segment">
            <div className="deals-search-card__airline">
              {showAirlineLogo ? (
                <AirlineLogo
                  airlineName={airlineName}
                  primaryAirlineCode={deal.primaryAirlineCode}
                />
              ) : (
                <span>{getDisplayAirlineSummary(deal, t)}</span>
              )}
              {!routeLayout ? <small>{t("deals.return")}</small> : null}
            </div>
            {routeLayout ? (
              <Plane
                aria-hidden="true"
                className="deals-search-card__direction-icon deals-search-card__direction-icon--return"
                size={38}
                strokeWidth={2.2}
              />
            ) : null}

            <div className="deals-search-card__journey">
              {routeLayout ? (
                <div className="deals-search-card__leg-heading">
                  <strong>{t("deals.return")}</strong>
                  <time dateTime={deal.returnDate ?? undefined}>
                    {formatLegDate(deal.returnDate, locale)}
                  </time>
                </div>
              ) : null}
              <div className="deals-search-card__timeline">
                <div className="deals-search-card__timepoint deals-search-card__timepoint--departure">
                  {!routeLayout ? (
                    <small className="deals-search-card__timepoint-date">
                      {showWeekdayInDate
                        ? formatDateWithWeekday(deal.returnDate, locale)
                        : formatDateWithoutWeekday(deal.returnDate, locale)}
                    </small>
                  ) : null}
                  <strong>
                    {(routeLayout
                      ? formatFlightTime(deal.returnDepartureAt)
                      : formatFlightClock(deal.returnDepartureAt)) ??
                      t("deals.timeNA")}
                  </strong>
                  <span>{deal.destinationAirport}</span>
                </div>
                <div
                  className={`deals-search-card__duration${shiftDurationLeft ? " deals-search-card__duration--shifted" : ""}`}
                >
                  <span>
                    {returnDuration ??
                      formatStayHours(
                        deal.destinationStayHours,
                        deal.tripNights,
                        t,
                      )}
                  </span>
                  {routeLayout ? (
                    <time
                      className="deals-search-card__mobile-date"
                      dateTime={deal.returnDate ?? undefined}
                    >
                      {formatLegDate(deal.returnDate, locale)}
                    </time>
                  ) : null}
                  <strong>{returnStopsLabel}</strong>
                </div>
                <div
                  className="deals-search-card__timepoint deals-search-card__timepoint--arrival"
                  title={
                    routeLayout && showArrivalDate
                      ? formatLegDate(deal.returnArrivalAt, locale)
                      : undefined
                  }
                >
                  {!routeLayout && showArrivalDate ? (
                    <small className="deals-search-card__timepoint-date">
                      {showWeekdayInDate
                        ? formatDateWithWeekday(deal.returnArrivalAt, locale)
                        : formatDateWithoutWeekday(
                            deal.returnArrivalAt,
                            locale,
                          )}
                    </small>
                  ) : null}
                  <strong>
                    {(routeLayout
                      ? formatFlightTime(deal.returnArrivalAt)
                      : formatFlightClock(deal.returnArrivalAt)) ??
                      t("deals.timeNA")}
                    {returnArrivalDayOffset > 0 ? (
                      <small
                        aria-label={formatArrivalDayOffsetLabel(
                          returnArrivalDayOffset,
                          locale,
                        )}
                        className="deals-search-card__arrival-day-offset"
                        title={formatArrivalDayOffsetLabel(
                          returnArrivalDayOffset,
                          locale,
                        )}
                      >
                        +{returnArrivalDayOffset}
                      </small>
                    ) : null}
                  </strong>
                  <span>LUX</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {showFacts ? (
          <div className="deals-search-card__facts">
            <span className="deals-search-card__fact deals-search-card__fact--stay">
              {formatDestinationStay(
                deal.destinationStayHours,
                deal.tripNights,
                t,
              )}
            </span>
            <span className="deals-search-card__fact deals-search-card__fact--bucket">
              {formatLocalizedStayBucket(deal.routeBucket, t)}
            </span>
            <span className="deals-search-card__fact deals-search-card__fact--verified">
              {formatVerifiedAge(deal.verifiedAt, t)}
            </span>
            {holidayMatch ? (
              <span className="deals-search-card__fact deals-search-card__fact--holiday">
                {t("deals.matches")}{" "}
                {getLocalizedLuxSchoolHolidayLabel(holidayMatch, locale)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {showBooking ? (
        <aside className="deals-search-card__booking">
          {hasTicketSavings ? (
            <>
              <div className="deals-ticket__badge">
                <Sparkle aria-hidden="true" size={20} fill="currentColor" />
                <span>
                  {t(
                    strongPrice
                      ? "deals.ticket.greatDeal"
                      : "deals.ticket.goodDeal",
                  )}
                </span>
              </div>
              <div
                className="deals-ticket__usual-price"
                title={usualPriceExplanation ?? undefined}
              >
                <s aria-label={usualPriceExplanation ?? undefined}>
                  {formatCurrency(deal.baselinePrice!)}
                </s>
                <ArrowDown aria-hidden="true" size={24} strokeWidth={3} />
              </div>
            </>
          ) : null}
          <strong className="deals-search-card__price">
            {formatCurrency(deal.dealPrice)}
          </strong>
          <div className="deals-search-card__saving-row">
            <p
              className={`deals-search-card__saving${strongPrice ? " is-positive" : " is-neutral"}`}
            >
              {hasTicketSavings ? (
                <>
                  <strong>
                    {t("deals.ticket.save", {
                      amount: formatCurrency(savedAmount),
                    })}
                  </strong>
                  {" · "}
                  {t("deals.ticket.less", { pct: savedPercent })}
                </>
              ) : (
                savingsLabel
              )}
            </p>
            <div className="deals-search-card__secondary-actions">
              {usualPriceExplanation ? (
                <span className="deals-search-card__usual-tooltip">
                  <button
                    aria-describedby={usualTooltipId}
                    aria-label={usualPriceExplanation}
                    className="deals-search-card__usual-tooltip-trigger"
                    type="button"
                  >
                    <Info aria-hidden="true" size={15} strokeWidth={2} />
                  </button>
                  <span
                    className="deals-search-card__usual-tooltip-bubble"
                    id={usualTooltipId}
                    role="tooltip"
                  >
                    {usualPriceExplanation}
                  </span>
                </span>
              ) : null}
            </div>
          </div>
          <div className="deals-search-card__booking-actions">
            {ctaHref ? (
              ctaExternal ? (
                <a
                  className="deals-search-card__cta"
                  href={ctaHref}
                  rel="noreferrer"
                  target="_blank"
                >
                  {resolvedCtaLabel}
                </a>
              ) : (
                <Link className="deals-search-card__cta" href={ctaHref}>
                  {resolvedCtaLabel}
                </Link>
              )
            ) : (
              <span className="deals-search-card__pending">
                {resolvedPendingLabel}
              </span>
            )}
          </div>
        </aside>
      ) : null}
    </article>
  );
}

export function SearchResultCard({
  deal,
  combinationsCount,
  showCityLabel = false,
  showMobileAirlineName = false,
  showMobileCityLabel = true,
}: {
  deal: CampaignPreviewDeal;
  combinationsCount: number;
  showCityLabel?: boolean;
  showMobileAirlineName?: boolean;
  showMobileCityLabel?: boolean;
}) {
  return (
    <DealFlightCard
      combinationsCount={combinationsCount}
      deal={deal}
      shiftDurationLeft
      showCityLabel={showCityLabel}
      showAirlineLogo
      showArrivalDate
      showMobileAirlineName={showMobileAirlineName}
      showMobileCityLabel={showMobileCityLabel}
      showWeekdayInDate={false}
      layout="route"
    />
  );
}

export function ResultsLoadMore({
  total,
  visibleCount,
  pageSize,
  onLoadMore,
  onPageSizeChange,
}: {
  total: number;
  visibleCount: number;
  pageSize: number;
  onLoadMore: () => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const { t } = useI18n();

  if (total <= 0) {
    return null;
  }

  const end = Math.min(total, visibleCount);
  const hasMore = end < total;
  const pageSizeOptions = RESULTS_PAGE_SIZE_OPTIONS.filter(
    (option, index) => index === 0 || option <= total,
  );

  return (
    <div
      className="deals-results-pagination"
      aria-label={t("deals.a11y.fareResults")}
    >
      <p>{t("deals.pagination.showing", { end, total })}</p>
      <div className="deals-results-pagination__settings">
        <DealsSelect
          className="deals-results-pagination__page-size"
          label={t("deals.pagination.show")}
          onChange={(value) => onPageSizeChange(Number(value))}
          options={pageSizeOptions.map((option) => ({
            label: String(option),
            value: String(option),
          }))}
          value={String(pageSize)}
        />
        {hasMore ? (
          <button
            className="deals-results-pagination__load-more"
            onClick={onLoadMore}
            type="button"
          >
            {t("deals.pagination.showMore")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
