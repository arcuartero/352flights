import { OpsSubnav } from "@/components/ops-subnav";
import { TikTokJsonGenerator } from "@/components/tiktok-json-generator";

export const dynamic = "force-dynamic";

function currentMonthKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Luxembourg",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : new Date().toISOString().slice(0, 7);
}

export default function OpsTikTokJsonPage() {
  const initialMonth = currentMonthKey();

  return (
    <main className="ops-shell">
      <OpsSubnav />
      <div className="ops-shell__center-panel">
        <section className="ops-panel ops-panel--wide tiktok-json-panel">
          <div className="ops-panel__header">
            <div>
              <span className="ops-panel__eyebrow">Contenido social</span>
              <h2>Social content</h2>
              <p>
                Pide propuestas, elige las ofertas manualmente y crea el JSON en tiempo real.
              </p>
            </div>
          </div>
          <TikTokJsonGenerator
            initialError={null}
            initialMonth={initialMonth}
            initialOffers={[]}
          />
        </section>
      </div>
    </main>
  );
}
