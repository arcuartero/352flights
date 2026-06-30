"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type OpsHealthDetailItem = {
  id: string;
  title: string;
  subtitle: string;
  statusLabel: string;
  statusTone: "warning" | "critical" | "pending";
  explanation: string;
  routeRoutingLabel: string | null;
  rulesInWindowLabel: string | null;
  lastSeenLabel: string;
  datesCheckedLabel: string | null;
  latestPriceLabel: string | null;
  latestScannerReasonLabel: string | null;
  latestScannerReasonAtLabel: string | null;
  latestScannerReasonDetail: string | null;
  detectedDepartureSummary: string | null;
  activeRuleSummary: string | null;
  childSummaryLabel: string | null;
  examplePatternLabel: string | null;
  exampleDatePairLabel: string | null;
  exampleBookingUrl: string | null;
};

type OpsHealthNeverSnapshotCardProps = {
  title: string;
  count: number;
  countLabel: string;
  emptyLabel?: string;
  items: OpsHealthDetailItem[];
  hintLabel?: string;
  dialogTitle: string;
  dialogDescription: string;
};

export function OpsHealthNeverSnapshotCard({
  title,
  count,
  countLabel,
  emptyLabel = "No routes",
  items,
  hintLabel,
  dialogTitle,
  dialogDescription,
}: OpsHealthNeverSnapshotCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isDisabled = count === 0;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <div
        className={`ops-send-stats__card ${
          !isDisabled ? "ops-send-stats__card--interactive" : ""
        }`}
      >
        <dt>{title}</dt>
        <dd>{count}</dd>
        <span className="ops-send-stats__card-hint">
          {isDisabled ? emptyLabel : `${countLabel}${hintLabel ? ` · ${hintLabel}` : ""}`}
        </span>
        {!isDisabled ? (
          <button
            aria-label={`Open ${countLabel} for ${title}`}
            className="ops-send-stats__card-hitbox"
            onClick={() => setIsOpen(true)}
            type="button"
          />
        ) : null}
      </div>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="ops-health-modal__backdrop"
              onMouseDown={() => setIsOpen(false)}
              role="presentation"
            >
              <section
                aria-labelledby="ops-health-routes-dialog-title"
                aria-modal="true"
                className="ops-health-modal"
                onMouseDown={(event) => event.stopPropagation()}
                role="dialog"
              >
                <div className="ops-health-modal__header">
                  <div>
                    <p className="ops-panel__eyebrow">Scanner health</p>
                    <h3 id="ops-health-routes-dialog-title">{dialogTitle}</h3>
                    <p>{dialogDescription}</p>
                  </div>
                  <button
                    className="ops-health-modal__close"
                    onClick={() => setIsOpen(false)}
                    type="button"
                  >
                    Close
                  </button>
                </div>

                <div className="ops-health-modal__list">
                  {items.map((item) => (
                    <article className="ops-health-modal__card" key={item.id}>
                      <div className="ops-health-modal__card-header">
                        <div>
                          <h4>{item.title}</h4>
                          <p>{item.subtitle}</p>
                        </div>
                        <span
                          className={`ops-send-badge ${
                            item.statusTone === "critical"
                              ? "is-critical"
                              : item.statusTone === "warning"
                                ? "is-warning"
                                : "is-pending"
                          }`}
                        >
                          {item.statusLabel}
                        </span>
                      </div>

                      <p className="ops-health-alert__explanation">{item.explanation}</p>

                      <div className="ops-pill-row">
                        {item.routeRoutingLabel ? (
                          <span className="ops-pill">Routing: {item.routeRoutingLabel}</span>
                        ) : null}
                        {item.rulesInWindowLabel ? (
                          <span className="ops-pill">{item.rulesInWindowLabel}</span>
                        ) : null}
                        <span className="ops-pill">Last seen: {item.lastSeenLabel}</span>
                        {item.datesCheckedLabel ? (
                          <span className="ops-pill">Dates checked: {item.datesCheckedLabel}</span>
                        ) : null}
                        {item.latestPriceLabel ? (
                          <span className="ops-pill">Last price: {item.latestPriceLabel}</span>
                        ) : null}
                        {item.latestScannerReasonLabel ? (
                          <span className="ops-pill">
                            Scanner reason: {item.latestScannerReasonLabel}
                            {item.latestScannerReasonAtLabel
                              ? ` · ${item.latestScannerReasonAtLabel}`
                              : ""}
                          </span>
                        ) : null}
                        {item.detectedDepartureSummary ? (
                          <span className="ops-pill">Departures: {item.detectedDepartureSummary}</span>
                        ) : null}
                        {item.activeRuleSummary ? (
                          <span className="ops-pill">Rule set: {item.activeRuleSummary}</span>
                        ) : null}
                        {item.childSummaryLabel ? (
                          <span className="ops-pill">{item.childSummaryLabel}</span>
                        ) : null}
                      </div>

                      {item.latestScannerReasonLabel && item.latestScannerReasonDetail ? (
                        <div className="ops-health-alert__latest-reason">
                          <strong>Latest scanner reason: {item.latestScannerReasonLabel}</strong>
                          <p>{item.latestScannerReasonDetail}</p>
                        </div>
                      ) : null}

                      {(item.examplePatternLabel || item.exampleBookingUrl) ? (
                        <div className="ops-health-alert__manual">
                          <div className="ops-health-alert__manual-copy">
                            <strong>Manual check</strong>
                            <p>
                              {item.examplePatternLabel ? `${item.examplePatternLabel} · ` : ""}
                              {item.exampleDatePairLabel ??
                                "No exact date pair available from current rules and detected dates."}
                            </p>
                          </div>
                          {item.exampleBookingUrl ? (
                            <a
                              className="ops-button ops-button--compact ops-button--linkout"
                              href={item.exampleBookingUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Skyscanner ↗
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
