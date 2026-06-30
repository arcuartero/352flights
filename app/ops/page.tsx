import {
  bulkReviewDealAction,
  deleteSubscriberAction,
  reviewDealAction,
  updateSubscriberAction,
} from "@/app/ops/actions";
import {
  OpsHealthNeverSnapshotCard,
  type OpsHealthDetailItem,
} from "@/components/ops-health-never-snapshot-card";
import { OpsReviewQueue } from "@/components/ops-review-queue";
import { OpsSubnav } from "@/components/ops-subnav";
import { getOpsDashboardData } from "@/lib/ops";
import { formatStayBucketLabel } from "@/lib/stay-buckets";

export const dynamic = "force-dynamic";

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

function formatRelativeBucket(bucket: string) {
  return formatStayBucketLabel(bucket);
}

function formatRoutingLabel(value: string) {
  if (value === "NON_STOP") {
    return "Non-stop only";
  }
  if (value === "ONE_STOP_OR_FEWER") {
    return "Up to 1 stop";
  }
  if (value === "TWO_OR_FEWER_STOPS") {
    return "Up to 2 stops";
  }
  return value;
}

function formatSubscriberStatusLabel(value: string) {
  if (value === "active") {
    return "Active";
  }
  if (value === "pending") {
    return "Pending";
  }
  if (value === "unsubscribed") {
    return "Unsubscribed";
  }
  return value;
}

function describeScannerHealthSeverity(severity: "warning" | "critical") {
  if (severity === "critical") {
    return {
      label: "Critical",
      threshold: "5+ missed runs",
      description:
        "This route has gone quiet for long enough that the pattern, schedule, or scan coverage probably needs attention.",
    };
  }

  return {
    label: "Warning",
    threshold: "3-4 missed runs",
    description:
      "This route has started missing fresh prices across recent runs. It may still recover, but it is worth watching.",
  };
}

