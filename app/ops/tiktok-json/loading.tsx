import { OpsSubnav } from "@/components/ops-subnav";

export default function OpsTikTokJsonLoading() {
  return (
    <main className="ops-shell">
      <OpsSubnav />
      <div className="ops-shell__center-panel">
        <section className="ops-panel ops-panel--wide tiktok-json-panel">
          <div className="ops-panel__header">
            <div>
              <span className="ops-panel__eyebrow">Contenido social</span>
              <h2>Social content</h2>
              <p>Cargando formatos y ofertas reales de 352 Flights.</p>
            </div>
          </div>
          <div aria-label="Cargando contenido social" className="tiktok-json-skeleton" role="status">
            <span />
            <span />
            <span />
          </div>
        </section>
      </div>
    </main>
  );
}
