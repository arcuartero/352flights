"use client";

import { useState, useDeferredValue, useMemo, useEffect } from "react";
import type { OpsPriceSeries } from "@/lib/ops/types";
import { buildEditorialSections } from "@/lib/editorial-sections";
import { formatRoutePatternLabel, formatNightsLabel } from "@/lib/route-stay";
import {
  FLASH_RATIO_PERCENT,
  MIN_BASELINE_POINTS,
  REVIEW_RATIO_PERCENT,
  type ReviewDeal,
  SORT_OPTIONS,
  applySortCriterion,
  buildFallbackSeriesFromDeal,
  buildMonthlyLows,
  explainDealContext,
  extractAirlineFilterValues,
  formatCurrency,
  formatDateTime,
  formatDateWithWeekday,
  formatDealState,
  formatFlightClock,
  formatFlightWeekdayClock,
  formatRelativeBucket,
  formatSearchRange,
  formatSendType,
  formatStayDaysAndHours,
  formatStayDaysAndHoursCompact,
  formatStops,
  formatTravelDateWithWeekday,
  formatVerifiedAge,
} from "./review-queue/helpers";
import { ReviewTrendChart } from "./review-queue/trend-chart";

type OpsReviewQueueProps = {
  deals: ReviewDeal[];
  totalNewDeals: number | null;
  page: number;
  pageSize: number;
  bulkReviewDealAction: (formData: FormData) => void | Promise<void>;
  reviewDealAction: (formData: FormData) => void | Promise<void>;
};

