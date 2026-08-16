"use client";

import type { CSSProperties } from "react";

type PublicDealsPriceRangeProps = {
  bounds: { min: number; max: number };
  className?: string;
  showHistogram?: boolean;
  label: string;
  legacyMaximum?: number | null;
  onChange: (priceMin: number | null, priceMax: number | null) => void;
  priceMax: number | null;
  priceMin: number | null;
  showLabel?: boolean;
};

export function PublicDealsPriceRange({
  bounds,
  className = "",
  showHistogram = false,
  label,
  legacyMaximum = null,
  onChange,
  priceMax,
  priceMin,
  showLabel = true,
}: PublicDealsPriceRangeProps) {
  const minimum = Math.floor(bounds.min);
  const maximum = Math.max(minimum, Math.ceil(bounds.max));
  const selectedMin = Math.min(maximum, Math.max(minimum, priceMin ?? minimum));
  const selectedMax = Math.max(
    selectedMin,
    Math.min(maximum, priceMax ?? legacyMaximum ?? maximum),
  );
  const span = Math.max(1, maximum - minimum);
  const start = ((selectedMin - minimum) / span) * 100;
  const end = ((selectedMax - minimum) / span) * 100;

  const update = (nextMin: number, nextMax: number) => {
    onChange(nextMin <= minimum ? null : nextMin, nextMax >= maximum ? null : nextMax);
  };

  return (
    <div
      className={`deals-price-range${
        showHistogram ? " deals-price-range--histogram" : ""
      } ${className}`.trim()}
    >
      {showLabel ? <span className="deals-price-range__label">{label}</span> : null}
      {showHistogram ? (
        <span className="deals-price-range__histogram" aria-hidden="true">
          {[28, 38, 50, 42, 62, 76, 54, 68, 47, 36, 57, 72, 48, 64, 82, 58, 44, 52].map(
            (height, index) => (
              <span
                key={`${height}-${index}`}
                style={{ "--histogram-height": `${height}%` } as CSSProperties}
              />
            ),
          )}
        </span>
      ) : null}
      <div className="deals-price-range__values" aria-hidden="true">
        <strong>€{selectedMin}</strong>
        <strong>
          €{selectedMax}
          {showHistogram && selectedMax >= maximum ? "+" : ""}
        </strong>
      </div>
      <div
        className="deals-price-range__slider"
        style={{ "--range-end": `${end}%`, "--range-start": `${start}%` } as CSSProperties}
      >
        <span className="deals-price-range__track" aria-hidden="true" />
        <span className="deals-price-range__fill" aria-hidden="true" />
        <input
          aria-label={`${label} - minimum`}
          disabled={minimum === maximum}
          max={maximum}
          min={minimum}
          onChange={(event) =>
            update(Math.min(Number(event.target.value), selectedMax), selectedMax)
          }
          step="1"
          type="range"
          value={selectedMin}
        />
        <input
          aria-label={`${label} - maximum`}
          disabled={minimum === maximum}
          max={maximum}
          min={minimum}
          onChange={(event) =>
            update(selectedMin, Math.max(Number(event.target.value), selectedMin))
          }
          step="1"
          type="range"
          value={selectedMax}
        />
      </div>
    </div>
  );
}
