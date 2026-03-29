import { PreferencesManager } from "@/components/preferences-manager";

export const dynamic = "force-dynamic";

export default function PreferencesPage() {
  return (
    <main className="preferences-shell">
      <section className="preferences-hero">
        <div className="preferences-hero__bento">
          <article className="preferences-bento preferences-bento--headline">
            <p className="preferences-kicker">Alert profile</p>
            <h1>Build a cleaner flight feed, one neatly boxed preference at a time.</h1>
            <p>
              Tune the Luxembourg fare feed around how you actually travel: short escapes, longer
              breaks, direct flights, flash alerts, and personal watches for the deals you never
              want to miss.
            </p>
          </article>

          <article className="preferences-bento preferences-bento--stat">
            <span>Base airport</span>
            <strong>LUX first</strong>
            <small>Everything starts from Luxembourg, then branches out by mood and timing.</small>
          </article>

          <article className="preferences-bento preferences-bento--stat">
            <span>Travel styles</span>
            <strong>City, beach, long haul</strong>
            <small>Broad buckets for fast setup, then sharper rules underneath.</small>
          </article>

          <figure className="preferences-bento preferences-bento--photo preferences-bento--photo-wing">
            <img
              alt="Airplane wing at sunset seen from the window, used as travel inspiration."
              src="https://images.pexels.com/photos/17217953/pexels-photo-17217953.jpeg?auto=compress&cs=tinysrgb&w=1200"
            />
          </figure>

          <article className="preferences-bento preferences-bento--narrative">
            <span>What changes here</span>
            <strong>One profile, many watch patterns</strong>
            <p>
              Keep a calm default feed for everyday inspiration, then layer custom watches for
              patterns like Friday city breaks or long-haul drops under a hard budget.
            </p>
          </article>

          <figure className="preferences-bento preferences-bento--photo preferences-bento--photo-city">
            <img
              alt="Night cityscape used as a free-use travel image to set the mood."
              src="https://images.pexels.com/photos/14545942/pexels-photo-14545942.jpeg?auto=compress&cs=tinysrgb&w=1200"
            />
          </figure>
        </div>
      </section>
      <PreferencesManager />
    </main>
  );
}
