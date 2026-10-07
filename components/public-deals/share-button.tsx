"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Share } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { CampaignPreviewDeal } from "@/lib/ops-shared";
import { getLocalizedDestinationName } from "@/lib/destination-localization";
import { buildSharedFareHref } from "@/components/public-deals/filters";
import { formatCurrency } from "@/components/public-deals/formatters";

export async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Unable to copy share link");
  }
}

export function DealShareButton({
  className = "",
  deal,
}: {
  className?: string;
  deal: CampaignPreviewDeal;
}) {
  const { locale, t } = useI18n();
  const destinationName = getLocalizedDestinationName(
    deal.destinationCity,
    locale,
  );
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    },
    [],
  );

  const handleShare = async () => {
    const url = new URL(
      buildSharedFareHref(deal, locale),
      window.location.origin,
    ).toString();
    const shareData = {
      title: t("deals.share.title", { city: destinationName }),
      text: t("deals.share.text", {
        city: destinationName,
        price: formatCurrency(deal.dealPrice),
      }),
      url,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }

      await copyTextToClipboard(url);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      try {
        await copyTextToClipboard(url);
      } catch {
        return;
      }
    }

    setCopied(true);
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = window.setTimeout(() => setCopied(false), 2400);
  };

  return (
    <button
      aria-label={copied ? t("deals.share.copied") : t("deals.share.action")}
      className={`deals-share-button${className ? ` ${className}` : ""}`}
      data-copied={copied ? "true" : "false"}
      onClick={(event) => {
        event.stopPropagation();
        void handleShare();
      }}
      type="button"
    >
      {copied ? (
        <Check aria-hidden="true" size={18} strokeWidth={2.2} />
      ) : (
        <Share aria-hidden="true" size={21} strokeWidth={2.15} />
      )}
      <span aria-live="polite">
        {copied ? t("deals.share.copied") : t("deals.share.action")}
      </span>
    </button>
  );
}
