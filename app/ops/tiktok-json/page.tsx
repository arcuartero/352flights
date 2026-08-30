import { OpsSubnav } from "@/components/ops-subnav";
import { TikTokJsonGenerator } from "@/components/tiktok-json-generator";
import { generateCreatelloDocument } from "@/lib/tiktok-carousel";
import { loadTikTokCarouselSource } from "@/lib/tiktok-carousel-data";

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
    const options = {
      originAirport: "LUX",
      startMonth: initialMonth,
      slideCount: 5,
      offersPerSlide: 3,
      template: "travel-offer" as const,
      language: "en" as const,
    };
    const source = await loadTikTokCarouselSource(options);
    if (!source.configured) throw new Error("Supabase no está configurado.");
    initialData = {
      ...generateCreatelloDocument(source.offers, options),
    };
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
              <h2>Content generator</h2>
              <p>
                Genera archivos validados para las cinco plantillas de viajes de Creatello.
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
