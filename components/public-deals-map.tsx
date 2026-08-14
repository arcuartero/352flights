"use client";

import "leaflet/dist/leaflet.css";

import { divIcon, latLngBounds, type LatLngExpression, type Marker as LeafletMarker } from "leaflet";
import { MapPin, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

import { toDestinationSlug } from "@/lib/destination-slugs";
import type { Locale } from "@/lib/i18n";
import type { CampaignPreviewDeal } from "@/lib/ops-shared";

export type DealsMapCity = {
  key: string;
  city: string;
  airport: string;
  deals: CampaignPreviewDeal[];
  lowestPrice: number;
};

type PublicDealsMapProps = {
  cities: DealsMapCity[];
  locale: Locale;
};

type MapCopy = {
  sectionTitle: string;
  openMap: string;
  modalTitle: string;
  modalDescription: (count: number) => string;
  close: string;
  faresFrom: string;
  viewDestination: (city: string) => string;
  noCoordinates: string;
};

const COPY: Record<Locale, MapCopy> = {
  en: {
    sectionTitle: "Results map",
    openMap: "View on map",
    modalTitle: "Destinations on the map",
    modalDescription: (count) => `${count} destinations with fares matching the current filters.`,
    close: "Close map",
    faresFrom: "Fares from",
    viewDestination: (city) => `See more flights to ${city}`,
    noCoordinates: "No destinations with map coordinates match these filters.",
  },
  fr: {
    sectionTitle: "Carte des resultats",
    openMap: "Voir sur la carte",
    modalTitle: "Destinations sur la carte",
    modalDescription: (count) => `${count} destinations avec des tarifs correspondant aux filtres actifs.`,
    close: "Fermer la carte",
    faresFrom: "Tarifs des",
    viewDestination: (city) => `Voir plus de vols vers ${city}`,
    noCoordinates: "Aucune destination avec des coordonnees ne correspond a ces filtres.",
  },
  de: {
    sectionTitle: "Ergebniskarte",
    openMap: "Auf der Karte ansehen",
    modalTitle: "Reiseziele auf der Karte",
    modalDescription: (count) => `${count} Reiseziele mit Tarifen passend zu den aktiven Filtern.`,
    close: "Karte schliessen",
    faresFrom: "Tarife ab",
    viewDestination: (city) => `Mehr Fluege nach ${city}`,
    noCoordinates: "Keine Reiseziele mit Kartenkoordinaten entsprechen diesen Filtern.",
  },
  pt: {
    sectionTitle: "Mapa de resultados",
    openMap: "Ver no mapa",
    modalTitle: "Destinos no mapa",
    modalDescription: (count) => `${count} destinos com tarifas que correspondem aos filtros ativos.`,
    close: "Fechar mapa",
    faresFrom: "Tarifas desde",
    viewDestination: (city) => `Ver mais voos para ${city}`,
    noCoordinates: "Nenhum destino com coordenadas corresponde a estes filtros.",
  },
  it: {
    sectionTitle: "Mappa dei risultati",
    openMap: "Vedi sulla mappa",
    modalTitle: "Destinazioni sulla mappa",
    modalDescription: (count) => `${count} destinazioni con tariffe corrispondenti ai filtri attivi.`,
    close: "Chiudi mappa",
    faresFrom: "Tariffe da",
    viewDestination: (city) => `Vedi altri voli per ${city}`,
    noCoordinates: "Nessuna destinazione con coordinate corrisponde a questi filtri.",
  },
  es: {
    sectionTitle: "Mapa de resultados",
    openMap: "Ver en el mapa",
    modalTitle: "Destinos en el mapa",
    modalDescription: (count) => `${count} destinos con tarifas que coinciden con los filtros activos.`,
    close: "Cerrar mapa",
    faresFrom: "Tarifas desde",
    viewDestination: (city) => `Ver mas vuelos a ${city}`,
    noCoordinates: "No hay destinos con coordenadas que coincidan con estos filtros.",
  },
};

const AIRPORT_COORDINATES: Record<string, LatLngExpression> = {
  AGA: [30.325, -9.413],
  AGP: [36.675, -4.499],
  AJA: [41.924, 8.803],
  ALC: [38.282, -0.558],
  AMS: [52.31, 4.768],
  ARN: [59.652, 17.919],
  ATH: [37.936, 23.944],
  AUH: [24.433, 54.651],
  AYT: [36.899, 30.801],
  BCN: [41.297, 2.078],
  BER: [52.366, 13.503],
  BUD: [47.437, 19.256],
  CDG: [49.009, 2.548],
  CFU: [39.601, 19.912],
  CHQ: [35.532, 24.149],
  CLY: [42.53, 8.793],
  CPH: [55.618, 12.656],
  DJE: [33.875, 10.775],
  DUB: [53.421, -6.27],
  DXB: [25.253, 55.365],
  EDI: [55.95, -3.373],
  EWR: [40.689, -74.174],
  FAO: [37.014, -7.966],
  FCO: [41.8, 12.238],
  FNC: [32.697, -16.775],
  FRA: [50.037, 8.562],
  FSC: [41.501, 9.098],
  GVA: [46.238, 6.109],
  HEL: [60.317, 24.963],
  HER: [35.339, 25.18],
  HRG: [27.178, 33.799],
  IBZ: [38.873, 1.373],
  IST: [41.275, 28.751],
  JFK: [40.641, -73.778],
  KGS: [36.793, 27.092],
  KRK: [50.078, 19.785],
  LCY: [51.505, 0.055],
  LGW: [51.153, -0.182],
  LHR: [51.47, -0.454],
  LIN: [45.445, 9.277],
  LIS: [38.775, -9.135],
  LJU: [46.224, 14.458],
  LPA: [27.932, -15.386],
  MAD: [40.472, -3.561],
  MAN: [53.354, -2.275],
  MLA: [35.857, 14.477],
  MRS: [43.439, 5.221],
  MUC: [48.354, 11.786],
  MXP: [45.63, 8.723],
  NCE: [43.665, 7.215],
  NRT: [35.772, 140.393],
  OPO: [41.248, -8.681],
  OSL: [60.194, 11.1],
  OTP: [44.571, 26.085],
  PMI: [39.552, 2.739],
  PRG: [50.101, 14.26],
  PSR: [42.431, 14.181],
  RAK: [31.607, -8.036],
  RHO: [36.405, 28.086],
  RMI: [44.02, 12.612],
  STN: [51.885, 0.235],
  SVQ: [37.418, -5.893],
  TFS: [28.044, -16.572],
  TLS: [43.629, 1.364],
  TUN: [36.851, 10.227],
  VIE: [48.11, 16.57],
  VLC: [39.49, -0.481],
  WAW: [52.167, 20.967],
  XRY: [36.745, -6.06],
  ZAD: [44.108, 15.347],
  ZRH: [47.458, 8.555],
};

const markerIcon = divIcon({
  className: "deals-results-map__marker-shell",
  html: '<span class="deals-results-map__marker"><span></span></span>',
  iconAnchor: [16, 34],
  iconSize: [32, 36],
  popupAnchor: [0, -32],
});

function getIntlLocale(locale: Locale) {
  return locale === "en" ? "en-GB" : `${locale}-${locale.toUpperCase()}`;
}

function formatCurrency(price: number, locale: Locale) {
  return new Intl.NumberFormat(getIntlLocale(locale), {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDateRange(deal: CampaignPreviewDeal, locale: Locale) {
  if (!deal.departureDate) {
    return deal.routeLabel;
  }

  const formatter = new Intl.DateTimeFormat(getIntlLocale(locale), {
    day: "numeric",
    month: "short",
  });
  const departure = formatter.format(new Date(`${deal.departureDate}T12:00:00`));
  const returning = deal.returnDate
    ? formatter.format(new Date(`${deal.returnDate}T12:00:00`))
    : null;
  return returning ? `${departure} - ${returning}` : departure;
}

function MapViewport({ cities, compact }: { cities: DealsMapCity[]; compact: boolean }) {
  const map = useMap();

  useEffect(() => {
    const points = cities
      .map((city) => AIRPORT_COORDINATES[city.airport.toUpperCase()])
      .filter((coordinates): coordinates is LatLngExpression => Boolean(coordinates));

    if (points.length === 1) {
      map.setView(points[0], compact ? 5 : 7, { animate: false });
      return;
    }

    if (points.length > 1) {
      map.fitBounds(latLngBounds(points), {
        animate: false,
        padding: compact ? [18, 18] : [48, 48],
        maxZoom: compact ? 5 : 7,
      });
    }
  }, [cities, compact, map]);

  return null;
}

function DealsLeafletMap({ cities, compact, locale }: PublicDealsMapProps & { compact: boolean }) {
  const copy = COPY[locale];
  const mappedCities = useMemo(
    () => cities.filter((city) => AIRPORT_COORDINATES[city.airport.toUpperCase()]),
    [cities],
  );

  return (
    <MapContainer
      attributionControl={!compact}
      center={[48.5, 7]}
      className={compact ? "deals-results-map__canvas is-compact" : "deals-results-map__canvas"}
      dragging={!compact}
      keyboard={!compact}
      scrollWheelZoom={!compact}
      zoom={4}
      zoomControl={!compact}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapViewport cities={mappedCities} compact={compact} />
      {mappedCities.map((city) => (
        <Marker
          eventHandlers={{
            mouseover: (event) => (event.target as LeafletMarker).openPopup(),
          }}
          icon={markerIcon}
          key={city.key}
          position={AIRPORT_COORDINATES[city.airport.toUpperCase()]}
        >
          {!compact ? (
            <Popup closeButton={false} maxWidth={320} minWidth={250}>
              <article className="deals-results-map__popup-card">
                <header>
                  <div>
                    <strong>{city.city}</strong>
                    <span>{city.airport}</span>
                  </div>
                  <b>{copy.faresFrom} {formatCurrency(city.lowestPrice, locale)}</b>
                </header>
                <div className="deals-results-map__fares">
                  {[...city.deals]
                    .sort((left, right) => left.dealPrice - right.dealPrice)
                    .slice(0, 4)
                    .map((deal) => (
                      <div key={deal.id}>
                        <span>{formatDateRange(deal, locale)}</span>
                        <small>{deal.airlineSummary ?? deal.primaryAirlineCode ?? city.airport}</small>
                        <strong>{formatCurrency(deal.dealPrice, locale)}</strong>
                      </div>
                    ))}
                </div>
                <a href={`/deals/${toDestinationSlug(city.city)}`}>
                  {copy.viewDestination(city.city)} <span aria-hidden="true">-&gt;</span>
                </a>
              </article>
            </Popup>
          ) : null}
        </Marker>
      ))}
    </MapContainer>
  );
}

function DealsMapModal({ cities, locale, onClose }: PublicDealsMapProps & { onClose: () => void }) {
  const copy = COPY[locale];
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div className="deals-results-map-modal" onMouseDown={onClose}>
      <div
        aria-labelledby="deals-results-map-title"
        aria-modal="true"
        className="deals-results-map-modal__dialog"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="deals-results-map-modal__header">
          <div>
            <p>+352 Flights</p>
            <h2 id="deals-results-map-title">{copy.modalTitle}</h2>
            <span>{copy.modalDescription(cities.length)}</span>
          </div>
          <button aria-label={copy.close} onClick={onClose} type="button">
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="deals-results-map-modal__map">
          {cities.some((city) => AIRPORT_COORDINATES[city.airport.toUpperCase()]) ? (
            <DealsLeafletMap cities={cities} compact={false} locale={locale} />
          ) : (
            <p className="deals-results-map__empty">{copy.noCoordinates}</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function PublicDealsMap({ cities, locale }: PublicDealsMapProps) {
  const copy = COPY[locale];
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mappedCities = useMemo(
    () => cities.filter((city) => AIRPORT_COORDINATES[city.airport.toUpperCase()]),
    [cities],
  );

  const closeModal = () => {
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <>
      <section className="deals-results-map" aria-label={copy.sectionTitle}>
        <div className="deals-results-map__heading">
          <span>{copy.sectionTitle}</span>
          <strong>{mappedCities.length}</strong>
        </div>
        <div className="deals-results-map__preview">
          {mappedCities.length > 0 ? (
            <DealsLeafletMap cities={mappedCities} compact locale={locale} />
          ) : (
            <p className="deals-results-map__empty">{copy.noCoordinates}</p>
          )}
          <button
            disabled={mappedCities.length === 0}
            onClick={() => setIsOpen(true)}
            ref={triggerRef}
            type="button"
          >
            <MapPin aria-hidden="true" />
            {copy.openMap}
          </button>
        </div>
      </section>
      {isOpen ? <DealsMapModal cities={mappedCities} locale={locale} onClose={closeModal} /> : null}
    </>
  );
}
