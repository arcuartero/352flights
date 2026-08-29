"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

const HISTOGRAM_BUCKET_COUNT = 18;
const EMPTY_PRICES: readonly number[] = [];

type PublicDealsPriceRangeProps = {
  bounds: { min: number; max: number };
  className?: string;
  deferChanges?: boolean;
  showHistogram?: boolean;
  label: string;
  legacyMaximum?: number | null;
  onChange: (priceMin: number | null, priceMax: number | null) => void;
  priceMax: number | null;
  priceMin: number | null;
  prices?: readonly number[];
  showLabel?: boolean;
};

export function PublicDealsPriceRange({
  bounds,
  className = "",
  deferChanges = false,
  showHistogram = false,
  label,
  legacyMaximum = null,
  onChange,
  priceMax,
  priceMin,
  prices = EMPTY_PRICES,
  showLabel = true,
}: PublicDealsPriceRangeProps) {
  const minimum = Math.floor(bounds.min);
  const maximum = Math.max(minimum, Math.ceil(bounds.max));
  const controlledMin = Math.min(maximum, Math.max(minimum, priceMin ?? minimum));
  const controlledMax = Math.max(
    controlledMin,
    Math.min(maximum, priceMax ?? legacyMaximum ?? maximum),
  );
  const [deferredRange, setDeferredRange] = useState({
    min: controlledMin,
    max: controlledMax,
  });
  const selectedMin = deferChanges
    ? Math.min(maximum, Math.max(minimum, deferredRange.min))
    : controlledMin;
  const selectedMax = deferChanges
    ? Math.max(selectedMin, Math.min(maximum, deferredRange.max))
    : controlledMax;
  const span = Math.max(1, maximum - minimum);
  const start = ((selectedMin - minimum) / span) * 100;
  const end = ((selectedMax - minimum) / span) * 100;
  const histogramBars = useMemo(() => {
    const counts = Array.from({ length: HISTOGRAM_BUCKET_COUNT }, () => 0);

    prices.forEach((price) => {
      if (!Number.isFinite(price) || price < minimum || price > maximum) {
        return;
      }

      const position = maximum === minimum ? 0.5 : (price - minimum) / (maximum - minimum);
      const bucketIndex = Math.min(
        HISTOGRAM_BUCKET_COUNT - 1,
        Math.max(0, Math.floor(position * HISTOGRAM_BUCKET_COUNT)),
      );
      counts[bucketIndex] += 1;
    });

    const peak = Math.max(...counts, 1);
    return counts.map((count) => ({
      count,
      height: count === 0 ? 0 : Math.max(22, Math.round((count / peak) * 100)),
    }));
  }, [maximum, minimum, prices]);

  const update = (nextMin: number, nextMax: number) => {
    onChange(nextMin <= minimum ? null : nextMin, nextMax >= maximum ? null : nextMax);
  };

  useEffect(() => {
    setDeferredRange({ min: controlledMin, max: controlledMax });
  }, [controlledMax, controlledMin]);

  const preview = (nextMin: number, nextMax: number) => {
    if (deferChanges) {
      setDeferredRange({ min: nextMin, max: nextMax });
      return;
    }

    update(nextMin, nextMax);
  };

  const commitDeferredRange = () => {
    if (deferChanges) {
      update(selectedMin, selectedMax);
    }
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
          {histogramBars.map(({ count, height }, index) => (
            <span
              data-empty={count === 0}
              key={`price-bucket-${index}`}
              style={{ "--histogram-height": `${height}%` } as CSSProperties}
            />
          ))}
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
            preview(Math.min(Number(event.target.value), selectedMax), selectedMax)
          }
          onKeyUp={commitDeferredRange}
          onPointerCancel={commitDeferredRange}
          onPointerUp={commitDeferredRange}
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
            preview(selectedMin, Math.max(Number(event.target.value), selectedMin))
          }
          onKeyUp={commitDeferredRange}
          onPointerCancel={commitDeferredRange}
          onPointerUp={commitDeferredRange}
          step="1"
          type="range"
          value={selectedMax}
        />
      </div>
    </div>
  );
}
