"use client";

import { useEffect } from "react";

type GlobalErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalErrorPage({ error, reset }: GlobalErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es">
      <body>
        <main className="page-shell page-shell--deals">
          <section className="deals-explorer__section" style={{ maxWidth: "56rem", margin: "0 auto" }}>
            <div className="deals-explorer__section-head">
              <div>
                <h2>Application error</h2>
                <p>A global runtime error interrupted rendering. Try reloading the app.</p>
              </div>
            </div>
            <button className="deals-explorer__cta" onClick={reset} type="button">
              Reload app
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
