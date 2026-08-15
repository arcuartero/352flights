"use client";

import { AlertTriangle, Check, Copy, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  TikTokGenerationResult,
  TikTokOrigin,
} from "@/lib/tiktok-carousel";

type GeneratorPayload = TikTokGenerationResult & { origins: TikTokOrigin[] };

type Props = {
  initialData: GeneratorPayload | null;
  initialError: string | null;
  initialMonth: string;
};

function uniqueDestinations(destinations: string[]) {
  return [...new Set(destinations)];
}

export function TikTokJsonGenerator({ initialData, initialError, initialMonth }: Props) {
  const [originAirport, setOriginAirport] = useState(
    initialData?.origins.find((origin) => origin.airport === "LUX")?.airport ??
      initialData?.origins[0]?.airport ??
      "LUX",
  );
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
        body: JSON.stringify({ originAirport, startMonth, slideCount, offersPerSlide }),
      });
      const payload = await response.json();
      if (!response.ok || payload.ok !== true) {
        throw new Error(payload.detail ?? "No se pudo generar el JSON.");
      }
      setData(payload as GeneratorPayload);
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
      <section className="tiktok-json-generator__config" aria-labelledby="tiktok-config-title">
        <div className="tiktok-json-generator__section-heading">
          <div>
            <span className="ops-panel__eyebrow">Configuración</span>
            <h2 id="tiktok-config-title">Carrusel de ofertas</h2>
          </div>
        </div>

        <label className="tiktok-json-field">
          <span>Origen</span>
          <select value={originAirport} onChange={(event) => setOriginAirport(event.target.value)}>
            {(data?.origins.length ? data.origins : [{ airport: "LUX", city: "Luxemburgo", flag: "🇱🇺" }]).map(
              (origin) => (
                <option key={origin.airport} value={origin.airport}>
                  {origin.city} — {origin.airport}
                </option>
              ),
            )}
          </select>
        </label>

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
            {[3, 4, 5].map((count) => (
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

      <section className="tiktok-json-generator__output" aria-labelledby="tiktok-output-title">
        <div className="tiktok-json-generator__output-head">
          <div>
            <span className="ops-panel__eyebrow">Vista previa</span>
            <h2 id="tiktok-output-title">TikTok JSON</h2>
          </div>
          <button
            className="ops-button ops-button--ghost ops-button--compact"
            disabled={!json || isLoading}
            onClick={copyJson}
            type="button"
          >
            {copied ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
            {copied ? "Copiado" : "Copiar JSON"}
          </button>
        </div>

        {isLoading ? (
          <div aria-label="Generando carrusel" className="tiktok-json-skeleton" role="status">
            <span />
            <span />
            <span />
          </div>
        ) : null}

        {!isLoading && error ? (
          <div className="tiktok-json-message tiktok-json-message--error" role="alert">
            <AlertTriangle aria-hidden="true" size={18} />
            <span>{error}</span>
          </div>
        ) : null}

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

            {data.warnings.length > 0 ? (
              <div className="tiktok-json-message tiktok-json-message--warning">
                <AlertTriangle aria-hidden="true" size={18} />
                <div>
                  <strong>Revisa este carrusel</strong>
                  <ul>
                    {data.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              </div>
            ) : null}

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
