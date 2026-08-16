"use client";

import { AlertTriangle, Check, Copy, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  TikTokGenerationResult,
  TikTokOrigin,
  TikTokTravelOfferGenerationResult,
} from "@/lib/tiktok-carousel";

type CarouselPayload = TikTokGenerationResult & { origins: TikTokOrigin[] };
type TravelOfferPayload = TikTokTravelOfferGenerationResult & { origins: TikTokOrigin[] };
type GeneratorFormat = "travel-offer-1" | "travel-offer-2";

type Props = {
  initialData: CarouselPayload | null;
  initialError: string | null;
  initialMonth: string;
  initialTravelOfferData: TravelOfferPayload | null;
};

const OFFERS_PER_SLIDE_OPTIONS = [3, 4, 5] as const;

const FALLBACK_ORIGINS: TikTokOrigin[] = [
  { airport: "LUX", city: "Luxemburgo", flag: "🇱🇺" },
];

function uniqueDestinations(destinations: string[]) {
  return [...new Set(destinations)];
}

function getInitialOrigin(origins: TikTokOrigin[]) {
  return origins.find((origin) => origin.airport === "LUX")?.airport
    ?? origins[0]?.airport
    ?? "LUX";
}

function OriginField({
  onChange,
  origins,
  value,
}: {
  onChange: (value: string) => void;
  origins: TikTokOrigin[];
  value: string;
}) {
  const options = origins.length > 0 ? origins : FALLBACK_ORIGINS;
  return (
    <label className="tiktok-json-field">
      <span>Origen</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((origin) => (
          <option key={origin.airport} value={origin.airport}>
            {origin.city} — {origin.airport}
          </option>
        ))}
      </select>
    </label>
  );
}

function JsonWarning({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="tiktok-json-message tiktok-json-message--warning">
      <AlertTriangle aria-hidden="true" size={18} />
      <div>
        <strong>Revisa este JSON</strong>
        <ul>
          {warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      </div>
    </div>
  );
}

function JsonError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="tiktok-json-message tiktok-json-message--error" role="alert">
      <AlertTriangle aria-hidden="true" size={18} />
      <span>{error}</span>
    </div>
  );
}

function LoadingState() {
  return (
    <div aria-label="Generando JSON" className="tiktok-json-skeleton" role="status">
      <span />
      <span />
      <span />
    </div>
  );
}

