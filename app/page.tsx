import { NewsletterForm } from "@/components/newsletter-form";
import {
  highlightedRoutes,
  routeBuckets,
  sampleDeals,
  workflowSteps,
} from "@/lib/content";
import { formatRouteStayLabel } from "@/lib/route-stay";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero__grain" />
        <div className="hero__skyline" aria-hidden="true" />

        <div className="hero__content">
          <div className="hero__copy">
            <p className="hero__kicker">Luxembourg departure intelligence</p>
            <h1 className="hero__title">
              The cheap-flight letter built for people who actually leave from LUX.
            </h1>
            <p className="hero__lede">
              We scan flexible-date routes from <strong>LUX</strong>, track the baseline, and
              send only the drops that feel worth opening your inbox for.
            </p>
            <NewsletterForm />

            <dl className="hero__facts" aria-label="Launch facts">
              <div>
                <dt>17 seeded routes</dt>
                <dd>Balanced across weekend breaks, sun trips, and long-haul headlines.</dd>
              </div>
              <div>
                <dt>1 airport to start</dt>
                <dd>Luxembourg first, then expand once click data proves demand.</dd>
              </div>
              <div>
                <dt>Editorial by default</dt>
                <dd>Quiet when prices are normal, louder only when the drop is real.</dd>
              </div>
            </dl>
          </div>

          <div className="hero__visual" aria-hidden="true">
            <div className="atlas">
              <p className="atlas__eyebrow">Live watchboard</p>
              <div className="atlas__halo" />
              <div className="atlas__origin">
                <span>LUX</span>
                <small>Luxembourg</small>
              </div>

              {sampleDeals.map((deal, index) => (
                <article
                  className={`atlas__route atlas__route--${index + 1}`}
                  key={`${deal.airport}-${deal.timing}`}
                >
                  <div className="atlas__line" />
                  <div className="atlas__destination">
                    <span>{deal.airport}</span>
                    <small>{deal.destination}</small>
                  </div>
                  <p className="atlas__fare">{deal.price}</p>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className="hero__ticker" aria-label="Sample routes in rotation">
          {sampleDeals.map((deal) => (
            <article className="hero__ticker-item" key={`${deal.airport}-${deal.bucket}`}>
              <p>{deal.destination}</p>
              <span>
                {deal.price} · {deal.drop} below usual
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="section section--signals">
        <div className="section__intro">
          <p className="section__label">Daily output</p>
          <h2 className="section__title">
            The send should read like a sharp local operator, not a generic fare dump.
          </h2>
          <p className="section__body">
            Each issue highlights a few routes worth acting on, anchored in a baseline so the copy
            can say why the price matters.
          </p>
        </div>

        <div className="signal-list" aria-label="Sample deal lines">
          {sampleDeals.map((deal) => (
            <article className="signal-list__item" key={`${deal.airport}-${deal.price}`}>
              <p className="signal-list__bucket">{deal.bucket}</p>
              <div className="signal-list__headline">
                <h3>
                  Luxembourg to {deal.destination} at {deal.price}
                </h3>
                <p>{deal.timing}</p>
              </div>
              <div className="signal-list__delta">
                <strong>{deal.drop} below recent baseline</strong>
                <span>Usually around {deal.baseline}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section section--workflow">
        <div className="section__intro">
          <p className="section__label">Method</p>
          <h2 className="section__title">A tight stack for scanning, scoring, and publishing.</h2>
          <p className="section__body">
            The product works like a route desk: search continuously, compare against memory, then
            publish only what clears the bar.
          </p>
        </div>
        <div className="workflow">
          {workflowSteps.map((step, index) => (
            <article className="workflow__step" key={step.title}>
              <p className="workflow__index">0{index + 1}</p>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section section--routes">
        <div className="section__intro">
          <p className="section__label">Luxembourg coverage</p>
          <h2 className="section__title">Seeded route buckets for the first month of sends.</h2>
        </div>

        <div className="bucket-list">
          {routeBuckets.map((bucket) => (
            <article className="bucket-list__item" key={bucket.key}>
              <h3>{bucket.label}</h3>
              <p>{bucket.detail}</p>
            </article>
          ))}
        </div>

        <div className="route-table" role="table" aria-label="Seeded destinations">
          <div className="route-table__head" role="rowgroup">
            <div className="route-table__row" role="row">
              <span role="columnheader">Destination</span>
              <span role="columnheader">Bucket</span>
              <span role="columnheader">Scanner range</span>
              <span role="columnheader">Why it stays on the list</span>
            </div>
          </div>
          <div className="route-table__body" role="rowgroup">
            {highlightedRoutes.map((route) => (
              <div
                className="route-table__row route-table__row--body"
                key={`${route.destination_airport}-${route.bucket}`}
                role="row"
              >
                <span role="cell">
                  {route.destination_city} <small>{route.destination_airport}</small>
                </span>
                <span role="cell">{route.bucket.replace("_", " ")}</span>
                <span role="cell">
                  {formatRouteStayLabel({
                    tripNights: route.trip_nights,
                    minTripNights: route.min_trip_nights ?? null,
                    maxTripNights: route.max_trip_nights ?? null,
                  })}
                </span>
                <span role="cell">{route.teaser}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--cta">
        <p className="section__label">Launch posture</p>
        <h2 className="section__title">Start narrow, prove appetite, then expand the map.</h2>
        <p className="section__body section__body--narrow">
          The scanner begins with Luxembourg Airport only. Once we know what people click, we can
          expand to nearby departure airports or paid tiers without rebuilding the stack.
        </p>
        <NewsletterForm />
      </section>
    </main>
  );
}
