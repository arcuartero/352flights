"use client";

import { useEffect } from "react";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="page-shell page-shell--deals">
      <section className="deals-explorer__section" style={{ maxWidth: "56rem", margin: "0 auto" }}>
        <div className="deals-explorer__section-head">
          <div>
            <h2>Something went wrong</h2>
            <p>The page hit an unexpected runtime error. Try reloading this section.</p>
          </div>
        </div>
        <button className="deals-explorer__cta" onClick={reset} type="button">
          Try again
        </button>
      </section>
    </main>
  );
}