function joinNaturalLanguage(items: string[]) {
  if (items.length === 0) {
    return "";
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function explainScannerHealthAlert(alert: {
  severity: "warning" | "critical";
  missedScanRuns: number;
  latestSeenAt: string | null;
  activeRuleCount: number;
  activeRuleLabels: string[];
  detectedDepartureSummary: string | null;
  latestScannerReasonLabel: string | null;
  latestScannerReasonDetail: string | null;
  latestScannerReasonAt: string | null;
  examplePatternLabel: string | null;
  likelyIssue:
    | "no_active_rules"
    | "no_detected_departures"
    | "no_matching_departures_for_rules"
    | "rules_and_dates_present_but_no_fresh_price";
}) {
  if (
    !alert.latestSeenAt &&
    alert.missedScanRuns < 3 &&
    alert.likelyIssue === "rules_and_dates_present_but_no_fresh_price"
  ) {
    return "This route still has not written its first fresh price snapshot. The rules and dates may look reasonable, but the scanner has not yet returned a usable result for this route.";
  }

  if (alert.likelyIssue === "no_active_rules") {
    return "This alert exists because the route has no active search rules inside the current 14-180 day price window, so the price scanner has nothing exact to search.";
  }

  if (alert.likelyIssue === "no_detected_departures") {
    return "This alert exists because the dates scanner did not detect any outbound departures for this route inside the current price window, so the price scanner cannot build exact date pairs from your rules.";
  }

  if (alert.likelyIssue === "no_matching_departures_for_rules") {
    const ruleSummary =
      alert.activeRuleLabels.length > 0
        ? `The active rule${alert.activeRuleLabels.length === 1 ? "" : "s"} ${joinNaturalLanguage(alert.activeRuleLabels.slice(0, 3))}${
            alert.activeRuleLabels.length > 3 ? ` and ${alert.activeRuleLabels.length - 3} more` : ""
          }`
        : `The ${alert.activeRuleCount} active rules`;
    const departureSummary = alert.detectedDepartureSummary
      ? `The dates scanner is seeing departures on ${alert.detectedDepartureSummary}.`
      : "The dates scanner is seeing some departures, but none that line up with the saved rules.";

    return `${ruleSummary} do not line up with the outbound dates currently being detected. ${departureSummary} That means the route is flying, but not on the exact weekday pattern the price scanner needs to search.`;
  }

  if (alert.severity === "critical") {
    if (!alert.latestSeenAt) {
      return `This alert exists because the route has already missed ${alert.missedScanRuns} tracked runs and has still never written a fresh price snapshot. The rules and dates may look valid, but the scanner is not getting any usable result back for them yet.`;
    }

    return `This alert exists because the route used to produce prices, but it has now missed ${alert.missedScanRuns} runs in a row without writing a new snapshot. In practice that usually means the flights are no longer matching the saved rule${alert.activeRuleCount === 1 ? "" : "s"}, or the live availability has changed enough that the scanner is no longer finding a valid winner.`;
  }

  return `This warning exists because the route has missed ${alert.missedScanRuns} recent runs, but not long enough to call it fully broken yet. It usually means the current schedule, exact weekday rule${alert.activeRuleCount === 1 ? "" : "s"}, or live price availability are starting to drift apart.`;
}

export default async function OpsPage() {
  const dashboard = await getOpsDashboardData();
  const buildHealthRouteDetail = (
    route: (typeof dashboard.scannerHealth.neverSnapshotRoutes)[number],
  ): OpsHealthDetailItem => ({
    id: route.routeId,
    title: route.routeLabel,
    subtitle:
      route.missedScanRuns > 0
        ? `${formatRelativeBucket(route.routeBucket)} · ${route.missedScanRuns} missed run${
            route.missedScanRuns === 1 ? "" : "s"
          }`
        : `${formatRelativeBucket(route.routeBucket)} · no snapshot yet`,
    statusLabel:
      route.missedScanRuns >= 5
        ? "Critical"
        : route.missedScanRuns >= 3
          ? "Warning"
          : "Pending",
    statusTone:
      route.missedScanRuns >= 5
        ? "critical"
        : route.missedScanRuns >= 3
          ? "warning"
          : "pending",
    explanation: explainScannerHealthAlert(route),
    routeRoutingLabel: formatRoutingLabel(route.routeRouting),
    rulesInWindowLabel: `Rules in window: ${route.activeRuleCount}`,
    lastSeenLabel: route.latestSeenAt
      ? `${formatVerifiedAge(route.latestSeenAt)} · ${formatDateTime(route.latestSeenAt)}`
      : "No snapshot yet",
    datesCheckedLabel: route.datesScannerLastCheckedAt
      ? formatDateTime(route.datesScannerLastCheckedAt)
      : null,
    latestPriceLabel: route.latestPrice !== null ? formatCurrency(route.latestPrice) : null,
    latestScannerReasonLabel: route.latestScannerReasonLabel,
    latestScannerReasonAtLabel: route.latestScannerReasonAt
      ? formatDateTime(route.latestScannerReasonAt)
      : null,
    latestScannerReasonDetail: route.latestScannerReasonDetail,
    detectedDepartureSummary: route.detectedDepartureSummary,
    activeRuleSummary:
      route.activeRuleLabels.length > 0
        ? `${route.activeRuleLabels.slice(0, 3).join(", ")}${
            route.activeRuleLabels.length > 3 ? ` +${route.activeRuleLabels.length - 3} more` : ""
          }`
        : null,
    childSummaryLabel: null,
    examplePatternLabel: route.examplePatternLabel,
    exampleDatePairLabel:
      route.exampleDepartureDate && route.exampleReturnDate
        ? `Out ${route.exampleDepartureDate} · Back ${route.exampleReturnDate}`
        : null,
    exampleBookingUrl: route.exampleBookingUrl,
  });

  const latestRunMissingRouteDetails = dashboard.scannerHealth.latestRunMissingRoutes.map(
    buildHealthRouteDetail,
  );

  const neverSnapshotByDestination = new Map<
    string,
    (typeof dashboard.scannerHealth.neverSnapshotRoutes)
  >();
  for (const route of dashboard.scannerHealth.neverSnapshotRoutes) {
    const key = `${route.destinationAirport}::${route.destinationCity}`;
    const current = neverSnapshotByDestination.get(key) ?? [];
    current.push(route);
    neverSnapshotByDestination.set(key, current);
  }

  const neverSnapshotDestinationDetails: OpsHealthDetailItem[] = [...neverSnapshotByDestination.values()]
    .map((routesForDestination) => {
      const [firstRoute] = routesForDestination;
      const destinationLabel = `${firstRoute.destinationCity} (${firstRoute.destinationAirport})`;
      const worstSeverity: OpsHealthDetailItem["statusTone"] = routesForDestination.some(
        (route) => route.missedScanRuns >= 5,
      )
        ? "critical"
        : routesForDestination.some((route) => route.missedScanRuns >= 3)
          ? "warning"
          : "pending";
      const latestIssueRoute =
        routesForDestination
          .filter((route) => route.latestScannerReasonLabel)
          .sort((left, right) => {
            const leftTime = left.latestScannerReasonAt
              ? new Date(left.latestScannerReasonAt).getTime()
              : 0;
            const rightTime = right.latestScannerReasonAt
              ? new Date(right.latestScannerReasonAt).getTime()
              : 0;
            return rightTime - leftTime;
          })[0] ?? null;
      const latestCheckedAt =
        routesForDestination
          .map((route) => route.datesScannerLastCheckedAt)
          .filter((value): value is string => Boolean(value))
          .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
      const setupLabels = [...new Set(
        routesForDestination.map(
          (route) => `${formatRelativeBucket(route.routeBucket)} · ${formatRoutingLabel(route.routeRouting)}`,
        ),
      )];
      const combinedRuleLabels = [...new Set(routesForDestination.flatMap((route) => route.activeRuleLabels))];
      const combinedDepartureSummaries = [...new Set(
        routesForDestination
          .map((route) => route.detectedDepartureSummary)
          .filter((value): value is string => Boolean(value)),
      )];
      const exampleRoute =
        routesForDestination.find((route) => route.exampleBookingUrl || route.examplePatternLabel) ??
        routesForDestination[0];
      const totalRulesInWindow = routesForDestination.reduce(
        (sum, route) => sum + route.activeRuleCount,
        0,
      );

      let explanation = `${destinationLabel} has ${routesForDestination.length} active route setup${
        routesForDestination.length === 1 ? "" : "s"
      }, but none has produced a price snapshot yet.`;
      if (latestIssueRoute?.latestScannerReasonLabel) {
        explanation += ` Latest scanner signal: ${formatRelativeBucket(
          latestIssueRoute.routeBucket,
        )} · ${formatRoutingLabel(
          latestIssueRoute.routeRouting,
        )} · ${latestIssueRoute.latestScannerReasonLabel.toLowerCase()}.`;
      } else if (routesForDestination.some((route) => route.activeRuleCount === 0)) {
        explanation += " Some setups still have no active rules in the current scan window.";
      } else {
        explanation += " The destination is tracked, but the current setups still are not producing a usable winner.";
      }

      return {
        id: `destination:${firstRoute.destinationAirport}`,
        title: destinationLabel,
        subtitle: `${routesForDestination.length} route setup${
          routesForDestination.length === 1 ? "" : "s"
        } · no price snapshot yet`,
        statusLabel:
          worstSeverity === "critical"
            ? "Critical"
            : worstSeverity === "warning"
              ? "Warning"
              : "Pending",
        statusTone: worstSeverity,
        explanation,
        routeRoutingLabel: null,
        rulesInWindowLabel: `Rules in window: ${totalRulesInWindow} across ${routesForDestination.length} route${
          routesForDestination.length === 1 ? "" : "s"
        }`,
        lastSeenLabel: "No snapshot yet",
        datesCheckedLabel: latestCheckedAt ? formatDateTime(latestCheckedAt) : null,
        latestPriceLabel: null,
        latestScannerReasonLabel: latestIssueRoute?.latestScannerReasonLabel ?? null,
        latestScannerReasonAtLabel: latestIssueRoute?.latestScannerReasonAt
          ? formatDateTime(latestIssueRoute.latestScannerReasonAt)
          : null,
        latestScannerReasonDetail: latestIssueRoute?.latestScannerReasonDetail ?? null,
        detectedDepartureSummary:
          combinedDepartureSummaries.length > 0
            ? combinedDepartureSummaries.slice(0, 2).join(" · ")
            : null,
        activeRuleSummary:
          combinedRuleLabels.length > 0
            ? `${combinedRuleLabels.slice(0, 4).join(", ")}${
                combinedRuleLabels.length > 4 ? ` +${combinedRuleLabels.length - 4} more` : ""
              }`
            : null,
        childSummaryLabel:
          setupLabels.length > 0
            ? `Route setups: ${setupLabels.join("; ")}`
            : `${routesForDestination.length} route setup${
                routesForDestination.length === 1 ? "" : "s"
              }`,
        examplePatternLabel: exampleRoute.examplePatternLabel,
        exampleDatePairLabel:
          exampleRoute.exampleDepartureDate && exampleRoute.exampleReturnDate
            ? `Out ${exampleRoute.exampleDepartureDate} · Back ${exampleRoute.exampleReturnDate}`
            : null,
        exampleBookingUrl: exampleRoute.exampleBookingUrl,
      };
    })
    .sort((left, right) => left.title.localeCompare(right.title));

  return (
    <main className="ops-shell">
      {dashboard.onboardingMessage ? (
        <section className="ops-banner" role="status">
          <p>{dashboard.onboardingMessage}</p>
        </section>
      ) : null}

      <OpsSubnav />

      <section className="ops-metrics" aria-label="Operational metrics">
        <article>
          <span>Subscribers</span>
          <strong>{dashboard.metrics.subscribers}</strong>
        </article>
        <article>
          <span>Active routes</span>
          <strong>{dashboard.metrics.activeRoutes}</strong>
        </article>
        <article>
          <span>New deals</span>
          <strong>{dashboard.metrics.newDeals}</strong>
        </article>
        <article>
          <span>Snapshots in 24h</span>
          <strong>{dashboard.metrics.snapshots24h}</strong>
        </article>
      </section>

      <section className="ops-state-strip" aria-label="Deal lifecycle states">
        <article>
          <span>New</span>
          <strong>{dashboard.dealStateCounts.new}</strong>
        </article>
        <article>
          <span>Reviewed</span>
          <strong>{dashboard.dealStateCounts.reviewed}</strong>
        </article>
        <article>
          <span>Sent</span>
          <strong>{dashboard.dealStateCounts.sent}</strong>
        </article>
        <article>
          <span>Expired</span>
          <strong>{dashboard.dealStateCounts.expired}</strong>
        </article>
      </section>

      <section className="ops-panel ops-panel--wide">
        <div className="ops-panel__header">
          <div>
            <p className="ops-panel__eyebrow">Audience</p>
            <h2>Subscribers</h2>
          </div>
          <p>Edit core subscriber fields here, or open the saved preference page for the full profile.</p>
        </div>

        {dashboard.subscribers.length === 0 ? (
          <div className="ops-empty">
            <p>No subscribers found yet.</p>
          </div>
        ) : (
          <div className="ops-list ops-subscriber-list">
            {dashboard.subscribers.map((subscriber) => (
              <article
                className="ops-list__item ops-list__item--stacked ops-subscriber-card"
                key={subscriber.id}
              >
                <div className="ops-subscriber-card__header">
                  <div className="ops-subscriber-card__copy">
                    <h3>{subscriber.email}</h3>
                    <p>
                      {subscriber.homeAirport} · {subscriber.source} · joined{" "}
                      {formatDateTime(subscriber.createdAt)}
                    </p>
                  </div>
                  <div className="ops-subscriber-card__badges">
                    <span
                      className={`ops-send-badge ${
                        subscriber.status === "active"
                          ? "is-live"
                          : subscriber.status === "unsubscribed"
                            ? "is-blocked"
                            : ""
                      }`}
                    >
                      {formatSubscriberStatusLabel(subscriber.status)}
                    </span>
                    <span className="ops-pill">
                      {subscriber.emailConfirmed ? "Email confirmed" : "Email pending"}
                    </span>
                    <span className="ops-pill">
                      {subscriber.onboardingCompleted ? "Profile saved" : "Profile incomplete"}
                    </span>
                  </div>
                </div>

                <div className="ops-pill-row">
                  <span className="ops-pill">
                    Delivery: {subscriber.deliveryModes.join(", ") || "n/a"}
                  </span>
                  <span className="ops-pill">
                    Weekdays: {subscriber.departureWeekdays.join(", ") || "n/a"}
                  </span>
                  <span className="ops-pill">
                    Stops: {subscriber.maxStopsPreferences.join(", ") || "n/a"}
                  </span>
                  <span className="ops-pill">
                    Budget:{" "}
                    {subscriber.budgetCeilingEur !== null
                      ? formatCurrency(subscriber.budgetCeilingEur)
                      : "No cap"}
                  </span>
                  <span className="ops-pill">
                    Routes:{" "}
                    {subscriber.selectedRouteLabels.length > 0
                      ? `${subscriber.selectedRouteLabels.slice(0, 2).join(", ")}${
                          subscriber.selectedRouteLabels.length > 2
                            ? ` +${subscriber.selectedRouteLabels.length - 2} more`
                            : ""
                        }`
                      : "Any destination"}
                  </span>
                  <span className="ops-pill">
                    Custom alerts: {subscriber.customAlertRules.length}
                  </span>
                </div>

                <div className="ops-subscriber-card__actions">
                  <a
                    className="ops-button ops-button--compact ops-button--linkout"
                    href={subscriber.managePreferencesPath}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open preferences ↗
                  </a>

                  <details className="ops-subscriber-editor">
                    <summary className="ops-button ops-button--compact ops-button--ghost">
                      Edit subscriber
                    </summary>
                    <form action={updateSubscriberAction} className="ops-review-controls ops-review-controls--subscribers">
                      <input name="id" type="hidden" value={subscriber.id} />
                      <label className="ops-review-control">
                        <span>Email</span>
                        <input defaultValue={subscriber.email} name="email" type="email" />
                      </label>
                      <label className="ops-review-control">
                        <span>Status</span>
                        <select defaultValue={subscriber.status} name="status">
                          <option value="pending">Pending</option>
                          <option value="active">Active</option>
                          <option value="unsubscribed">Unsubscribed</option>
                        </select>
                      </label>
                      <label className="ops-review-control">
                        <span>Home airport</span>
                        <input defaultValue={subscriber.homeAirport} name="homeAirport" type="text" />
                      </label>
                      <label className="ops-toggle">
                        <input defaultChecked={subscriber.emailConfirmed} name="emailConfirmed" type="checkbox" />
                        <span>Email confirmed</span>
                      </label>
                      <label className="ops-toggle">
                        <input
                          defaultChecked={subscriber.onboardingCompleted}
                          name="onboardingCompleted"
                          type="checkbox"
                        />
                        <span>Onboarding completed</span>
                      </label>
                      <button className="ops-button ops-button--compact ops-button--approve" type="submit">
                        Save changes
                      </button>
                    </form>
                  </details>

                  <form action={deleteSubscriberAction}>
                    <input name="id" type="hidden" value={subscriber.id} />
                    <button className="ops-button ops-button--compact ops-button--ghost" type="submit">
                      Delete subscriber
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="ops-grid">
        <section className="ops-panel ops-panel--wide">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Health</p>
              <h2>Scanner health</h2>
            </div>
            <p>
              Flags routes that missed fresh prices in 3 or more recent snapshot-writing runs.
            </p>
          </div>

          <dl className="ops-send-stats">
            <div>
              <dt>Latest snapshot run</dt>
              <dd>{formatDateTime(dashboard.scannerHealth.latestRunAt)}</dd>
            </div>
            <div>
              <dt>Previous snapshot run</dt>
              <dd>{formatDateTime(dashboard.scannerHealth.previousRunAt)}</dd>
            </div>
            <div>
              <dt>Latest snapshot coverage</dt>
              <dd>
                {dashboard.scannerHealth.routesSeenInLatestRun}/{dashboard.scannerHealth.activeRoutes}
              </dd>
            </div>
            <div>
              <dt>Routes flagged</dt>
              <dd>{dashboard.scannerHealth.routesMissingData}</dd>
            </div>
            <OpsHealthNeverSnapshotCard
              count={dashboard.scannerHealth.routesMissingLatestRun}
              dialogDescription={
                dashboard.scannerHealth.latestRunAt
                  ? `${dashboard.scannerHealth.routesMissingLatestRun} active ${
                      dashboard.scannerHealth.routesMissingLatestRun === 1 ? "route was" : "routes were"
                    } missing a fresh price in the latest snapshot-writing run.`
                  : "No completed snapshot-writing run is visible yet."
              }
              dialogTitle="Routes without a fresh price in the latest run"
              hintLabel="Open details"
              countLabel={`${dashboard.scannerHealth.routesMissingLatestRun} route${
                dashboard.scannerHealth.routesMissingLatestRun === 1 ? "" : "s"
              }`}
              items={latestRunMissingRouteDetails}
              title="No price in latest run"
            />
            <OpsHealthNeverSnapshotCard
              count={neverSnapshotDestinationDetails.length}
              dialogDescription={
                neverSnapshotDestinationDetails.length === 1
                  ? "1 destination still has no route setup with a recorded price snapshot."
                  : `${neverSnapshotDestinationDetails.length} destinations still have no route setup with a recorded price snapshot.`
              }
              dialogTitle="Destinations with no price snapshot yet"
              hintLabel="Open details"
              countLabel={`${neverSnapshotDestinationDetails.length} destination${
                neverSnapshotDestinationDetails.length === 1 ? "" : "s"
              }`}
              items={neverSnapshotDestinationDetails}
              title="Destinations with no price yet"
            />
          </dl>

          <div className="ops-health-legend" aria-label="Scanner health severity guide">
            {(["warning", "critical"] as const).map((severity) => {
              const explanation = describeScannerHealthSeverity(severity);
              return (
                <article className="ops-health-legend__item" key={severity}>
                  <div className="ops-health-legend__header">
                    <span
                      className={`ops-send-badge ${
                        severity === "critical" ? "is-critical" : "is-warning"
                      }`}
                    >
                      {explanation.label}
                    </span>
                    <strong>{explanation.threshold}</strong>
                  </div>
                  <p>{explanation.description}</p>
                </article>
              );
            })}
          </div>

          {dashboard.scannerHealth.recentRunCount === 0 ? (
            <div className="ops-empty">
              <p>No completed scan runs are visible yet, so there is no health signal to evaluate.</p>
            </div>
          ) : dashboard.scannerHealth.alerts.length === 0 ? (
            <div className="ops-empty">
              <p>
                Healthy right now. Across the last {dashboard.scannerHealth.recentRunCount} tracked
                scan runs, every active route has written at least one fresh price recently.
              </p>
            </div>
          ) : (
            <details className="ops-health-alerts-collapsible">
              <summary className="ops-collapsible__toggle ops-collapsible__toggle--alerts">
                <div>
                  <p className="ops-panel__eyebrow">Alert details</p>
                  <h2>Open flagged route details</h2>
                </div>
                <div className="ops-collapsible__meta">
                  <span>{dashboard.scannerHealth.alerts.length} routes flagged</span>
                  <strong>Open details</strong>
                </div>
              </summary>
              <div className="ops-collapsible__content">
                <div className="ops-list">
                  {dashboard.scannerHealth.alerts.map((alert) => (
                    <article className="ops-list__item ops-list__item--stacked" key={alert.routeId}>
                      <div className="ops-list__stack ops-health-alert__details">
                        <div className="ops-health-alert__header">
                          <div>
                            <h3>{alert.routeLabel}</h3>
                            <p>
                              {formatRelativeBucket(alert.routeBucket)} · missed {alert.missedScanRuns}{" "}
                              recent scan runs
                            </p>
                          </div>
                          <span
                            className={`ops-send-badge ${
                              alert.severity === "critical" ? "is-critical" : "is-warning"
                            }`}
                          >
                            {alert.severity === "critical" ? "Critical" : "Warning"}
                          </span>
                        </div>
                      <p className="ops-health-alert__explanation">{explainScannerHealthAlert(alert)}</p>
                      <div className="ops-pill-row">
                        <span className="ops-pill">Routing: {formatRoutingLabel(alert.routeRouting)}</span>
                        <span className="ops-pill">Rules in window: {alert.activeRuleCount}</span>
                        <span className="ops-pill">
                          Last seen:{" "}
                          {alert.latestSeenAt
                            ? `${formatVerifiedAge(alert.latestSeenAt)} · ${formatDateTime(alert.latestSeenAt)}`
                            : "No snapshot yet"}
                        </span>
                        {alert.datesScannerLastCheckedAt ? (
                          <span className="ops-pill">
                            Dates checked: {formatDateTime(alert.datesScannerLastCheckedAt)}
                          </span>
                        ) : null}
                        {alert.latestPrice !== null ? (
                          <span className="ops-pill">Last price: {formatCurrency(alert.latestPrice)}</span>
                        ) : null}
                        {alert.latestScannerReasonLabel ? (
                          <span className="ops-pill">
                            Scanner reason: {alert.latestScannerReasonLabel}
                            {alert.latestScannerReasonAt
                              ? ` · ${formatDateTime(alert.latestScannerReasonAt)}`
                              : ""}
                          </span>
                        ) : null}
                        {alert.detectedDepartureSummary ? (
                          <span className="ops-pill">Departures: {alert.detectedDepartureSummary}</span>
                        ) : null}
                        {alert.activeRuleLabels.length > 0 ? (
                          <span className="ops-pill">
                            Rule set: {alert.activeRuleLabels.slice(0, 3).join(", ")}
                            {alert.activeRuleLabels.length > 3
                              ? ` +${alert.activeRuleLabels.length - 3} more`
                              : ""}
                          </span>
                        ) : null}
                      </div>
                      {alert.latestScannerReasonLabel && alert.latestScannerReasonDetail ? (
                        <div className="ops-health-alert__latest-reason">
                          <strong>Latest scanner reason: {alert.latestScannerReasonLabel}</strong>
                          <p>{alert.latestScannerReasonDetail}</p>
                        </div>
                      ) : null}
                      {(alert.examplePatternLabel || alert.exampleBookingUrl) ? (
                        <div className="ops-health-alert__manual">
                          <div className="ops-health-alert__manual-copy">
                            <strong>Manual check</strong>
                            <p>
                              {alert.examplePatternLabel ? `${alert.examplePatternLabel} · ` : ""}
                              {alert.exampleDepartureDate && alert.exampleReturnDate
                                ? `Out ${alert.exampleDepartureDate} · Back ${alert.exampleReturnDate}`
                                : "No exact date pair available from current rules and detected dates."}
                            </p>
                          </div>
                          {alert.exampleBookingUrl ? (
                            <a
                              className="ops-button ops-button--compact ops-button--linkout"
                              href={alert.exampleBookingUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Skyscanner ↗
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </details>
          )}
        </section>
        <OpsReviewQueue
          bulkReviewDealAction={bulkReviewDealAction}
          deals={dashboard.newDeals}
          priceSeries={dashboard.newDealSeries}
          reviewDealAction={reviewDealAction}
          totalNewDeals={dashboard.metrics.newDeals}
        />

      </section>
    </main>
  );
}
