"use client";

import { useState } from "react";
import { Plane } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  type AirlineFilterOption,
  type Translate,
} from "@/components/public-deals/types";
import { getAirlineLogoCode } from "@/components/public-deals/formatters";

export function AirlineLogo({
  airlineName,
  primaryAirlineCode,
}: {
  airlineName: string;
  primaryAirlineCode: string | null;
}) {
  const { t } = useI18n();
  const logoCode = getAirlineLogoCode(airlineName, primaryAirlineCode);
  const [failedLogoCode, setFailedLogoCode] = useState<string | null>(null);
  const canShowAirlineLogo = logoCode !== null && failedLogoCode !== logoCode;

  return (
    <span className="deals-airline-logo" title={airlineName}>
      {canShowAirlineLogo ? (
        <img
          alt={t("deals.a11y.airlineLogo", { airline: airlineName })}
          loading="lazy"
          onError={() => setFailedLogoCode(logoCode)}
          referrerPolicy="no-referrer"
          src={`https://images.kiwi.com/airlines/64x64/${logoCode}.png`}
        />
      ) : (
        <span
          aria-label={t("deals.a11y.airlineLogo", { airline: airlineName })}
          className="deals-airline-logo__fallback"
          role="img"
        >
          <Plane aria-hidden="true" size={24} strokeWidth={2.15} />
        </span>
      )}
    </span>
  );
}

export function DealsAirlineFilter({
  excludedAirlines,
  onChange,
  options,
  t,
}: {
  excludedAirlines: string[];
  onChange: (excludedAirlines: string[]) => void;
  options: AirlineFilterOption[];
  t: Translate;
}) {
  if (options.length === 0) {
    return null;
  }

  return (
    <fieldset className="deals-airline-filter">
      <legend>{t("deals.airlines")}</legend>
      <div className="deals-airline-filter__options">
        {options.map((option) => {
          const checked = !excludedAirlines.includes(option.key);
          return (
            <label
              className={checked ? "is-selected" : undefined}
              key={option.key}
            >
              <span aria-hidden="true" className="deals-airline-filter__logo">
                <AirlineLogo
                  airlineName={option.label}
                  primaryAirlineCode={null}
                />
              </span>
              <span className="deals-airline-filter__name">{option.label}</span>
              <input
                aria-label={option.label}
                checked={checked}
                onChange={(event) => {
                  const next = event.target.checked
                    ? excludedAirlines.filter((key) => key !== option.key)
                    : [...new Set([...excludedAirlines, option.key])];
                  onChange(next);
                }}
                type="checkbox"
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
