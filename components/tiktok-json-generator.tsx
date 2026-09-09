"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
  Plus,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  generateCreatelloDocument,
  type CreatelloLanguage,
  type CreatelloTemplate,
  type TikTokGenerationResult,
  type TikTokProposalSort,
  type TikTokSourceOffer,
} from "@/lib/tiktok-carousel";

type Props = {
  initialError: string | null;
  initialMonth: string;
  initialOffers: TikTokSourceOffer[];
};

type ProposalPayload =
  | { ok: true; mode: "propose"; offers: TikTokSourceOffer[] }
  | { ok: false; reason: string; detail?: string };

type InboxPayload =
  | {
    ok: true;
    idempotent: boolean;
    inboxItem: { id: string; externalId: string; status: string };
  }
  | { ok: false; reason: string; detail?: string };

type ProposalPreset = {
  value: string;
  label: string;
  candidateLimit: number;
  sort: TikTokProposalSort;
};

const TEMPLATES: Array<{ value: CreatelloTemplate; label: string }> = [
  { value: "travel-offer", label: "Oferta de viaje" },
  { value: "travel-offer-glass", label: "Oferta de viaje Glass" },
  { value: "travel-offer-dark", label: "Oferta de viaje Dark" },
  { value: "cheap-flights-tiktok", label: "Cheap Flights / TikTok Organic" },
  { value: "flight-deals-352", label: "Ofertas de vuelo 352" },
];

