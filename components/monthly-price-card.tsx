"use client";

import { Info, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { MonthlyPriceAverageData, MonthlyPricePoint } from "@/lib/monthly-price-shared";
import type { TripFilter } from "@/lib/public-deals-search";

type MonthlyPriceCardProps = {
  destinationCity: string;
  destinationSlug: string;
  directOnly: boolean;
  originAirport?: string;
  tripType: TripFilter;
};

type ChartProps = {
  currency: string;
  detailed?: boolean;
  months: MonthlyPricePoint[];
  cheapestMonth: string | null;
};

const MIN_MONTHS_FOR_CHART = 3;

function formatPrice(value: number, currency: string) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMonth(value: string, format: "short" | "long" = "short") {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { month: format, timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

function buildAccessibleSummary(data: MonthlyPriceAverageData) {
  if (data.months.length === 0) {
    return "Todavía no hay meses explorados para esta ruta.";
  }

  const months = data.months
    .map((month) => {
      if (month.availability === "no_departures") {
        return `${formatMonth(month.month, "long")}: sin salidas`;
      }
      if (month.averagePrice === null) {
        return `${formatMonth(month.month, "long")}: sin tarifa registrada`;
      }
      return `${formatMonth(month.month, "long")}: ${formatPrice(month.averagePrice, data.currency)}`;
    })
    .join(", ");
  return `Cobertura mensual de ${data.originAirport} a ${data.destinationCity}. ${months}.`;
}

function MonthlyPriceChart({ currency, detailed = false, months, cheapestMonth }: ChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const width = detailed ? 760 : 260;
  const height = detailed ? 280 : 112;
  const padding = detailed
    ? { top: 34, right: 24, bottom: 48, left: 42 }
    : { top: 14, right: 8, bottom: 24, left: 8 };
  const populated = months.filter(
    (month): month is MonthlyPricePoint & { averagePrice: number } => month.averagePrice !== null,
  );
  const prices = populated.map((month) => month.averagePrice);
  const rawMin = prices.length > 0 ? Math.min(...prices) : 0;
  const rawMax = prices.length > 0 ? Math.max(...prices) : 1;
  const range = Math.max(1, rawMax - rawMin);
  const min = Math.max(0, rawMin - range * 0.16);
  const max = rawMax + range * 0.16;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const points = months.map((month, index) => ({
    ...month,
    x:
      padding.left +
      (months.length === 1 ? 0.5 : index / Math.max(1, months.length - 1)) * chartWidth,
    y:
      month.averagePrice === null
        ? null
        : padding.top + ((max - month.averagePrice) / Math.max(1, max - min)) * chartHeight,
  }));
  const segments: string[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous.y !== null && current.y !== null) {
      segments.push(`M ${previous.x} ${previous.y} L ${current.x} ${current.y}`);
    }
  }
  const activePoint = activeIndex === null ? null : points[activeIndex];

  return (
    <div className={`monthly-price-chart${detailed ? " monthly-price-chart--detailed" : ""}`}>
      <svg aria-hidden="true" viewBox={`0 0 ${width} ${height}`}>
        {detailed
          ? [0, 0.5, 1].map((ratio) => (
              <line
                className="monthly-price-chart__grid"
                key={ratio}
                x1={padding.left}
                x2={width - padding.right}
                y1={padding.top + chartHeight * ratio}
                y2={padding.top + chartHeight * ratio}
              />
            ))
          : null}
        {segments.map((segment) => (
          <path className="monthly-price-chart__line" d={segment} key={segment} />
        ))}
        {points.map((point) =>
          point.availability === "no_departures" ? (
            <g className="monthly-price-chart__no-departures" key={`no-departures-${point.month}`}>
              <line
                x1={point.x - (detailed ? 4 : 3)}
                x2={point.x + (detailed ? 4 : 3)}
                y1={padding.top + chartHeight - (detailed ? 5 : 3)}
                y2={padding.top + chartHeight - (detailed ? 5 : 3)}
              />
            </g>
          ) : null,
        )}
        {points.map((point, index) => {
          if (point.y === null || point.averagePrice === null) {
            return null;
          }
          const isCheapest = point.month === cheapestMonth;
          return (
            <g key={point.month}>
              <circle
                className={`monthly-price-chart__point${isCheapest ? " is-cheapest" : ""}`}
                cx={point.x}
                cy={point.y}
                r={detailed ? (isCheapest ? 7 : 5) : isCheapest ? 4.5 : 3.5}
              />
              {detailed ? (
                <circle
                  aria-label={`${formatMonth(point.month, "long")}: ${formatPrice(point.averagePrice, currency)}, ${point.sampleCount} tarifas`}
                  className="monthly-price-chart__hit-area"
                  cx={point.x}
                  cy={point.y}
                  onBlur={() => setActiveIndex(null)}
                  onClick={() => setActiveIndex(index)}
                  onFocus={() => setActiveIndex(index)}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                  r={14}
                  role="button"
                  tabIndex={0}
                />
              ) : null}
            </g>
          );
        })}
        {points.map((point, index) =>
          !detailed && index % 3 === 0 ? (
            <text
              className="monthly-price-chart__month"
              key={`label-${point.month}`}
              textAnchor="middle"
              x={point.x}
              y={height - (detailed ? 16 : 5)}
            >
              {formatMonth(point.month)}
            </text>
          ) : null,
        )}
      </svg>
      {detailed ? (
        <div
          aria-hidden="true"
          className="monthly-price-chart__month-labels"
          style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}
        >
          {points.map((point) => (
            <span className="monthly-price-chart__month-label" key={`detail-label-${point.month}`}>
              <span>{formatMonth(point.month)}</span>
              {point.availability === "no_departures" ? <small>Sin salidas</small> : null}
              {point.availability === "no_prices" ? <small>Sin tarifa</small> : null}
            </span>
          ))}
        </div>
      ) : null}
      {detailed && activePoint?.averagePrice !== null && activePoint?.averagePrice !== undefined ? (
        <div
          className="monthly-price-chart__tooltip"
          style={{
            left: `${(activePoint.x / width) * 100}%`,
            top: `${(activePoint.y! / height) * 100}%`,
          }}
        >
          <strong>{formatMonth(activePoint.month, "long")}</strong>
          <span>{formatPrice(activePoint.averagePrice, currency)}</span>
          <small>{activePoint.sampleCount} tarifas</small>
        </div>
      ) : null}
    </div>
  );
}

export function MonthlyPriceCard({
  destinationCity,
  destinationSlug,
  directOnly,
  originAirport = "LUX",
  tripType,
}: MonthlyPriceCardProps) {
  const [data, setData] = useState<MonthlyPriceAverageData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [isOpen, setIsOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const cardRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const requestId = useId();

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      origin: originAirport,
      destination: destinationSlug,
      direct: directOnly ? "1" : "0",
      trip: tripType,
    });
    setStatus("loading");
    setData(null);

    fetch(`/api/monthly-prices?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Monthly prices returned ${response.status}`);
        }
        return (await response.json()) as MonthlyPriceAverageData;
      })
      .then((result) => {
        setData(result);
        setStatus("ready");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setStatus("error");
      });

    return () => controller.abort();
  }, [destinationSlug, directOnly, originAirport, reloadToken, tripType]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => dialogRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        window.requestAnimationFrame(() => cardRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const hasCoverage = status === "ready" && data !== null && data.months.length > 0;
  const pricedMonthCount =
    data?.months.filter((month) => month.averagePrice !== null).length ?? 0;
  const hasUsefulChart = hasCoverage && pricedMonthCount >= MIN_MONTHS_FOR_CHART;
  const shouldHideCard =
    status === "loading" ||
    (status === "ready" && pricedMonthCount > 0 && pricedMonthCount < MIN_MONTHS_FOR_CHART);
  const canOpenDetails = status !== "ready" || hasUsefulChart;

  useEffect(() => {
    if (isOpen && status === "ready" && !hasUsefulChart) {
      setIsOpen(false);
    }
  }, [hasUsefulChart, isOpen, status]);

  const closeModal = () => {
    setIsOpen(false);
    window.requestAnimationFrame(() => cardRef.current?.focus());
  };
  const accessibleSummary = useMemo(() => (data ? buildAccessibleSummary(data) : ""), [data]);
  const titleId = `monthly-price-title-${requestId.replaceAll(":", "")}`;

  if (shouldHideCard) {
    return null;
  }

  return (
    <>
      <button
        aria-haspopup={canOpenDetails ? "dialog" : undefined}
        className="monthly-price-card"
        disabled={!canOpenDetails}
        onClick={() => {
          if (!canOpenDetails) {
            return;
          }
          if (status === "error") {
            setReloadToken((current) => current + 1);
          }
          setIsOpen(true);
        }}
        ref={cardRef}
        type="button"
      >
        <span className="monthly-price-card__heading">
          <span>
            <strong>Precio medio por mes</strong>
            <small>{directOnly ? "(Vuelos directos)" : "(Todos los vuelos)"}</small>
          </span>
          <Info
            aria-label="Los precios se calculan a partir de las tarifas registradas para esta ruta."
            size={17}
          />
        </span>
        {status === "error" ? (
          <span className="monthly-price-card__message">
            No se pudieron cargar los precios medios. Inténtalo de nuevo.
          </span>
        ) : null}
        {status === "ready" && !hasCoverage ? (
          <span className="monthly-price-card__message">
            Todavía no se ha explorado la ventana de precios de esta ruta.
          </span>
        ) : null}
        {hasUsefulChart && data ? (
          <>
            <MonthlyPriceChart
              cheapestMonth={data.cheapestMonth}
              currency={data.currency}
              months={data.months}
            />
            <span className="sr-only">{accessibleSummary}</span>
            <span className="monthly-price-card__footer">
              <span>
                Media de tarifas
                <strong>
                  {data.annualAverage === null ? "Sin datos" : formatPrice(data.annualAverage, data.currency)}
                </strong>
              </span>
              <span>Ver detalle →</span>
            </span>
          </>
        ) : null}
      </button>

      {isOpen && canOpenDetails && typeof document !== "undefined"
        ? createPortal(
            <div
              className="monthly-price-modal"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  closeModal();
                }
              }}
            >
              <div
                aria-labelledby={titleId}
                aria-modal="true"
                className="monthly-price-modal__panel"
                ref={dialogRef}
                role="dialog"
                tabIndex={-1}
              >
                <button
                  aria-label="Cerrar"
                  className="monthly-price-modal__close"
                  onClick={closeModal}
                  type="button"
                >
                  <X aria-hidden="true" size={22} />
                </button>
                <header>
                  <p>EVOLUCIÓN DE TARIFAS</p>
                  <h2 id={titleId}>Precios medios por mes · {destinationCity}</h2>
                  <span>
                    {directOnly ? "Vuelos directos" : "Todos los vuelos"} desde Luxemburgo ({originAirport})
                  </span>
                </header>
                {status === "error" ? (
                  <div className="monthly-price-modal__state">
                    No se pudieron cargar los precios medios. Inténtalo de nuevo.
                  </div>
                ) : null}
                {status === "ready" && !hasCoverage ? (
                  <div className="monthly-price-modal__state">
                    Todavía no se ha explorado la ventana de precios de esta ruta.
                  </div>
                ) : null}
                {hasUsefulChart && data ? (
                  <>
                    <MonthlyPriceChart
                      cheapestMonth={data.cheapestMonth}
                      currency={data.currency}
                      detailed
                      months={data.months}
                    />
                    <p className="sr-only">{accessibleSummary}</p>
                    <div className="monthly-price-modal__summary">
                      <div>
                        <span>Mes más barato</span>
                        <strong>
                          {data.cheapestMonth ? formatMonth(data.cheapestMonth, "long") : "—"}
                        </strong>
                      </div>
                      <div>
                        <span>Media de tarifas disponibles</span>
                        <strong>
                          {data.annualAverage === null
                            ? "—"
                            : formatPrice(data.annualAverage, data.currency)}
                        </strong>
                      </div>
                      <div>
                        <span>Tarifas analizadas</span>
                        <strong>{data.totalSamples}</strong>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
