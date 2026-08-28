"use client";

import { useEffect, useState } from "react";
import { Database, RefreshCw } from "lucide-react";

import type {
  IndicativePriceOverview,
  IndicativePriceStatistic,
} from "@/lib/indicative-price-stats";

type CoverageResponse =
  | {
      ok: true;
      overview: IndicativePriceOverview;
      statistics: IndicativePriceStatistic[];
    }
  | { ok: false; reason: string; detail?: string };

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatBytes(value: number) {
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`;
  return `${(value / 1_048_576).toFixed(1)} MB`;
}

export function IndicativePriceCoverage() {
  const [overview, setOverview] = useState<IndicativePriceOverview | null>(null);
  const [statistics, setStatistics] = useState<IndicativePriceStatistic[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch("/api/ops/indicative-price-stats", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as CoverageResponse;
        if (!response.ok || !payload.ok) {
          throw new Error(payload.ok ? "Coverage unavailable." : payload.detail ?? payload.reason);
        }
        if (!disposed) {
          setOverview(payload.overview);
          setStatistics(payload.statistics);
          setError(null);
        }
      } catch (requestError) {
        if (!disposed && !(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setError(requestError instanceof Error ? requestError.message : "Coverage unavailable.");
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    }

    void load();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, []);

  return (
    <section className="indicative-price-coverage">
      <div className="indicative-price-coverage__header">
        <div>
          <span className="ops-eyebrow">Calendar price map</span>
          <h2>Indicative price coverage</h2>
          <p>
            Calendar prices are stored separately. They improve monthly baselines but never create
            offers or appear publicly until an exact price is verified.
          </p>
        </div>
        <span className="ops-send-badge is-warning">Not public</span>
      </div>

      {loading ? (
        <div className="indicative-price-coverage__state" role="status">
          <RefreshCw aria-hidden="true" className="is-spinning" size={20} />
          Loading aggregated coverage…
        </div>
      ) : null}
      {error ? (
        <p className="ops-status ops-status--error">
          Calendar coverage is temporarily unavailable: {error}
        </p>
      ) : null}

      {overview ? (
        <>
          <div className="indicative-price-coverage__metrics">
            <div><span>Observations</span><strong>{overview.observations}</strong></div>
            <div><span>Unique combinations</span><strong>{overview.combinations}</strong></div>
            <div><span>Airport routes</span><strong>{overview.routes}</strong></div>
            <div><span>Route rules</span><strong>{overview.rules}</strong></div>
            <div><span>Travel months</span><strong>{overview.departureMonths}</strong></div>
            <div><span>Independent scans</span><strong>{overview.independentScanRuns}</strong></div>
            <div><span>Exactly checked</span><strong>{overview.verifiedCalendarPrices}</strong></div>
            <div><span>Database size</span><strong>{formatBytes(overview.tableBytes)}</strong></div>
          </div>

          {statistics.length > 0 ? (
            <div className="indicative-price-coverage__table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Airport route</th>
                    <th>Rule</th>
                    <th>Month</th>
                    <th>Combinations</th>
                    <th>Minimum</th>
                    <th>25% price</th>
                    <th>Median</th>
                    <th>Maximum</th>
                  </tr>
                </thead>
                <tbody>
                  {statistics.slice(0, 12).map((row) => (
                    <tr key={`${row.routeId}:${row.ruleKey}:${row.departureMonth}:${row.maxStops}`}>
                      <td><strong>{row.originAirport} → {row.destinationAirport}</strong><small>{row.routingType === "direct" ? "Direct" : "Stops allowed"}</small></td>
                      <td>{row.ruleLabel}</td>
                      <td>{formatMonth(row.departureMonth)}</td>
                      <td>{row.combinationsObserved}<small>{row.independentScanRuns} scan{row.independentScanRuns === 1 ? "" : "s"}</small></td>
                      <td>{formatMoney(row.minimumPrice, row.currency)}</td>
                      <td>{formatMoney(row.lowerQuartilePrice, row.currency)}</td>
                      <td>{formatMoney(row.medianPrice, row.currency)}</td>
                      <td>{formatMoney(row.maximumPrice, row.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="indicative-price-coverage__state">
              <Database aria-hidden="true" size={20} />
              The controlled Mac test will create the first calendar observations.
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
