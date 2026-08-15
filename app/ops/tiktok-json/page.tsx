import { OpsSubnav } from "@/components/ops-subnav";
import { TikTokJsonGenerator } from "@/components/tiktok-json-generator";
import { buildTikTokCarousel } from "@/lib/tiktok-carousel-data";

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

export default async function OpsTikTokJsonPage() {
  const initialMonth = currentMonthKey();
  let initialData = null;
  let initialError: string | null = null;
  try {
    initialData = await buildTikTokCarousel({
      originAirport: "LUX",
      startMonth: initialMonth,
      slideCount: 5,
      offersPerSlide: 3,
    });
  } catch (error) {
    initialError = error instanceof Error ? error.message : "No se pudieron cargar las ofertas.";
  }

  return (
    <main className="ops-shell">
      <OpsSubnav />
      <div className="ops-shell__center-panel">
        <section className="ops-panel ops-panel--wide tiktok-json-panel">
          <div className="ops-panel__header">
            <div>
              <span className="ops-panel__eyebrow">Contenido social</span>
              <h1>TikTok JSON</h1>
              <p>
                Genera carruseles mensuales con ofertas publicables y fotos reales de 352 Flights.
              </p>
            </div>
          </div>
          <TikTokJsonGenerator
            initialData={initialData}
            initialError={initialError}
            initialMonth={initialMonth}
          />
        </section>
      </div>
    </main>
  );
}
