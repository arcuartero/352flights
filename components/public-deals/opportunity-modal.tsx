"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { DestinationVisual as LandmarkPhoto } from "@/components/public-destination-visual";
import { useI18n } from "@/lib/i18n";
import type { CampaignPreviewDeal } from "@/lib/ops-shared";
import { getLocalizedDestinationName } from "@/lib/destination-localization";
import { type DestinationPhotoUrlMap } from "@/components/public-deals/types";
import {
  buildDestinationDealsHref,
  getDestinationPhotoSrc,
  getLandmarkTitle,
} from "@/components/public-deals/filters";
import {
  formatCurrency,
  formatDropLine,
  formatItineraryStops,
  formatLocalizedStayBucket,
  formatStayHours,
  getDisplayAirlineSummary,
} from "@/components/public-deals/formatters";
import { DealShareButton } from "@/components/public-deals/share-button";
import { DealFlightCard } from "@/components/public-deals/fare-cards";

export function FeaturedOpportunityModal({
  deal,
  combinationsCount,
  destinationPhotoUrls,
  onClose,
  onPrevious,
  onNext,
  canGoPrevious,
  canGoNext,
}: {
  deal: CampaignPreviewDeal;
  combinationsCount: number;
  destinationPhotoUrls?: DestinationPhotoUrlMap;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
}) {
  const { locale, t } = useI18n();
  const destinationName = getLocalizedDestinationName(
    deal.destinationCity,
    locale,
  );
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key === "ArrowLeft" && canGoPrevious) {
        onPrevious();
        return;
      }

      if (event.key === "ArrowRight" && canGoNext) {
        onNext();
        return;
      }

      if (event.key === "Tab") {
        const panel =
          closeButtonRef.current?.closest<HTMLElement>("[role='dialog']");
        const focusable = panel
          ? Array.from(
              panel.querySelectorAll<HTMLElement>(
                "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])",
              ),
            )
          : [];
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [canGoNext, canGoPrevious, onClose, onNext, onPrevious]);

  const otherOffersCount = Math.max(0, combinationsCount - 1);
  const destinationHref = buildDestinationDealsHref(
    deal.destinationCity,
    locale,
  );
  const modalCtaLabel =
    otherOffersCount > 0
      ? t("deals.modal.exploreMore", {
          count: otherOffersCount,
          destination: destinationName,
          noun: otherOffersCount === 1 ? t("deals.fare") : t("deals.fares"),
        })
      : t("deals.modal.viewOnSkyscanner");
  const savingsLabel = formatDropLine(deal, t);

  return createPortal(
    <div
      aria-hidden={false}
      className="deals-opportunity-modal"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <button
        aria-label={t("deals.a11y.previousOpportunity")}
        className="deals-opportunity-modal__side-button deals-opportunity-modal__side-button--prev"
        disabled={!canGoPrevious}
        onClick={onPrevious}
        type="button"
      >
        ←
      </button>

      <section
        aria-labelledby="deals-opportunity-dialog-title"
        aria-modal="true"
        className="deals-opportunity-modal__panel"
        role="dialog"
      >
        <button
          aria-label={t("deals.a11y.closeOpportunity")}
          className="deals-opportunity-modal__close"
          onClick={onClose}
          ref={closeButtonRef}
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>

        <figure className="deals-opportunity-modal__media">
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

        <div className="deals-opportunity-modal__body">
          <div className="deals-opportunity-modal__header">
            <div>
              <strong className="deals-opportunity-modal__price-headline">
                {destinationName} <small>{t("common.from")}</small>{" "}
                {formatCurrency(deal.dealPrice)}
              </strong>
              <p className="deals-opportunity-modal__lead">{savingsLabel}</p>
            </div>
          </div>

          <DealFlightCard
            className="deals-search-card deals-search-card--modal"
            combinationsCount={combinationsCount}
            deal={deal}
            showBooking={false}
            showCityLabel={false}
            showFacts={false}
          />

          <dl className="deals-opportunity-modal__facts">
            <div>
              <dt>{t("common.tripType")}</dt>
              <dd>{formatLocalizedStayBucket(deal.routeBucket, t)}</dd>
            </div>
            <div>
              <dt>
                {t("deals.modal.timeIn", { destination: destinationName })}
              </dt>
              <dd>
                {formatStayHours(deal.destinationStayHours, deal.tripNights, t)}
              </dd>
            </div>
            <div>
              <dt>{t("deals.modal.routing")}</dt>
              <dd>{formatItineraryStops(deal, t)}</dd>
            </div>
            <div>
              <dt>{t("deals.modal.airline")}</dt>
              <dd>{getDisplayAirlineSummary(deal, t)}</dd>
            </div>
          </dl>

          <div className="deals-opportunity-modal__footer">
            <DealShareButton deal={deal} />
            {otherOffersCount > 0 || !deal.bookingUrl ? (
              <Link
                className="deals-opportunity-modal__footer-link"
                href={destinationHref}
              >
                {modalCtaLabel}
              </Link>
            ) : (
              <a
                className="deals-opportunity-modal__footer-link"
                href={deal.bookingUrl}
                rel="noreferrer"
                target="_blank"
              >
                {modalCtaLabel}
              </a>
            )}
          </div>
        </div>
      </section>

      <button
        aria-label={t("deals.a11y.nextOpportunity")}
        className="deals-opportunity-modal__side-button deals-opportunity-modal__side-button--next"
        disabled={!canGoNext}
        onClick={onNext}
        type="button"
      >
        →
      </button>
    </div>,
    document.body,
  );
}