export function OpsReviewQueue({
  deals,
  totalNewDeals,
  page,
  pageSize,
  bulkReviewDealAction,
  reviewDealAction,
}: OpsReviewQueueProps) {
  const [searchValue, setSearchValue] = useState("");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [stopsFilter, setStopsFilter] = useState("all");
  const [airlineFilter, setAirlineFilter] = useState("all");
  const [maxPriceFilter, setMaxPriceFilter] = useState("");
  const [sortBy, setSortBy] = useState<string[]>(["freshness"]);
  const [areFiltersOpen, setAreFiltersOpen] = useState(false);
  const [selectedDealIds, setSelectedDealIds] = useState<string[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [seriesByDealId, setSeriesByDealId] = useState<
    Record<string, OpsPriceSeries | null>
  >({});
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [seriesError, setSeriesError] = useState<string | null>(null);

  const deferredSearch = useDeferredValue(searchValue);
  const deferredMaxPrice = useDeferredValue(maxPriceFilter);

  const maxPriceValue = useMemo(() => {
    const parsed = Number.parseFloat(deferredMaxPrice);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }, [deferredMaxPrice]);

  const bucketOptions = useMemo(
    () =>
      ["all", ...new Set(deals.map((deal) => deal.routeBucket))].map(
        (bucket) => ({
          value: bucket,
          label:
            bucket === "all" ? "All buckets" : formatRelativeBucket(bucket),
        }),
      ),
    [deals],
  );

  const stopOptions = useMemo(
    () =>
      ["all", ...new Set(deals.map((deal) => deal.maxStops))].map((value) => ({
        value,
        label: value === "all" ? "All routing" : formatStops(value),
      })),
    [deals],
  );

  const airlineOptions = useMemo(
    () =>
      [
        "all",
        ...new Set(
          deals.flatMap((deal) =>
            extractAirlineFilterValues(deal.airlineSummary),
          ),
        ),
      ].map((value) => ({
        value,
        label: value === "all" ? "All airlines" : value,
      })),
    [deals],
  );

  const activeSortSummary = useMemo(() => {
    if (sortBy.length === 0) {
      return "Latest scan first";
    }

    return sortBy
      .map(
        (value) =>
          SORT_OPTIONS.find((option) => option.value === value)?.label ?? value,
      )
      .join(" + ");
  }, [sortBy]);

  function toggleSortOption(value: string) {
    setSortBy((current) => {
      if (current.includes(value)) {
        const next = current.filter((item) => item !== value);
        return next.length > 0 ? next : ["freshness"];
      }

      const withoutFreshness =
        value !== "freshness"
          ? current.filter((item) => item !== "freshness")
          : current;
      return [...withoutFreshness, value];
    });
  }

  const filteredDeals = useMemo(() => {
    const search = deferredSearch.trim().toLowerCase();
    const filtered = deals.filter((deal) => {
      if (bucketFilter !== "all" && deal.routeBucket !== bucketFilter) {
        return false;
      }

      if (stopsFilter !== "all" && deal.maxStops !== stopsFilter) {
        return false;
      }

      if (
        airlineFilter !== "all" &&
        !extractAirlineFilterValues(deal.airlineSummary).includes(airlineFilter)
      ) {
        return false;
      }

      if (maxPriceValue !== null && deal.dealPrice > maxPriceValue) {
        return false;
      }

      if (!search) {
        return true;
      }

      return [
        deal.title,
        deal.routeLabel,
        deal.destinationCity,
        deal.destinationAirport,
        formatRelativeBucket(deal.routeBucket),
        deal.airlineSummary ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });

    const priceValue = (deal: ReviewDeal) => deal.dealPrice;
    const nightValue = (deal: ReviewDeal) => deal.tripNights ?? null;
    const freshnessValue = (deal: ReviewDeal) =>
      new Date(deal.verifiedAt ?? deal.createdAt).getTime();

    const activeSorts = sortBy.length > 0 ? sortBy : ["freshness"];

    return [...filtered].sort((left, right) => {
      for (const criterion of activeSorts) {
        const result = applySortCriterion(left, right, criterion, {
          priceValue,
          nightValue,
          freshnessValue,
        });
        if (result !== 0) {
          return result;
        }
      }

      return left.title.localeCompare(right.title);
    });
  }, [
    airlineFilter,
    bucketFilter,
    deals,
    deferredSearch,
    maxPriceValue,
    sortBy,
    stopsFilter,
  ]);

  const editorialSections = useMemo(
    () =>
      buildEditorialSections(filteredDeals, (deal) => ({
        routeBucket: deal.routeBucket,
        tripNights: deal.tripNights,
        dropRatio: deal.dropRatio,
        departureDate: deal.departureDate,
      })),
    [filteredDeals],
  );

  const selectedDeal = useMemo(
    () => deals.find((deal) => deal.id === selectedDealId) ?? null,
    [deals, selectedDealId],
  );

  const selectedSeries = selectedDealId
    ? (seriesByDealId[selectedDealId] ?? null)
    : null;

  useEffect(() => {
    if (!selectedDealId || !selectedDeal?.patternKey) {
      setSeriesLoading(false);
      setSeriesError(null);
      return;
    }

    if (Object.prototype.hasOwnProperty.call(seriesByDealId, selectedDealId)) {
      setSeriesLoading(false);
      setSeriesError(null);
      return;
    }

    const controller = new AbortController();
    setSeriesLoading(true);
    setSeriesError(null);

    fetch(`/api/ops/deal-price-series/${encodeURIComponent(selectedDealId)}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          ok?: boolean;
          series?: OpsPriceSeries | null;
          detail?: string;
        };
        if (!response.ok || !payload.ok) {
          throw new Error(
            payload.detail ?? "Price history could not be loaded.",
          );
        }
        return payload.series ?? null;
      })
      .then((series) => {
        setSeriesByDealId((current) => ({
          ...current,
          [selectedDealId]: series,
        }));
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setSeriesError(
            error instanceof Error
              ? error.message
              : "Price history could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSeriesLoading(false);
        }
      });

    return () => controller.abort();
  }, [selectedDeal, selectedDealId, seriesByDealId]);

  const selectedDisplaySeries = useMemo(() => {
    if (!selectedDeal) {
      return null;
    }

    return selectedSeries ?? buildFallbackSeriesFromDeal(selectedDeal);
  }, [selectedDeal, selectedSeries]);

  const selectedSeriesMonthlyLows = useMemo(() => {
    if (!selectedSeries) {
      return [];
    }

    return buildMonthlyLows(selectedSeries);
  }, [selectedSeries]);

  const totalPages =
    totalNewDeals === null
      ? null
      : Math.max(1, Math.ceil(totalNewDeals / pageSize));
  const hasNextPage =
    totalPages === null ? deals.length === pageSize : page < totalPages;

  useEffect(() => {
    const visibleIds = new Set(filteredDeals.map((deal) => deal.id));
    setSelectedDealIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [filteredDeals]);

  const allVisibleSelected =
    filteredDeals.length > 0 &&
    filteredDeals.every((deal) => selectedDealIds.includes(deal.id));

  function toggleDealSelection(id: string) {
    setSelectedDealIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleAllVisibleDeals() {
    if (allVisibleSelected) {
      setSelectedDealIds([]);
      return;
    }

    setSelectedDealIds(filteredDeals.map((deal) => deal.id));
  }

  return (
    <section className="ops-panel ops-panel--wide">
      <div className="ops-panel__header">
        <div>
          <p className="ops-panel__eyebrow">Review queue</p>
          <h2>New deals</h2>
        </div>
        <p>
          {filteredDeals.length} visible now ·{" "}
          {totalNewDeals === null
            ? "total could not be verified"
            : `${totalNewDeals} total new`}
        </p>
      </div>

      <section
        className={`ops-review-controls ${areFiltersOpen ? "is-open" : ""}`}
      >
        <button
          aria-expanded={areFiltersOpen}
          className="ops-filter-panel__toggle"
          onClick={() => setAreFiltersOpen((current) => !current)}
          type="button"
        >
          <span>Filters and sorting</span>
          <strong>{areFiltersOpen ? "Hide" : "Show"}</strong>
        </button>
        <div className="ops-filter-panel__body">
          <label className="ops-review-control ops-review-control--search">
            <span>Search route</span>
            <input
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Madrid, Ryanair, weekend..."
              type="search"
              value={searchValue}
            />
          </label>

          <label className="ops-review-control">
            <span>Bucket</span>
            <select
              onChange={(event) => setBucketFilter(event.target.value)}
              value={bucketFilter}
            >
              {bucketOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="ops-review-control">
            <span>Routing</span>
            <select
              onChange={(event) => setStopsFilter(event.target.value)}
              value={stopsFilter}
            >
              {stopOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="ops-review-control">
            <span>Airline</span>
            <select
              onChange={(event) => setAirlineFilter(event.target.value)}
              value={airlineFilter}
            >
              {airlineOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="ops-review-control">
            <span>Max deal price</span>
            <input
              inputMode="numeric"
              min="0"
              onChange={(event) => setMaxPriceFilter(event.target.value)}
              placeholder="Any price"
              step="1"
              type="number"
              value={maxPriceFilter}
            />
          </label>

          <label className="ops-review-control">
            <span>Sort by</span>
            <details className="price-sort-menu">
              <summary>{activeSortSummary}</summary>
              <div className="price-sort-menu__panel">
                {SORT_OPTIONS.map((option) => {
                  const activeIndex = sortBy.indexOf(option.value);
                  return (
                    <label
                      className="price-sort-menu__option"
                      key={option.value}
                    >
                      <input
                        checked={activeIndex !== -1}
                        onChange={() => toggleSortOption(option.value)}
                        type="checkbox"
                      />
                      <span>{option.label}</span>
                      {activeIndex !== -1 ? (
                        <strong className="price-sort-menu__priority">
                          {activeIndex + 1}
                        </strong>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </details>
          </label>
        </div>
      </section>

      {filteredDeals.length === 0 ? (
        <div className="ops-empty">
          <p>No deals match the current filters.</p>
        </div>
      ) : (
        <div className="ops-deals">
          <section
            className={`ops-review-bulk ${selectedDealIds.length > 0 ? "is-active" : ""}`}
          >
            <div className="ops-review-bulk__summary">
              <strong>{selectedDealIds.length} selected</strong>
              <button
                className="ops-button ops-button--ghost ops-button--compact"
                onClick={toggleAllVisibleDeals}
                type="button"
              >
                {allVisibleSelected ? "Clear visible" : "Select visible"}
              </button>
              {selectedDealIds.length > 0 ? (
                <button
                  className="ops-button ops-button--ghost ops-button--compact"
                  onClick={() => setSelectedDealIds([])}
                  type="button"
                >
                  Clear all
                </button>
              ) : null}
            </div>
            <div className="ops-review-bulk__actions">
              <form action={bulkReviewDealAction}>
                {selectedDealIds.map((id) => (
                  <input
                    key={`reviewed-${id}`}
                    name="id"
                    type="hidden"
                    value={id}
                  />
                ))}
                <input name="status" type="hidden" value="reviewed" />
                <button
                  className="ops-button ops-button--approve"
                  disabled={selectedDealIds.length === 0}
                  type="submit"
                >
                  Mark selected reviewed
                </button>
              </form>
              <form action={bulkReviewDealAction}>
                {selectedDealIds.map((id) => (
                  <input
                    key={`expired-${id}`}
                    name="id"
                    type="hidden"
                    value={id}
                  />
                ))}
                <input name="status" type="hidden" value="expired" />
                <button
                  className="ops-button ops-button--ghost"
                  disabled={selectedDealIds.length === 0}
                  type="submit"
                >
                  Expire selected
                </button>
              </form>
            </div>
          </section>

          {editorialSections.map((section) => (
            <section className="ops-deal-section" key={section.key}>
              <div className="ops-deal-section__header">
                <div>
                  <p className="ops-panel__eyebrow">{section.label}</p>
                  <h3>
                    {section.items.length} deal
                    {section.items.length === 1 ? "" : "s"}
                  </h3>
                </div>
                <p>{section.description}</p>
              </div>
              {section.items.map((deal) => (
                <article className="ops-deal" key={deal.id}>
                  <label className="ops-deal__select">
                    <input
                      checked={selectedDealIds.includes(deal.id)}
                      onChange={() => toggleDealSelection(deal.id)}
                      type="checkbox"
                    />
                    <span>Select</span>
                  </label>
                  <div className="ops-deal__main">
                    <div className="ops-deal__heading">
                      <p className="ops-tag">
                        {formatRelativeBucket(deal.routeBucket)}
                      </p>
                      <h3>{deal.title}</h3>
                    </div>
                    <p className="ops-deal__summary">{deal.summary}</p>
                    <div className="ops-deal__why">
                      <span>Why this looks good</span>
                      <p>{explainDealContext(deal)}</p>
                    </div>
                    <dl className="ops-deal__facts">
                      <div>
                        <dt>Route</dt>
                        <dd>
                          {formatRoutePatternLabel(
                            deal.routeLabel,
                            deal.patternLabel,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Travel window</dt>
                        <dd>
                          {formatDateWithWeekday(deal.departureDate)} to{" "}
                          {formatDateWithWeekday(deal.returnDate)}
                        </dd>
                      </div>
                      <div>
                        <dt>Flight times</dt>
                        <dd>
                          {deal.outboundDepartureAt &&
                          deal.outboundArrivalAt ? (
                            <>
                              Out{" "}
                              {formatFlightWeekdayClock(
                                deal.outboundDepartureAt,
                              )}{" "}
                              {"->"} {formatFlightClock(deal.outboundArrivalAt)}
                            </>
                          ) : (
                            "Awaiting timing detail"
                          )}
                          {deal.returnDepartureAt && deal.returnArrivalAt ? (
                            <>
                              <br />
                              Back{" "}
                              {formatFlightWeekdayClock(
                                deal.returnDepartureAt,
                              )}{" "}
                              {"->"} {formatFlightClock(deal.returnArrivalAt)}
                            </>
                          ) : null}
                        </dd>
                      </div>
                      <div>
                        <dt>Time in destination</dt>
                        <dd>
                          {formatStayDaysAndHours(deal.destinationStayHours)}
                        </dd>
                      </div>
                      <div>
                        <dt>Deal price</dt>
                        <dd>{formatCurrency(deal.dealPrice)}</dd>
                      </div>
                      <div>
                        <dt>Baseline</dt>
                        <dd>
                          {deal.baselinePrice ? (
                            <>
                              {formatCurrency(deal.baselinePrice)}
                              {deal.baselineHistoryDays ? (
                                <>
                                  <br />
                                  <small>
                                    {deal.baselineHistoryDays}d history
                                  </small>
                                </>
                              ) : null}
                            </>
                          ) : (
                            "Not enough data"
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Drop</dt>
                        <dd>
                          {deal.dropRatio
                            ? `${Math.round((1 - deal.dropRatio) * 100)}% below baseline`
                            : "n/a"}
                        </dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>{formatDealState(deal.status)}</dd>
                      </div>
                      <div>
                        <dt className="ops-help-label">
                          <span>Send type</span>
                          <span className="ops-help-tooltip">
                            <button
                              aria-label="Explain send type thresholds"
                              className="ops-help-tooltip__trigger"
                              type="button"
                            >
                              i
                            </button>
                            <span
                              className="ops-help-tooltip__bubble"
                              role="tooltip"
                            >
                              Flash if the price is {FLASH_RATIO_PERCENT}% or
                              less of the baseline. Digest if it is above{" "}
                              {FLASH_RATIO_PERCENT}% but still at or below{" "}
                              {REVIEW_RATIO_PERCENT}%. No deal is created if it
                              stays above {REVIEW_RATIO_PERCENT}% or if there
                              are fewer than {MIN_BASELINE_POINTS} historical
                              prices.
                            </span>
                          </span>
                        </dt>
                        <dd>{formatSendType(deal.sendType)}</dd>
                      </div>
                      <div>
                        <dt>Trip shape</dt>
                        <dd>
                          {deal.tripNights} nights ·{" "}
                          {formatStops(deal.maxStops)}
                        </dd>
                      </div>
                      <div>
                        <dt>Airline</dt>
                        <dd>
                          {deal.airlineSummary ?? "Awaiting itinerary detail"}
                        </dd>
                      </div>
                      <div>
                        <dt>Verified</dt>
                        <dd>
                          {formatVerifiedAge(deal.verifiedAt)}
                          <br />
                          <small>{formatDateTime(deal.verifiedAt)}</small>
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="ops-deal__actions">
                    <button
                      className="ops-button ops-button--ghost"
                      onClick={() => setSelectedDealId(deal.id)}
                      type="button"
                    >
                      Open details
                    </button>
                    {deal.bookingUrl ? (
                      <a
                        className="ops-button ops-button--linkout"
                        href={deal.bookingUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <span>Skyscanner</span>
                        <span aria-hidden="true" className="ops-button__icon">
                          ↗
                        </span>
                      </a>
                    ) : null}
                    <form action={reviewDealAction}>
                      <input name="id" type="hidden" value={deal.id} />
                      <input name="status" type="hidden" value="reviewed" />
                      <button
                        className="ops-button ops-button--approve"
                        type="submit"
                      >
                        Mark reviewed
                      </button>
                    </form>
                    <form action={reviewDealAction}>
                      <input name="id" type="hidden" value={deal.id} />
                      <input name="status" type="hidden" value="expired" />
                      <button
                        className="ops-button ops-button--ghost"
                        type="submit"
                      >
                        Expire
                      </button>
                    </form>
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
      )}

      {selectedDeal ? (
        <div
          aria-hidden={false}
          className="price-modal"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedDealId(null);
            }
          }}
        >
          <section
            aria-labelledby="review-deal-dialog-title"
            aria-modal="true"
            className="price-focus price-modal__panel"
            role="dialog"
          >
            <div className="price-modal__chrome">
              <div className="price-modal__eyebrow-row">
                <p className="ops-panel__eyebrow">Selected route</p>
                <p className="price-modal__latest-scan-line">
                  Latest scan{" "}
                  {selectedDisplaySeries?.latestScannedAt
                    ? formatDateTime(selectedDisplaySeries.latestScannedAt)
                    : selectedDeal.verifiedAt
                      ? formatDateTime(selectedDeal.verifiedAt)
                      : "n/a"}
                </p>
              </div>
              <button
                aria-label="Close deal detail"
                className="price-modal__close"
                onClick={() => setSelectedDealId(null)}
                type="button"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <div className="price-focus__header">
              <div>
                <h2 id="review-deal-dialog-title">
                  {formatRoutePatternLabel(
                    selectedDeal.routeLabel,
                    selectedDeal.patternLabel,
                  )}
                </h2>
                <p>
                  {selectedDisplaySeries
                    ? `Scans ${formatSearchRange(selectedDisplaySeries)}`
                    : `Scans ${selectedDeal.patternLabel ?? formatNightsLabel(selectedDeal.tripNights)}`}{" "}
                  ·{" "}
                  {selectedDisplaySeries &&
                  selectedDisplaySeries.latestTripNights !== null
                    ? `latest cheapest ${formatNightsLabel(selectedDisplaySeries.latestTripNights)}`
                    : "no winner yet"}{" "}
                  · {formatStops(selectedDeal.maxStops)} ·{" "}
                  {selectedDisplaySeries
                    ? `${selectedDisplaySeries.points.length} cron snapshots`
                    : "No chart history yet"}
                </p>
                <p>
                  Latest airline:{" "}
                  {selectedDisplaySeries?.latestAirlineSummary ??
                    selectedDeal.airlineSummary ??
                    "Awaiting itinerary detail"}
                </p>
                {(selectedDisplaySeries?.latestOutboundDepartureAt ??
                  selectedDeal.outboundDepartureAt) &&
                (selectedDisplaySeries?.latestOutboundArrivalAt ??
                  selectedDeal.outboundArrivalAt) &&
                (selectedDisplaySeries?.latestReturnDepartureAt ??
                  selectedDeal.returnDepartureAt) &&
                (selectedDisplaySeries?.latestReturnArrivalAt ??
                  selectedDeal.returnArrivalAt) ? (
                  <p>
                    Latest timing: out{" "}
                    {formatFlightWeekdayClock(
                      selectedDisplaySeries?.latestOutboundDepartureAt ??
                        selectedDeal.outboundDepartureAt,
                    )}{" "}
                    {"->"}{" "}
                    {formatFlightClock(
                      selectedDisplaySeries?.latestOutboundArrivalAt ??
                        selectedDeal.outboundArrivalAt,
                    )}{" "}
                    · back{" "}
                    {formatFlightWeekdayClock(
                      selectedDisplaySeries?.latestReturnDepartureAt ??
                        selectedDeal.returnDepartureAt,
                    )}{" "}
                    {"->"}{" "}
                    {formatFlightClock(
                      selectedDisplaySeries?.latestReturnArrivalAt ??
                        selectedDeal.returnArrivalAt,
                    )}
                    {(selectedDisplaySeries?.latestDestinationStayHours ??
                      selectedDeal.destinationStayHours) !== null
                      ? ` · stay ${formatStayDaysAndHoursCompact(selectedDisplaySeries?.latestDestinationStayHours ?? selectedDeal.destinationStayHours)}`
                      : ""}
                  </p>
                ) : null}
                {(selectedDisplaySeries?.latestBookingUrl ??
                selectedDeal.bookingUrl) ? (
                  <p>
                    <a
                      href={
                        selectedDisplaySeries?.latestBookingUrl ??
                        selectedDeal.bookingUrl ??
                        "#"
                      }
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open this search in Skyscanner
                    </a>
                  </p>
                ) : null}
              </div>
              <div className="price-focus__stats">
                <article>
                  <span>Latest</span>
                  <strong>
                    {selectedDisplaySeries?.latestPrice !== null &&
                    selectedDisplaySeries?.latestPrice !== undefined
                      ? formatCurrency(selectedDisplaySeries.latestPrice)
                      : formatCurrency(selectedDeal.dealPrice)}
                  </strong>
                </article>
                <article>
                  <span>Low</span>
                  <strong>
                    {selectedDisplaySeries?.minPrice !== null &&
                    selectedDisplaySeries?.minPrice !== undefined
                      ? formatCurrency(selectedDisplaySeries.minPrice)
                      : "n/a"}
                  </strong>
                </article>
                <article>
                  <span>High</span>
                  <strong>
                    {selectedDisplaySeries?.maxPrice !== null &&
                    selectedDisplaySeries?.maxPrice !== undefined
                      ? formatCurrency(selectedDisplaySeries.maxPrice)
                      : "n/a"}
                  </strong>
                </article>
              </div>
            </div>

            {seriesLoading ? (
              <div className="ops-empty" role="status">
                <p>Loading this offer&apos;s price history…</p>
              </div>
            ) : seriesError ? (
              <div className="ops-banner" role="alert">
                <p>{seriesError}</p>
              </div>
            ) : selectedSeries ? (
              <>
                <ReviewTrendChart series={selectedSeries} />

                <section className="price-monthly-lows">
                  <div className="price-monthly-lows__header">
                    <span>Monthly lows</span>
                    <p>
                      Lowest price by departure month for this route and rule.
                    </p>
                  </div>
                  <div className="price-monthly-lows__grid">
                    {selectedSeriesMonthlyLows.map((month) => (
                      <article
                        className="price-monthly-lows__card"
                        key={month.key}
                      >
                        <span>{month.label}</span>
                        <strong>
                          {month.point !== null
                            ? formatCurrency(
                                month.point.price,
                                month.point.currency,
                              )
                            : "n/a"}
                        </strong>
                        {month.point ? (
                          <>
                            <p>
                              Out{" "}
                              {formatTravelDateWithWeekday(
                                month.point.departureDate,
                              )}
                            </p>
                            <p>
                              Back{" "}
                              {formatTravelDateWithWeekday(
                                month.point.returnDate,
                              )}
                            </p>
                            <p>
                              {month.point.destinationStayHours !== null
                                ? `Stay ${formatStayDaysAndHoursCompact(month.point.destinationStayHours)}`
                                : month.point.tripNights > 0
                                  ? formatNightsLabel(month.point.tripNights)
                                  : "Duration n/a"}
                            </p>
                            {month.point.bookingUrl ? (
                              <a
                                href={month.point.bookingUrl}
                                rel="noreferrer"
                                target="_blank"
                              >
                                Open in Skyscanner
                              </a>
                            ) : null}
                          </>
                        ) : (
                          <p>No fare found</p>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <div className="ops-empty">
                <p>
                  No historical prices are available for this exact route and
                  rule yet.
                </p>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {page > 1 || hasNextPage ? (
        <nav aria-label="New deals pages" className="ops-review-pagination">
          {page > 1 ? (
            <a
              className="ops-button ops-button--ghost"
              href={`/ops?dealsPage=${page - 1}`}
            >
              Previous 50
            </a>
          ) : (
            <span
              aria-disabled="true"
              className="ops-button ops-button--ghost is-disabled"
            >
              Previous 50
            </span>
          )}
          <span>
            {totalPages === null
              ? `Page ${page} · total unverified`
              : `Page ${page} of ${totalPages}`}
          </span>
          {hasNextPage ? (
            <a
              className="ops-button ops-button--ghost"
              href={`/ops?dealsPage=${page + 1}`}
            >
              Next 50
            </a>
          ) : (
            <span
              aria-disabled="true"
              className="ops-button ops-button--ghost is-disabled"
            >
              Next 50
            </span>
          )}
        </nav>
      ) : null}
    </section>
  );
}