const LANGUAGES: Array<{ value: CreatelloLanguage; label: string }> = [
  { value: "en", label: "Inglés" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Francés" },
  { value: "de", label: "Alemán" },
  { value: "pt", label: "Portugués" },
];

const PROPOSAL_PRESETS: ProposalPreset[] = [
  { value: "cheapest-10", label: "10 ofertas más baratas", candidateLimit: 10, sort: "cheapest" },
  { value: "cheapest-20", label: "20 ofertas más baratas", candidateLimit: 20, sort: "cheapest" },
  { value: "freshest-20", label: "20 ofertas más recientes", candidateLimit: 20, sort: "freshest" },
  { value: "direct-20", label: "20 vuelos directos más baratos", candidateLimit: 20, sort: "direct" },
];

function formatMoney(price: number, currency: string) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatCheckedAt(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function routingLabel(value: string) {
  if (value === "NON_STOP") return "Directo";
  if (value === "ONE_STOP_OR_FEWER") return "Hasta 1 escala";
  return "Escalas permitidas";
}

function destinationKey(offer: TikTokSourceOffer) {
  return offer.destinationCity.trim().toLocaleLowerCase("es");
}

export function TikTokJsonGenerator({ initialError, initialMonth, initialOffers }: Props) {
  const [template, setTemplate] = useState<CreatelloTemplate>("travel-offer");
  const [language, setLanguage] = useState<CreatelloLanguage>("en");
  const [startMonth, setStartMonth] = useState(initialMonth);
  const [monthCount, setMonthCount] = useState(3);
  const [offersPerSlide, setOffersPerSlide] = useState(3);
  const [maxPrice, setMaxPrice] = useState("");
  const [proposalPreset, setProposalPreset] = useState("cheapest-10");
  const [proposedOffers, setProposedOffers] = useState(initialOffers);
  const [selectedOffers, setSelectedOffers] = useState<TikTokSourceOffer[]>([]);
  const [proposalError, setProposalError] = useState(initialError);
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  const effectiveMonthCount = template === "flight-deals-352" ? 1 : monthCount;
  const selectedIds = useMemo(() => selectedOffers.map((offer) => offer.id), [selectedOffers]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const maxPriceValue = Number(maxPrice) > 0 ? Number(maxPrice) : undefined;

  useEffect(() => {
    setSendResult(null);
  }, [language, selectedIds]);

  const liveResult = useMemo<{
    data: TikTokGenerationResult | null;
    error: string | null;
  }>(() => {
    if (selectedOffers.length === 0) return { data: null, error: null };
    try {
      return {
        data: generateCreatelloDocument(selectedOffers, {
          template,
          language,
          originAirport: "LUX",
          startMonth,
          monthCount: effectiveMonthCount,
          slideCount: Math.max(1, selectedOffers.length),
          offersPerSlide,
          selectedOfferIds: selectedIds,
        }),
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "No se pudo construir el JSON.",
      };
    }
  }, [effectiveMonthCount, language, offersPerSlide, selectedIds, selectedOffers, startMonth, template]);

  const json = useMemo(
    () => liveResult.data?.document ? JSON.stringify(liveResult.data.document, null, 2) : "",
    [liveResult.data],
  );
  const previewItems = liveResult.data?.preview ?? [];
  const activePreviewIndex = previewItems.length > 0
    ? Math.min(previewIndex, previewItems.length - 1)
    : 0;
  const activePreview = previewItems[activePreviewIndex];

  async function proposeOffers() {
    const preset = PROPOSAL_PRESETS.find((option) => option.value === proposalPreset)
      ?? PROPOSAL_PRESETS[0];
    setLoading(true);
    setProposalError(null);
    setSelectionMessage(null);
    setSendResult(null);
    try {
      const response = await fetch("/api/ops/tiktok-json", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "propose",
          template,
          language,
          originAirport: "LUX",
          startMonth,
          monthCount: effectiveMonthCount,
          slideCount: 1,
          offersPerSlide,
          maxPrice: maxPriceValue,
          proposalSort: preset.sort,
          candidateLimit: preset.candidateLimit,
        }),
      });
      const payload = (await response.json()) as ProposalPayload;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "No se pudieron cargar propuestas." : payload.detail ?? payload.reason);
      }
      setProposedOffers(payload.offers);
      if (payload.offers.length === 0) {
        setProposalError("No hay ofertas que coincidan con estos criterios.");
      }
    } catch (error) {
      setProposalError(error instanceof Error ? error.message : "No se pudieron cargar propuestas.");
    } finally {
      setLoading(false);
    }
  }

  function toggleOffer(offer: TikTokSourceOffer) {
    setSelectionMessage(null);
    setSendResult(null);
    if (selectedIdSet.has(offer.id)) {
      setSelectedOffers((current) => current.filter((item) => item.id !== offer.id));
      return;
    }
    if (selectedOffers.length >= 20) {
      setSelectionMessage("Puedes seleccionar un máximo de 20 ofertas.");
      return;
    }
    if (selectedOffers.some((item) => destinationKey(item) === destinationKey(offer))) {
      setSelectionMessage(`Ya has seleccionado otra oferta para ${offer.destinationCity}.`);
      return;
    }
    if (template === "cheap-flights-tiktok") {
      const month = offer.departureDate.slice(0, 7);
      const selectedInMonth = selectedOffers.filter(
        (item) => item.departureDate.slice(0, 7) === month,
      ).length;
      if (selectedInMonth >= offersPerSlide) {
        setSelectionMessage(`Ya tienes ${offersPerSlide} ofertas seleccionadas para ${month}.`);
        return;
      }
    }
    setSelectedOffers((current) => [...current, offer]);
  }

  function moveSelected(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= selectedOffers.length) return;
    setSendResult(null);
    setSelectedOffers((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  async function copyJson() {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setSelectionMessage("No se pudo copiar el JSON al portapapeles.");
    }
  }

  function downloadJson() {
    if (!json) return;
    const blob = new Blob([`${json}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `social-content-${template}-${language}-${startMonth}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function sendToCreatello() {
    if (selectedIds.length === 0 || sending) return;
    setSending(true);
    setSendResult(null);
    try {
      const response = await fetch("/api/ops/creatello-inbox", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedOfferIds: selectedIds, language, revision: 1 }),
      });
      const payload = (await response.json()) as InboxPayload;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "Creatello rechazó el paquete." : payload.detail ?? payload.reason);
      }
      setSendResult({
        kind: "success",
        message: payload.idempotent
          ? `Este paquete ya estaba en Creatello (${payload.inboxItem.id}).`
          : `Paquete recibido por Creatello (${payload.inboxItem.id}).`,
      });
    } catch (error) {
      setSendResult({
        kind: "error",
        message: error instanceof Error ? error.message : "No se pudo enviar el paquete a Creatello.",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="tiktok-json-generator social-content-builder">
      <section className="tiktok-json-generator__config" aria-labelledby="social-content-config-title">
        <div className="tiktok-json-generator__section-heading">
          <div>
            <span className="ops-panel__eyebrow">1. Pedir propuestas</span>
            <h2 id="social-content-config-title">Buscar ofertas</h2>
          </div>
        </div>

        <label className="tiktok-json-field">
          <span>Plantilla</span>
          <select value={template} onChange={(event) => setTemplate(event.target.value as CreatelloTemplate)}>
            {TEMPLATES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <small>Solo afecta a esta vista previa. El paquete enviado a Creatello no lleva plantilla.</small>
        </label>
        <label className="tiktok-json-field">
          <span>Idioma</span>
          <select value={language} onChange={(event) => setLanguage(event.target.value as CreatelloLanguage)}>
            {LANGUAGES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="tiktok-json-field">
          <span>Mes inicial</span>
          <input min={initialMonth} type="month" value={startMonth} onChange={(event) => setStartMonth(event.target.value)} />
        </label>
        <label className="tiktok-json-field">
          <span>Periodo</span>
          <select
            disabled={template === "flight-deals-352"}
            value={effectiveMonthCount}
            onChange={(event) => setMonthCount(Number(event.target.value))}
          >
            <option value={1}>1 mes</option>
            <option value={3}>3 meses</option>
            <option value={6}>6 meses</option>
            <option value={9}>9 meses</option>
          </select>
        </label>
        <label className="tiktok-json-field">
          <span>Qué quieres ver</span>
          <select value={proposalPreset} onChange={(event) => setProposalPreset(event.target.value)}>
            {PROPOSAL_PRESETS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="tiktok-json-field">
          <span>Precio máximo opcional</span>
          <div className="tiktok-json-field__number">
            <input min={1} placeholder="Sin límite" type="number" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} />
            <small>Filtra las propuestas; nunca selecciona ofertas por ti.</small>
          </div>
        </label>
        {template === "cheap-flights-tiktok" ? (
          <label className="tiktok-json-field">
            <span>Ofertas por mes / slide</span>
            <select value={offersPerSlide} onChange={(event) => setOffersPerSlide(Number(event.target.value))}>
              {[3, 4, 5, 6, 7, 8, 9, 10].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        ) : null}
        <button className="ops-button tiktok-json-generator__primary" disabled={loading || !startMonth} onClick={proposeOffers} type="button">
          <RefreshCw aria-hidden="true" className={loading ? "is-spinning" : undefined} size={17} />
          {loading ? "Buscando…" : "Proponer ofertas"}
        </button>
        {proposalError ? (
          <div className="tiktok-json-message tiktok-json-message--error" role="alert">
            <AlertTriangle aria-hidden="true" size={18} />
            <span>{proposalError}</span>
          </div>
        ) : null}

        <section className="social-content-candidates" aria-labelledby="social-content-candidates-title">
          <div className="social-content-list-heading">
            <div>
              <span className="ops-panel__eyebrow">2. Elegir manualmente</span>
              <h3 id="social-content-candidates-title">Ofertas propuestas</h3>
            </div>
            <span>{proposedOffers.length}</span>
          </div>
          {proposedOffers.length > 0 ? (
            <div className="social-content-candidate-list">
              {proposedOffers.map((offer) => {
                const selected = selectedIdSet.has(offer.id);
                return (
                  <button
                    aria-pressed={selected}
                    className={`social-content-candidate ${selected ? "is-selected" : ""}`}
                    key={offer.id}
                    onClick={() => toggleOffer(offer)}
                    type="button"
                  >
                    <span className="social-content-candidate__marker">
                      {selected ? <Check aria-hidden="true" size={15} /> : <Plus aria-hidden="true" size={15} />}
                    </span>
                    <span className="social-content-candidate__route">
                      <strong>{offer.destinationCity}</strong>
                      <small>{offer.destinationAirport} · {formatDate(offer.departureDate)} → {formatDate(offer.returnDate)}</small>
                    </span>
                    <span className="social-content-candidate__price">
                      <strong>{formatMoney(offer.price, offer.currency)}</strong>
                      <small>{routingLabel(offer.maxStops)}</small>
                    </span>
                    <small className="social-content-candidate__verified">Verificada {formatCheckedAt(offer.scannedAt)}</small>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="social-content-empty">Pide propuestas para empezar. Ninguna se añadirá automáticamente.</p>
          )}
        </section>
      </section>

      <section className="tiktok-json-generator__output" aria-labelledby="social-content-output-title">
        <div className="tiktok-json-generator__output-head">
          <div>
            <span className="ops-panel__eyebrow">3. Resultado en tiempo real</span>
            <h2 id="social-content-output-title">Contenido seleccionado</h2>
          </div>
          <span className="social-content-selection-count">{selectedOffers.length}/20</span>
        </div>

        {selectionMessage ? (
          <div className="tiktok-json-message tiktok-json-message--warning" role="status">
            <AlertTriangle aria-hidden="true" size={18} />
            <span>{selectionMessage}</span>
          </div>
        ) : null}

        {selectedOffers.length === 0 ? (
          <div className="social-content-selection-empty">
            <Plus aria-hidden="true" size={21} />
            <div>
              <strong>Selecciona las ofertas que quieras publicar</strong>
              <p>El JSON aparecerá aquí y se actualizará con cada cambio.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="social-content-selected-list">
              {selectedOffers.map((offer, index) => (
                <article key={offer.id}>
                  <span className="social-content-selected-list__position">{index + 1}</span>
                  <div>
                    <strong>{offer.destinationCity}</strong>
                    <small>{formatDate(offer.departureDate)} → {formatDate(offer.returnDate)} · {formatMoney(offer.price, offer.currency)}</small>
                  </div>
                  <div className="social-content-selected-list__actions">
                    <button aria-label={`Subir ${offer.destinationCity}`} disabled={sending || index === 0} onClick={() => moveSelected(index, -1)} type="button">
                      <ChevronUp aria-hidden="true" size={16} />
                    </button>
                    <button aria-label={`Bajar ${offer.destinationCity}`} disabled={sending || index === selectedOffers.length - 1} onClick={() => moveSelected(index, 1)} type="button">
                      <ChevronDown aria-hidden="true" size={16} />
                    </button>
                    <button aria-label={`Quitar ${offer.destinationCity}`} disabled={sending} onClick={() => toggleOffer(offer)} type="button">
                      <X aria-hidden="true" size={16} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <button className="ops-button tiktok-json-generator__primary" disabled={sending} onClick={sendToCreatello} type="button">
              <Send aria-hidden="true" size={17} />
              {sending ? "Enviando…" : "Enviar datos a Creatello"}
            </button>
            {sendResult ? (
              <div
                className={`tiktok-json-message tiktok-json-message--${sendResult.kind}`}
                role={sendResult.kind === "error" ? "alert" : "status"}
              >
                {sendResult.kind === "success"
                  ? <Check aria-hidden="true" size={18} />
                  : <AlertTriangle aria-hidden="true" size={18} />}
                <span>{sendResult.message}</span>
              </div>
            ) : null}
          </>
        )}

        {liveResult.error ? (
          <div className="tiktok-json-message tiktok-json-message--error" role="alert">
            <AlertTriangle aria-hidden="true" size={18} />
            <span>{liveResult.error}</span>
          </div>
        ) : null}

        {liveResult.data ? (
          <>
            <section className="social-content-carousel" aria-label="Previsualización del carrusel vertical">
              <div className="social-content-carousel__heading">
                <div>
                  <span className="ops-panel__eyebrow">Vista previa 9:16</span>
                  <strong>Carrusel vertical</strong>
                </div>
                <span>{activePreviewIndex + 1}/{previewItems.length}</span>
              </div>
              <div className="social-content-carousel__stage" aria-live="polite">
                <article className={`social-content-carousel__slide social-content-carousel__slide--${template}`}>
                  <div className="social-content-carousel__brand">
                    <span>+352</span>
                    <strong>FLIGHTS</strong>
                  </div>
                  <div className="social-content-carousel__copy">
                    <small>FLY FROM LUXEMBOURG</small>
                    <h3>{activePreview.title}</h3>
                    <p>{activePreview.detail}</p>
                    {activePreview.price !== undefined ? (
                      <div className="social-content-carousel__price">
                        <span>FROM</span>
                        <strong>{activePreview.price}{activePreview.currency}</strong>
                      </div>
                    ) : null}
                  </div>
                  <div className="social-content-carousel__cta">View deal</div>
                  <span className="social-content-carousel__page">{activePreviewIndex + 1} / {previewItems.length}</span>
                </article>
              </div>
              <div className="social-content-carousel__controls">
                <button
                  aria-label="Slide anterior"
                  disabled={activePreviewIndex === 0}
                  onClick={() => setPreviewIndex((current) => Math.max(0, current - 1))}
                  type="button"
                >
                  <ChevronLeft aria-hidden="true" size={17} />
                </button>
                <div aria-label="Slides del carrusel" className="social-content-carousel__dots">
                  {previewItems.map((item, index) => (
                    <button
                      aria-label={`Ver slide ${index + 1}: ${item.title}`}
                      aria-pressed={index === activePreviewIndex}
                      className={index === activePreviewIndex ? "is-active" : undefined}
                      key={`${item.title}-${index}`}
                      onClick={() => setPreviewIndex(index)}
                      type="button"
                    />
                  ))}
                </div>
                <button
                  aria-label="Slide siguiente"
                  disabled={activePreviewIndex === previewItems.length - 1}
                  onClick={() => setPreviewIndex((current) => Math.min(previewItems.length - 1, current + 1))}
                  type="button"
                >
                  <ChevronRight aria-hidden="true" size={17} />
                </button>
              </div>
            </section>
            <details className="social-content-json-details">
              <summary>Ver JSON técnico</summary>
              <div className="social-content-json-actions">
                <button className="ops-button ops-button--ghost ops-button--compact" onClick={copyJson} type="button">
                  {copied ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
                  {copied ? "Copiado" : "Copiar JSON"}
                </button>
                <button className="ops-button ops-button--ghost ops-button--compact" onClick={downloadJson} type="button">
                  <Download aria-hidden="true" size={16} /> Descargar
                </button>
              </div>
              <label className="tiktok-json-editor">
                <span className="sr-only">JSON generado, solo lectura</span>
                <textarea readOnly spellCheck={false} value={json} />
              </label>
            </details>
          </>
        ) : null}
      </section>
    </div>
  );
}
