import { confirmSubscriberByToken } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

type ConfirmPageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

export default async function ConfirmPage({ searchParams }: ConfirmPageProps) {
  const params = await searchParams;
  const token = params.token;

  if (!token) {
    return (
      <main className="preferences-shell">
        <section className="preferences-hero">
          <div className="preferences-hero__grid">
            <div>
              <p className="preferences-kicker">Confirmation</p>
              <h1>That confirmation link is missing a token.</h1>
              <p>Go back to the homepage and subscribe again to generate a fresh email.</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  try {
    const result = await confirmSubscriberByToken(token);

    return (
      <main className="preferences-shell">
        <section className="preferences-hero">
          <div className="preferences-hero__grid">
            <div>
              <p className="preferences-kicker">Subscription confirmed</p>
              <h1>
                {result.status === "unsubscribed"
                  ? "This address is currently unsubscribed."
                  : result.alreadyConfirmed
                  ? "This subscription was already confirmed."
                  : "Your Luxembourg deal alerts are now confirmed."}
              </h1>
              <p>
                {result.status === "unsubscribed"
                  ? `If you want back in for ${result.email}, subscribe again from the homepage.`
                  : result.onboardingCompleted
                  ? `You can jump straight back into your preferences for ${result.email}.`
                  : `Now finish the profile for ${result.email} so the deals match what you actually want.`}
              </p>
            </div>
            <div className="preferences-hero__notes">
              <article>
                <span>Status</span>
                <strong>{result.status}</strong>
              </article>
              <article>
                <span>Profile</span>
                <strong>{result.onboardingCompleted ? "Saved" : "Needs setup"}</strong>
              </article>
            </div>
          </div>
        </section>

        <section className="preferences-panel">
          <div className="preferences-empty preferences-empty--stacked">
            {result.status !== "unsubscribed" ? (
              <a className="preferences-link" href={result.preferencePath}>
                {result.onboardingCompleted ? "Manage preferences" : "Set preferences"}
              </a>
            ) : null}
            <a className="preferences-link preferences-link--ghost" href="/">
              Back to homepage
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
              <p className="preferences-kicker">Confirmation</p>
              <h1>We could not confirm that email right now.</h1>
              <p>
                {error instanceof Error
                  ? error.message
                  : "Try opening the latest email from Lux Flight Deals or subscribe again."}
              </p>
            </div>
          </div>
        </section>
      </main>
    );
  }
}
