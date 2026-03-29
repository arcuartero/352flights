import { reviewDealAction } from "@/app/ops/actions";
import { CampaignLauncher } from "@/components/campaign-launcher";
import { OpsSubnav } from "@/components/ops-subnav";
import { getOpsDashboardData } from "@/lib/ops";
import { formatRouteStayLabel } from "@/lib/route-stay";

export const dynamic = "force-dynamic";

function formatCurrency(value: number, currency: string = "EUR") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatRelativeBucket(bucket: string) {
  return bucket.replaceAll("_", " ");
}

function formatDeliveryMode(value: string) {
  if (value === "daily_digest") {
    return "Daily digest";
  }

  if (value === "flash_only") {
    return "Flash only";
  }

  if (value === "weekly_best_of") {
    return "Weekly best-of";
  }

  return value.replaceAll("_", " ");
}

function formatStops(value: string) {
  if (value === "NON_STOP") {
    return "Non-stop only";
  }

  if (value === "ONE_STOP_OR_FEWER") {
    return "Up to 1 stop";
  }

  if (value === "ANY") {
    return "Any routing";
  }

  return value.replaceAll("_", " ");
}

function formatTripRange(minNights: number | null, maxNights: number | null) {
  if (minNights === null && maxNights === null) {
    return "Any stay length";
  }

  if (minNights !== null && maxNights !== null) {
    return `${minNights}-${maxNights} nights`;
  }

  if (minNights !== null) {
    return `${minNights}+ nights`;
  }

  return `Up to ${maxNights} nights`;
}

function formatCampaignStatus(status: string) {
  if (status === "sent") {
    return "Sent";
  }

  if (status === "partial") {
    return "Partial";
  }

  if (status === "failed") {
    return "Failed";
  }

  return status;
}

function formatSendType(sendType: string) {
  return sendType === "flash" ? "Flash" : "Digest";
}

