import { unsubscribeSubscriberByToken } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

type UnsubscribePageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

export default async function UnsubscribePage({ searchParams }: UnsubscribePageProps) {
  const params = await searchParams;
  const token = params.token;

  if (!token) {
    return (
      <main className="preferences-shell">
        <section className="preferences-hero">
          <div className="preferences-hero__grid">
            <div>
              <p className="preferences-kicker">Unsubscribe</p>
              <h1>That unsubscribe link is incomplete.</h1>
              <p>Open the latest email footer again, or go back to the homepage to subscribe later.</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  try {
    const result = await unsubscribeSubscriberByToken(token);

    return (
      <main className="preferences-shell">
        <section className="preferences-hero">
          <div className="preferences-hero__grid">
            <div>
              <p className="preferences-kicker">Unsubscribe</p>
              <h1>
                {result.alreadyUnsubscribed
                  ? "This address was already unsubscribed."
                  : "You have been unsubscribed from Lux Flight Deals."}
              </h1>
              <p>
                {result.email} will stop receiving digests and flash alerts. You can still reopen
                your preferences if you want to rejoin later.
              </p>
            </div>
          </div>
        </section>

        <section className="preferences-panel">
          <div className="preferences-empty preferences-empty--stacked">
            <a className="preferences-link preferences-link--ghost" href={result.preferencePath}>
              View preferences link
            </a>
            <a className="preferences-link" href="/">
              Return to homepage
            </a>
          </div>
        </section>
      </main>
    );
  } catch (error) {
    return (
      <main className="preferences-shell">
        <section className="preferences-hero">
          <div className="preferences-hero__grid">
            <div>
              <p className="preferences-kicker">Unsubscribe</p>
              <h1>We could not process that unsubscribe link.</h1>
              <p>
                {error instanceof Error
                  ? error.message
                  : "Try the latest email footer or contact the site operator."}
              </p>
            </div>
          </div>
        </section>
      </main>
    );
  }
}
