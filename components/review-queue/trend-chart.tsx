import type { OpsPriceSeries } from "@/lib/ops/types";
import { useState } from "react";
import {
  buildPath,
  formatChartDate,
  formatCurrency,
  formatFlightClock,
  formatFlightWeekdayClock,
  formatStayDaysAndHoursCompact,
  formatTravelDateWithWeekday,
} from "./helpers";

export function ReviewTrendChart({ series }: { series: OpsPriceSeries }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const values = series.points.map((point) => point.price);
  const svgWidth = 640;
  const svgHeight = 260;
  const margin = {
    top: 16,
    right: 16,
    bottom: 40,
    left: 74,
  };
  const plotWidth = svgWidth - margin.left - margin.right;
  const plotHeight = svgHeight - margin.top - margin.bottom;
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const chartPadding =
    min === max
      ? Math.max(8, max * 0.06 || 8)
      : Math.max((max - min) * 0.12, 8);
  const chartMin = Math.max(0, min - chartPadding);
  const chartMax = max + chartPadding;
  const coordinates =
    values.length === 0
      ? []
      : values.map((value, index) => ({
          x:
            margin.left +
            (values.length === 1
              ? plotWidth / 2
              : (index / (values.length - 1)) * plotWidth),
          y:
            margin.top +
            plotHeight -
            ((value - chartMin) / (chartMax - chartMin || 1)) * plotHeight,
        }));
  const activeIndex = hoveredIndex ?? coordinates.length - 1;
  const latest = series.points.at(-1) ?? null;
  const activePoint = coordinates[activeIndex] ?? null;
  const activeSnapshot = series.points[activeIndex] ?? null;
  const activePointRatio = activePoint ? activePoint.x / svgWidth : 0.5;
  const tooltipPlacement =
    activePointRatio > 0.82
      ? "is-right"
      : activePointRatio < 0.18
        ? "is-left"
        : "is-center";
  const yTicks = Array.from({ length: 4 }, (_, index) => {
    const ratio = index / 3;
    const value = chartMax - (chartMax - chartMin) * ratio;
    return {
      value,
      y: margin.top + plotHeight * ratio,
    };
  });
  const xTickIndexes = Array.from(
    new Set(
      [
        0,
        Math.floor((coordinates.length - 1) / 3),
        Math.floor(((coordinates.length - 1) * 2) / 3),
        coordinates.length - 1,
      ].filter((index) => index >= 0),
    ),
  );

  if (coordinates.length === 0 || !latest) {
    return (
      <div className="price-chart__empty">
        <p>No chart data for this route yet.</p>
      </div>
    );
  }

  const areaPath = `${buildPath(coordinates)} L ${margin.left + plotWidth} ${margin.top + plotHeight} L ${margin.left} ${margin.top + plotHeight} Z`;

  return (
    <div className="price-chart">
      <div className="price-chart__axes">
        <span>Price</span>
        <span>Scan day</span>
      </div>
      <div className="price-chart__plot">
        <svg
          aria-hidden="true"
          className="price-chart__svg"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="none"
        >
          {yTicks.map((tick, index) => (
            <g key={`${series.routeId}-y-${index}`}>
              <path
                className="price-chart__grid"
                d={`M ${margin.left} ${tick.y} L ${margin.left + plotWidth} ${tick.y}`}
              />
              <text
                className="price-chart__axis-label price-chart__axis-label--y"
                x={margin.left - 10}
                y={tick.y + 4}
              >
                {formatCurrency(tick.value)}
              </text>
            </g>
          ))}
          {xTickIndexes.map((index) => {
            const point = coordinates[index];
            const snapshot = series.points[index];

            if (!point || !snapshot) {
              return null;
            }

            return (
              <g key={`${series.seriesKey}-x-${index}`}>
                <path
                  className="price-chart__axis-tick"
                  d={`M ${point.x} ${margin.top + plotHeight} L ${point.x} ${margin.top + plotHeight + 6}`}
                />
                <text
                  className="price-chart__axis-label price-chart__axis-label--x"
                  textAnchor={
                    index === 0
                      ? "start"
                      : index === coordinates.length - 1
                        ? "end"
                        : "middle"
                  }
                  x={point.x}
                  y={margin.top + plotHeight + 22}
                >
                  {formatChartDate(snapshot.scannedAt)}
                </text>
              </g>
            );
          })}
          <path
            className="price-chart__axis-line"
            d={`M ${margin.left} ${margin.top + plotHeight} L ${margin.left + plotWidth} ${margin.top + plotHeight}`}
          />
          <path
            className="price-chart__axis-line"
            d={`M ${margin.left} ${margin.top} L ${margin.left} ${margin.top + plotHeight}`}
          />
          <path className="price-chart__area" d={areaPath} />
          <path className="price-chart__line" d={buildPath(coordinates)} />
          {coordinates.map((point, index) => (
            <g key={`${series.routeId}-${index}`}>
              <circle
                className={`price-chart__dot ${
                  index === coordinates.length - 1 ? "is-latest" : ""
                } ${index === activeIndex ? "is-active" : ""}`}
                cx={point.x}
                cy={point.y}
                r={
                  index === coordinates.length - 1 || index === activeIndex
                    ? 5
                    : 3
                }
              />
              <circle
                className="price-chart__hit-area"
                cx={point.x}
                cy={point.y}
                onBlur={() => setHoveredIndex(null)}
                onFocus={() => setHoveredIndex(index)}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                r={11}
                tabIndex={0}
              />
            </g>
          ))}
        </svg>
        {activePoint && activeSnapshot ? (
          <div
            className={`price-chart__tooltip ${tooltipPlacement}`}
            style={{
              left: `${(activePoint.x / svgWidth) * 100}%`,
              top: `${(activePoint.y / svgHeight) * 100}%`,
            }}
          >
            <strong>
              {formatCurrency(activeSnapshot.price, activeSnapshot.currency)}
            </strong>
            <span>{formatChartDate(activeSnapshot.scannedAt)}</span>
            <span>
              Out {formatTravelDateWithWeekday(activeSnapshot.departureDate)}
            </span>
            <span>
              Back {formatTravelDateWithWeekday(activeSnapshot.returnDate)}
            </span>
          </div>
        ) : null}
      </div>
      <div className="price-chart__legend">
        <div>
          <span>Travel dates</span>
          <div className="price-chart__travel-dates">
            <p className="price-chart__detail-line">
              Out {formatTravelDateWithWeekday(latest.departureDate)}
            </p>
            <p className="price-chart__detail-line">
              Back {formatTravelDateWithWeekday(latest.returnDate)}
            </p>
          </div>
        </div>
        <div>
          <span>Flight times</span>
          <div className="price-chart__flight-times">
            <p className="price-chart__detail-line">
              Out {formatFlightWeekdayClock(latest.outboundDepartureAt)} {"->"}{" "}
              {formatFlightClock(latest.outboundArrivalAt)}
            </p>
            <p className="price-chart__detail-line">
              Back {formatFlightWeekdayClock(latest.returnDepartureAt)} {"->"}{" "}
              {formatFlightClock(latest.returnArrivalAt)}
            </p>
            {latest.destinationStayHours !== null ? (
              <p className="price-chart__detail-line">
                Stay{" "}
                {formatStayDaysAndHoursCompact(latest.destinationStayHours)}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
