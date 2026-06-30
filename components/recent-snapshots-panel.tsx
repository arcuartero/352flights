"use client";

import { useState } from "react";

import { formatRoutePatternLabel } from "@/lib/route-stay";

type RecentSnapshotItem = {
  id: number;
  routeLabel: string;
  patternLabel: string | null;
  tripNights: number;
  airlineSummary: string | null;
  bookingUrl: string | null;
  price: number;
  currency: string;
  departureDate: string;
  returnDate: string | null;
  outboundDepartureAt: string | null;
  outboundArrivalAt: string | null;
  returnDepartureAt: string | null;
  returnArrivalAt: string | null;
  destinationStayHours: number | null;
  scannedAt: string;
};

type RecentSnapshotsPanelProps = {
  snapshots: RecentSnapshotItem[];
  collapsible?: boolean;
  defaultOpen?: boolean;
  eyebrow?: string;
  title?: string;
  emptyMessage?: string;
};

function formatCurrency(value: number, currency: string = "EUR") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateWithWeekday(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatFlightClock(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatFlightWeekdayClock(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatStayHours(value: number | null) {
  if (value === null) {
    return "n/a";
  }

  const rounded = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  return `${rounded}h in destination`;
}

function formatVerifiedAge(value: string | null, now: Date = new Date()) {
  if (!value) {
    return "Verified recently";
  }

  const diffMs = now.getTime() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 60_000) {
    return "Verified just now";
  }

  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 60) {
    return `Verified ${diffMinutes} min ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `Verified ${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `Verified ${diffDays}d ago`;
}

export function RecentSnapshotsPanel({
  snapshots,
  collapsible = false,
  defaultOpen = true,
  eyebrow = "Scanner output",
  title = "Recent snapshots",
  emptyMessage = "No snapshots stored in Supabase yet. Run the scanner after the schema is applied.",
}: RecentSnapshotsPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="ops-panel">
      {collapsible ? (
        <button
          aria-controls="recent-snapshots-panel-content"
          aria-expanded={isOpen}
          className="ops-collapsible__toggle"
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          <div>
            <p className="ops-panel__eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
          </div>
          <div className="ops-collapsible__meta">
            <span>{snapshots.length} in view</span>
            <strong>{isOpen ? "Hide" : "Show"}</strong>
          </div>
        </button>
      ) : (
        <div className="ops-panel__header">
          <div>
            <p className="ops-panel__eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
          </div>
        </div>
      )}

      {(!collapsible || isOpen) && (
        <div
          className="ops-collapsible__content"
          id={collapsible ? "recent-snapshots-panel-content" : undefined}
        >
          {snapshots.length === 0 ? (
            <div className="ops-empty">
              <p>{emptyMessage}</p>
            </div>
          ) : (
            <div className="ops-list">
              {snapshots.map((snapshot) => (
                <article className="ops-list__item" key={snapshot.id}>
                  <div>
                    <h3>{formatRoutePatternLabel(snapshot.routeLabel, snapshot.patternLabel)}</h3>
                    <p>
                      {formatDateWithWeekday(snapshot.departureDate)} to{" "}
                      {formatDateWithWeekday(snapshot.returnDate)}
                    </p>
                    <p>
                      {snapshot.tripNights} nights · {snapshot.airlineSummary ?? "Airline pending"}
                    </p>
                    {snapshot.outboundDepartureAt && snapshot.outboundArrivalAt ? (
                      <p>
                        Out {formatFlightWeekdayClock(snapshot.outboundDepartureAt)} {"->"}{" "}
                        {formatFlightClock(snapshot.outboundArrivalAt)}
                        {snapshot.returnDepartureAt && snapshot.returnArrivalAt ? (
                          <>
                            <br />
                            Back {formatFlightWeekdayClock(snapshot.returnDepartureAt)} {"->"}{" "}
                            {formatFlightClock(snapshot.returnArrivalAt)}
                          </>
                        ) : null}
                      </p>
                    ) : null}
                    {snapshot.destinationStayHours !== null ? (
                      <p>{formatStayHours(snapshot.destinationStayHours)}</p>
                    ) : null}
                    <p>
                      {formatVerifiedAge(snapshot.scannedAt)} · {formatDateTime(snapshot.scannedAt)}
                    </p>
                    {snapshot.bookingUrl ? (
                      <p>
                        <a href={snapshot.bookingUrl} rel="noreferrer" target="_blank">
                          Open in Skyscanner
                        </a>
                      </p>
                    ) : null}
                  </div>
                  <span>{formatCurrency(snapshot.price, snapshot.currency)}</span>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
