import { PreferencesManager } from "@/components/preferences-manager";

export const dynamic = "force-dynamic";

export default function PreferencesPage() {
  return (
    <main className="preferences-shell">
      <section className="preferences-hero">
        <div className="preferences-hero__grid">
          <div>
            <p className="preferences-kicker">Route profile</p>
            <h1>Choose the routes, trip shapes, and fare filters that matter to you.</h1>
            <p>
              This page turns the newsletter from a generic fare feed into a Luxembourg-first route
              profile.
            </p>
          </div>
          <div className="preferences-hero__notes">
            <article>
              <span>Base airport</span>
              <strong>LUX first</strong>
            </article>
            <article>
              <span>Cadence</span>
              <strong>Digest or flash</strong>
            </article>
            <article>
              <span>Editing</span>
              <strong>Come back anytime</strong>
            </article>
          </div>
        </div>
      </section>
      <PreferencesManager />
    </main>
  );
}