function CopyButton({
  copied,
  disabled,
  onClick,
}: {
  copied: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="ops-button ops-button--ghost ops-button--compact"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {copied ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
      {copied ? "Copiado" : "Copiar JSON"}
    </button>
  );
}

function CarouselGenerator({
  initialData,
  initialError,
  initialMonth,
}: Omit<Props, "initialTravelOfferData">) {
  const initialOrigins = initialData?.origins ?? FALLBACK_ORIGINS;
  const [originAirport, setOriginAirport] = useState(getInitialOrigin(initialOrigins));
  const [startMonth, setStartMonth] = useState(initialMonth);
  const [slideCount, setSlideCount] = useState(5);
  const [offersPerSlide, setOffersPerSlide] = useState(3);
  const [generatedOffersPerSlide, setGeneratedOffersPerSlide] = useState(3);
  const [data, setData] = useState(initialData);
  const [error, setError] = useState(initialError);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const json = useMemo(
    () => (data?.document ? JSON.stringify(data.document, null, 2) : ""),
    [data],
  );

  async function regenerate() {
    setIsLoading(true);
    setError(null);
    setCopied(false);
    try {
      const response = await fetch("/api/ops/tiktok-json", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "travel-offer-1",
          originAirport,
          startMonth,
          slideCount,
          offersPerSlide,
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.ok !== true) {
        throw new Error(payload.detail ?? "No se pudo generar el JSON.");
      }
      setData(payload as CarouselPayload);
      setGeneratedOffersPerSlide(offersPerSlide);
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "No se pudo generar el JSON.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function copyJson() {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("No se pudo copiar el JSON al portapapeles.");
    }
  }

  return (
    <div className="tiktok-json-generator">
      <section className="tiktok-json-generator__config" aria-labelledby="tiktok-config-title-1">
        <div className="tiktok-json-generator__section-heading">
          <div>
            <span className="ops-panel__eyebrow">Configuración</span>
            <h2 id="tiktok-config-title-1">Carrusel mensual</h2>
          </div>
        </div>

        <OriginField
          onChange={setOriginAirport}
          origins={data?.origins ?? initialOrigins}
          value={originAirport}
        />

        <label className="tiktok-json-field">
          <span>Mes inicial</span>
          <input
            min={initialMonth}
            onChange={(event) => setStartMonth(event.target.value)}
            type="month"
            value={startMonth}
          />
        </label>

        <label className="tiktok-json-field">
          <span>Número de slides</span>
          <div className="tiktok-json-field__number">
            <input
              max={12}
              min={1}
              onChange={(event) => setSlideCount(Number(event.target.value))}
              type="number"
              value={slideCount}
            />
            <small>Entre 1 y 12 meses consecutivos</small>
          </div>
        </label>

        <fieldset className="tiktok-json-field tiktok-json-field--segmented">
          <legend>Ofertas por slide</legend>
          <div>
            {OFFERS_PER_SLIDE_OPTIONS.map((count) => (
              <label key={count}>
                <input
                  checked={offersPerSlide === count}
                  name="offers-per-slide"
                  onChange={() => setOffersPerSlide(count)}
                  type="radio"
                />
                <span>{count}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          className="ops-button tiktok-json-generator__primary"
          disabled={isLoading || !startMonth}
          onClick={regenerate}
          type="button"
        >
          <RefreshCw aria-hidden="true" className={isLoading ? "is-spinning" : ""} size={17} />
          {isLoading ? "Generando…" : "Regenerar"}
        </button>

        <div className="tiktok-json-generator__rules">
          <strong>Selección automática</strong>
          <p>
            Solo usa tarifas reales publicables, futuras y del mes exacto. Prioriza el precio más
            bajo y ciudades distintas antes de repetir destino.
          </p>
        </div>
      </section>

      <section className="tiktok-json-generator__output" aria-labelledby="tiktok-output-title-1">
        <div className="tiktok-json-generator__output-head">
          <div>
            <span className="ops-panel__eyebrow">Vista previa</span>
            <h2 id="tiktok-output-title-1">Oferta de viaje 1</h2>
          </div>
          <CopyButton copied={copied} disabled={!json || isLoading} onClick={copyJson} />
        </div>

        {isLoading ? <LoadingState /> : null}
        {!isLoading ? <JsonError error={error} /> : null}

        {!isLoading && data ? (
          <>
            <div className="tiktok-json-preview">
              {data.preview.map((slide) => (
                <article key={`${slide.month}-${slide.year}`}>
                  <div>
                    <strong>{slide.month} {slide.year}</strong>
                    <span>{slide.offerCount}/{generatedOffersPerSlide} ofertas</span>
                  </div>
                  <p>
                    {uniqueDestinations(slide.destinations).length > 0
                      ? uniqueDestinations(slide.destinations).join(" · ")
                      : "Sin ofertas válidas"}
                  </p>
                </article>
              ))}
            </div>

            <JsonWarning warnings={data.warnings} />
            <label className="tiktok-json-editor">
              <span className="sr-only">JSON generado, solo lectura</span>
              <textarea readOnly spellCheck={false} value={json} />
            </label>
          </>
        ) : null}
      </section>
    </div>
  );
}

function TravelOfferGenerator({
  initialData,
  initialError,
  initialMonth,
}: {
  initialData: TravelOfferPayload | null;
  initialError: string | null;
  initialMonth: string;
}) {
  const initialOrigins = initialData?.origins ?? FALLBACK_ORIGINS;
  const [originAirport, setOriginAirport] = useState(getInitialOrigin(initialOrigins));
  const [startMonth, setStartMonth] = useState(initialMonth);
  const [monthCount, setMonthCount] = useState(5);
  const [data, setData] = useState(initialData);
  const [error, setError] = useState(initialError);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const json = useMemo(
    () => (data?.document ? JSON.stringify(data.document, null, 2) : ""),
    [data],
  );

  async function regenerate() {
    setIsLoading(true);
    setError(null);
    setCopied(false);
    try {
      const response = await fetch("/api/ops/tiktok-json", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "travel-offer-2",
          originAirport,
          startMonth,
          slideCount: monthCount,
          offersPerSlide: 3,
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.ok !== true) {
        throw new Error(payload.detail ?? "No se pudo generar el JSON.");
      }
      setData(payload as TravelOfferPayload);
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "No se pudo generar el JSON.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function copyJson() {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("No se pudo copiar el JSON al portapapeles.");
    }
  }

  return (
    <div className="tiktok-json-generator">
      <section className="tiktok-json-generator__config" aria-labelledby="tiktok-config-title-2">
        <div className="tiktok-json-generator__section-heading">
          <div>
            <span className="ops-panel__eyebrow">Configuración</span>
            <h2 id="tiktok-config-title-2">Mejores ofertas</h2>
          </div>
        </div>

        <OriginField
          onChange={setOriginAirport}
          origins={data?.origins ?? initialOrigins}
          value={originAirport}
        />

        <label className="tiktok-json-field">
          <span>Mes inicial</span>
          <input
            min={initialMonth}
            onChange={(event) => setStartMonth(event.target.value)}
            type="month"
            value={startMonth}
          />
        </label>

        <label className="tiktok-json-field">
          <span>Meses a revisar</span>
          <div className="tiktok-json-field__number">
            <input
              max={12}
              min={1}
              onChange={(event) => setMonthCount(Number(event.target.value))}
              type="number"
              value={monthCount}
            />
            <small>El JSON incluye las 5 mejores ofertas de este periodo</small>
          </div>
        </label>

        <button
          className="ops-button tiktok-json-generator__primary"
          disabled={isLoading || !startMonth}
          onClick={regenerate}
          type="button"
        >
          <RefreshCw aria-hidden="true" className={isLoading ? "is-spinning" : ""} size={17} />
          {isLoading ? "Generando…" : "Regenerar"}
        </button>

        <div className="tiktok-json-generator__rules">
          <strong>Sin destinos repetidos</strong>
          <p>
            Selecciona las cinco tarifas publicables más baratas. Dentro del mismo JSON nunca
            repite ciudad ni país.
          </p>
        </div>
      </section>

      <section className="tiktok-json-generator__output" aria-labelledby="tiktok-output-title-2">
        <div className="tiktok-json-generator__output-head">
          <div>
            <span className="ops-panel__eyebrow">Vista previa</span>
            <h2 id="tiktok-output-title-2">Oferta de viaje 2</h2>
          </div>
          <CopyButton copied={copied} disabled={!json || isLoading} onClick={copyJson} />
        </div>

        {isLoading ? <LoadingState /> : null}
        {!isLoading ? <JsonError error={error} /> : null}

        {!isLoading && data ? (
          <>
            <div className="tiktok-json-preview tiktok-json-preview--travel-offers">
              {data.preview.map((offer, index) => (
                <article key={`${offer.title}-${index}`}>
                  <div>
                    <strong>{offer.title}</strong>
                    <span>{offer.currency}{offer.price}</span>
                  </div>
                  <p>{offer.country}</p>
                  <small>{offer.dates}</small>
                </article>
              ))}
            </div>

            <JsonWarning warnings={data.warnings} />
            <label className="tiktok-json-editor">
              <span className="sr-only">JSON generado, solo lectura</span>
              <textarea readOnly spellCheck={false} value={json} />
            </label>
          </>
        ) : null}
      </section>
    </div>
  );
}

export function TikTokJsonGenerator({
  initialData,
  initialError,
  initialMonth,
  initialTravelOfferData,
}: Props) {
  const [activeFormat, setActiveFormat] = useState<GeneratorFormat>("travel-offer-1");

  return (
    <>
      <div className="tiktok-json-menu" role="tablist" aria-label="Tipo de JSON">
        <button
          aria-controls="tiktok-json-panel-1"
          aria-selected={activeFormat === "travel-offer-1"}
          className={activeFormat === "travel-offer-1" ? "is-active" : ""}
          id="tiktok-json-tab-1"
          onClick={() => setActiveFormat("travel-offer-1")}
          role="tab"
          type="button"
        >
          <span>01</span>
          <strong>Oferta de viaje 1</strong>
          <small>Carrusel mensual</small>
        </button>
        <button
          aria-controls="tiktok-json-panel-2"
          aria-selected={activeFormat === "travel-offer-2"}
          className={activeFormat === "travel-offer-2" ? "is-active" : ""}
          id="tiktok-json-tab-2"
          onClick={() => setActiveFormat("travel-offer-2")}
          role="tab"
          type="button"
        >
          <span>02</span>
          <strong>Oferta de viaje 2</strong>
          <small>5 destinos y países únicos</small>
        </button>
      </div>

      <div
        aria-labelledby={
          activeFormat === "travel-offer-1" ? "tiktok-json-tab-1" : "tiktok-json-tab-2"
        }
        id={activeFormat === "travel-offer-1" ? "tiktok-json-panel-1" : "tiktok-json-panel-2"}
        role="tabpanel"
      >
        {activeFormat === "travel-offer-1" ? (
          <CarouselGenerator
            initialData={initialData}
            initialError={initialError}
            initialMonth={initialMonth}
          />
        ) : (
          <TravelOfferGenerator
            initialData={initialTravelOfferData}
            initialError={initialError}
            initialMonth={initialMonth}
          />
        )}
      </div>
    </>
  );
}