export default async function OpsPage() {
  const dashboard = await getOpsDashboardData();

  return (
    <main className="ops-shell">
      <section className="ops-hero">
        <div>
          <p className="ops-eyebrow">Lux Flight Deals Ops</p>
          <h1>Operations board for review, audience fit, and campaign dispatch.</h1>
          <p>
            Approve inbound drops, inspect subscriber preferences, and launch sends only when the
            route match looks clean.
          </p>
        </div>
        <div className="ops-auth-note">
          <span>Protected route</span>
          <strong>/ops</strong>
        </div>
      </section>

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
          <span>Pending deals</span>
          <strong>{dashboard.metrics.pendingDeals}</strong>
        </article>
        <article>
          <span>Snapshots in 24h</span>
          <strong>{dashboard.metrics.snapshots24h}</strong>
        </article>
      </section>

      <section className="ops-grid">
        <section className="ops-panel ops-panel--wide">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Campaigns</p>
              <h2>Send queue</h2>
            </div>
            <p>Approved deals only. Audience counts are matched against saved subscriber filters.</p>
          </div>
          <CampaignLauncher previews={dashboard.sendQueue} />
        </section>

        <section className="ops-panel ops-panel--wide">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Review queue</p>
              <h2>Pending deals</h2>
            </div>
            <p>{dashboard.pendingDeals.length} visible right now</p>
          </div>

          {dashboard.pendingDeals.length === 0 ? (
            <div className="ops-empty">
              <p>
                No deals are waiting for review yet. Once the scanner builds enough price history
                and sees a drop below your threshold, candidates will appear here.
              </p>
            </div>
          ) : (
            <div className="ops-deals">
              {dashboard.pendingDeals.map((deal) => (
                <article className="ops-deal" key={deal.id}>
                  <div className="ops-deal__main">
                    <div className="ops-deal__heading">
                      <p className="ops-tag">{formatRelativeBucket(deal.routeBucket)}</p>
                      <h3>{deal.title}</h3>
                    </div>
                    <p className="ops-deal__summary">{deal.summary}</p>
                    <dl className="ops-deal__facts">
                      <div>
                        <dt>Route</dt>
                        <dd>{deal.routeLabel}</dd>
                      </div>
                      <div>
                        <dt>Travel window</dt>
                        <dd>
                          {formatDate(deal.departureDate)} to {formatDate(deal.returnDate)}
                        </dd>
                      </div>
                      <div>
                        <dt>Deal price</dt>
                        <dd>{formatCurrency(deal.dealPrice)}</dd>
                      </div>
                      <div>
                        <dt>Baseline</dt>
                        <dd>
                          {deal.baselinePrice ? formatCurrency(deal.baselinePrice) : "Not enough data"}
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
                        <dt>Send type</dt>
                        <dd>{formatSendType(deal.sendType)}</dd>
                      </div>
                      <div>
                        <dt>Trip shape</dt>
                        <dd>
                          {deal.tripNights} nights · {formatStops(deal.maxStops)}
                        </dd>
                      </div>
                      <div>
                        <dt>Airline</dt>
                        <dd>{deal.airlineSummary ?? "Awaiting itinerary detail"}</dd>
                      </div>
                      <div>
                        <dt>Queued</dt>
                        <dd>{formatDate(deal.createdAt)}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="ops-deal__actions">
                    {deal.bookingUrl ? (
                      <a
                        className="ops-button ops-button--ghost"
                        href={deal.bookingUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open in Skyscanner
                      </a>
                    ) : null}
                    <form action={reviewDealAction}>
                      <input name="id" type="hidden" value={deal.id} />
                      <input name="status" type="hidden" value="approved" />
                      <button className="ops-button ops-button--approve" type="submit">
                        Approve
                      </button>
                    </form>
                    <form action={reviewDealAction}>
                      <input name="id" type="hidden" value={deal.id} />
                      <input name="status" type="hidden" value="rejected" />
                      <button className="ops-button ops-button--ghost" type="submit">
                        Reject
                      </button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="ops-panel">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Audience</p>
              <h2>Latest subscribers</h2>
            </div>
          </div>
          {dashboard.subscribers.length === 0 ? (
            <div className="ops-empty">
              <p>No subscribers yet. Once the landing page is live, new emails will land here.</p>
            </div>
          ) : (
            <div className="ops-list">
              {dashboard.subscribers.map((subscriber) => (
                <article className="ops-list__item ops-list__item--stacked" key={subscriber.id}>
                  <div className="ops-list__stack">
                    <div>
                      <h3>{subscriber.email}</h3>
                      <p>
                        {subscriber.source} · {subscriber.status} ·{" "}
                        {subscriber.onboardingCompleted ? "preferences saved" : "preferences pending"}
                      </p>
                    </div>
                    <div className="ops-pill-row">
                      <span className="ops-pill">{formatDeliveryMode(subscriber.deliveryMode)}</span>
                      <span className="ops-pill">{formatStops(subscriber.maxStopsPreference)}</span>
                      <span className="ops-pill">
                        {formatTripRange(subscriber.minTripNights, subscriber.maxTripNights)}
                      </span>
                      {subscriber.budgetCeilingEur !== null ? (
                        <span className="ops-pill">
                          Budget {formatCurrency(subscriber.budgetCeilingEur)}
                        </span>
                      ) : null}
                    </div>
                    <p className="ops-subscriber-note">
                      Buckets: {subscriber.preferredBuckets.map(formatRelativeBucket).join(", ")}
                    </p>
                    <p className="ops-subscriber-note">
                      Routes:{" "}
                      {subscriber.selectedRouteLabels.length > 0
                        ? subscriber.selectedRouteLabels.slice(0, 4).join(", ")
                        : "No explicit route picks yet"}
                    </p>
                  </div>
                  <span>{formatDate(subscriber.createdAt)}</span>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="ops-panel">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Campaigns</p>
              <h2>Recent sends</h2>
            </div>
          </div>
          {dashboard.recentCampaigns.length === 0 ? (
            <div className="ops-empty">
              <p>No campaigns have been sent yet. Approve deals and launch a digest from above.</p>
            </div>
          ) : (
            <div className="ops-list">
              {dashboard.recentCampaigns.map((campaign) => (
                <article className="ops-list__item ops-list__item--stacked" key={campaign.id}>
                  <div className="ops-list__stack">
                    <div>
                      <h3>{campaign.subject}</h3>
                      <p>
                        {formatSendType(campaign.sendType)} · {formatCampaignStatus(campaign.status)} ·{" "}
                        {campaign.sentCount}/{campaign.recipientCount} sent
                        {campaign.failedCount > 0 ? ` · ${campaign.failedCount} failed` : ""}
                      </p>
                    </div>
                    {campaign.routeLabels.length > 0 ? (
                      <div className="ops-pill-row">
                        {campaign.routeLabels.slice(0, 3).map((routeLabel) => (
                          <span className="ops-pill" key={routeLabel}>
                            {routeLabel}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <span>{formatDate(campaign.sentAt ?? campaign.createdAt)}</span>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="ops-panel">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Scanner output</p>
              <h2>Recent snapshots</h2>
            </div>
          </div>
          {dashboard.recentSnapshots.length === 0 ? (
            <div className="ops-empty">
              <p>No snapshots stored in Supabase yet. Run the scanner after the schema is applied.</p>
            </div>
          ) : (
            <div className="ops-list">
              {dashboard.recentSnapshots.map((snapshot) => (
                <article className="ops-list__item" key={snapshot.id}>
                  <div>
                    <h3>{snapshot.routeLabel}</h3>
                    <p>
                      {formatDate(snapshot.departureDate)} to {formatDate(snapshot.returnDate)}
                    </p>
                    <p>
                      {snapshot.tripNights} nights · {snapshot.airlineSummary ?? "Airline pending"}
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
        </section>

        <section className="ops-panel ops-panel--wide">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Coverage</p>
              <h2>Active route grid</h2>
            </div>
            <p>{dashboard.routes.length} seeded routes</p>
          </div>

          {dashboard.routes.length === 0 ? (
            <div className="ops-empty">
              <p>Run the SQL seeds first and the route table will populate here.</p>
            </div>
          ) : (
            <div className="ops-route-table" role="table" aria-label="Active route grid">
              <div className="ops-route-table__row ops-route-table__row--head" role="row">
                <span role="columnheader">Route</span>
                <span role="columnheader">Bucket</span>
                <span role="columnheader">Search range</span>
                <span role="columnheader">Stops</span>
                <span role="columnheader">Status</span>
              </div>
              {dashboard.routes.map((route) => (
                <div className="ops-route-table__row" key={route.id} role="row">
                  <span role="cell">{route.label}</span>
                  <span role="cell">{formatRelativeBucket(route.bucket)}</span>
                  <span role="cell">
                    {formatRouteStayLabel({
                      tripNights: route.tripNights,
                      minTripNights: route.minTripNights,
                      maxTripNights: route.maxTripNights,
                    })}
                  </span>
                  <span role="cell">{formatStops(route.maxStops)}</span>
                  <span role="cell">{route.isActive ? "active" : "paused"}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
