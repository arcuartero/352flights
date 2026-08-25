"use client";

import "leaflet/dist/leaflet.css";

import { divIcon, latLngBounds, type LatLngTuple, type Map as LeafletMap, type Marker as LeafletMarker } from "leaflet";
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
  presentation?: "preview" | "toolbar";
};

type MapCopy = {
  sectionTitle: string;
  openMap: string;
  mapLabel: string;
  modalTitle: string;
  modalDescription: (count: number) => string;
  close: string;
  faresFrom: string;
  viewDestination: (city: string) => string;
  clusterLabel: (count: number) => string;
  noCoordinates: string;
};

const COPY: Record<Locale, MapCopy> = {
  en: {
    sectionTitle: "Results map",
    openMap: "View on map",
    mapLabel: "Map",
    modalTitle: "Destinations on the map",
    modalDescription: (count) => `${count} destinations with fares matching the current filters.`,
    close: "Close map",
    faresFrom: "Fares from",
    viewDestination: (city) => `See more flights to ${city}`,
    clusterLabel: (count) => `Zoom to ${count} destinations`,
    noCoordinates: "No destinations with map coordinates match these filters.",
  },
  fr: {
    sectionTitle: "Carte des resultats",
    openMap: "Voir sur la carte",
    mapLabel: "Carte",
    modalTitle: "Destinations sur la carte",
    modalDescription: (count) => `${count} destinations avec des tarifs correspondant aux filtres actifs.`,
    close: "Fermer la carte",
    faresFrom: "Tarifs des",
    viewDestination: (city) => `Voir plus de vols vers ${city}`,
    clusterLabel: (count) => `Afficher ${count} destinations`,
    noCoordinates: "Aucune destination avec des coordonnees ne correspond a ces filtres.",
  },
  de: {
    sectionTitle: "Ergebniskarte",
    openMap: "Auf der Karte ansehen",
    mapLabel: "Karte",
    modalTitle: "Reiseziele auf der Karte",
    modalDescription: (count) => `${count} Reiseziele mit Tarifen passend zu den aktiven Filtern.`,
    close: "Karte schliessen",
    faresFrom: "Tarife ab",
    viewDestination: (city) => `Mehr Fluege nach ${city}`,
    clusterLabel: (count) => `Auf ${count} Reiseziele zoomen`,
    noCoordinates: "Keine Reiseziele mit Kartenkoordinaten entsprechen diesen Filtern.",
  },
  pt: {
    sectionTitle: "Mapa de resultados",
    openMap: "Ver no mapa",
    mapLabel: "Mapa",
    modalTitle: "Destinos no mapa",
    modalDescription: (count) => `${count} destinos com tarifas que correspondem aos filtros ativos.`,
    close: "Fechar mapa",
    faresFrom: "Tarifas desde",
    viewDestination: (city) => `Ver mais voos para ${city}`,
    clusterLabel: (count) => `Aproximar ${count} destinos`,
    noCoordinates: "Nenhum destino com coordenadas corresponde a estes filtros.",
  },
  it: {
    sectionTitle: "Mappa dei risultati",
    openMap: "Vedi sulla mappa",
    mapLabel: "Mappa",
    modalTitle: "Destinazioni sulla mappa",
    modalDescription: (count) => `${count} destinazioni con tariffe corrispondenti ai filtri attivi.`,
    close: "Chiudi mappa",
    faresFrom: "Tariffe da",
    viewDestination: (city) => `Vedi altri voli per ${city}`,
    clusterLabel: (count) => `Avvicina ${count} destinazioni`,
    noCoordinates: "Nessuna destinazione con coordinate corrisponde a questi filtri.",
  },
  es: {
    sectionTitle: "Mapa de resultados",
    openMap: "Ver en el mapa",
    mapLabel: "Mapa",
    modalTitle: "Destinos en el mapa",
    modalDescription: (count) => `${count} destinos con tarifas que coinciden con los filtros activos.`,
    close: "Cerrar mapa",
    faresFrom: "Tarifas desde",
    viewDestination: (city) => `Ver mas vuelos a ${city}`,
    clusterLabel: (count) => `Acercar a ${count} destinos`,
    noCoordinates: "No hay destinos con coordenadas que coincidan con estos filtros.",
  },
};

const AIRPORT_COORDINATES: Record<string, LatLngTuple> = {
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

const PREVIEW_MARKER_LIMIT = 6;
const CLUSTER_EXPANSION_ZOOM = 10;

type ClusterCity = {
  city: DealsMapCity;
  position: LatLngTuple;
};

type MapCityCluster = {
  key: string;
  cities: ClusterCity[];
  center: LatLngTuple;
};

function createPriceMarkerIcon(price: number, locale: Locale) {
  return divIcon({
    className: "deals-results-map__price-marker-shell",
    html: `<span class="deals-results-map__price-marker">${formatCurrency(price, locale)}</span>`,
    iconAnchor: [38, 34],
    iconSize: [76, 38],
    popupAnchor: [0, -30],
  });
}

function createClusterMarkerIcon(count: number) {
  return divIcon({
    className: "deals-results-map__cluster-shell",
    html: `<span class="deals-results-map__cluster">${count}</span>`,
    iconAnchor: [26, 26],
    iconSize: [52, 52],
  });
}

function getClusterRadius(zoom: number) {
  if (zoom >= CLUSTER_EXPANSION_ZOOM) {
    return 0;
  }

  if (zoom <= 4) {
    return 112;
  }

  if (zoom <= 6) {
    return 92;
  }

  return 74;
}

function buildMapClusters(cities: DealsMapCity[], map: LeafletMap, zoom: number) {
  const clusterRadius = getClusterRadius(zoom);
  const projectedClusters: Array<{
    cities: ClusterCity[];
    x: number;
    y: number;
  }> = [];

  cities.forEach((city) => {
    const position = AIRPORT_COORDINATES[city.airport.toUpperCase()];
    if (!position) {
      return;
    }

    const point = map.project(position, zoom);
    const cluster =
      clusterRadius > 0
        ? projectedClusters.find((candidate) =>
            Math.hypot(candidate.x - point.x, candidate.y - point.y) <= clusterRadius,
          )
        : undefined;

    if (!cluster) {
      projectedClusters.push({
        cities: [{ city, position }],
        x: point.x,
        y: point.y,
      });
      return;
    }

    const previousCount = cluster.cities.length;
    cluster.cities.push({ city, position });
    cluster.x = (cluster.x * previousCount + point.x) / cluster.cities.length;
    cluster.y = (cluster.y * previousCount + point.y) / cluster.cities.length;
  });

  return projectedClusters.map<MapCityCluster>((cluster) => ({
    key: cluster.cities
      .map(({ city }) => city.key)
      .sort()
      .join("|"),
    cities: cluster.cities,
    center: [
      cluster.cities.reduce((total, item) => total + item.position[0], 0) /
        cluster.cities.length,
      cluster.cities.reduce((total, item) => total + item.position[1], 0) /
        cluster.cities.length,
    ],
  }));
}

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
      .filter((coordinates): coordinates is LatLngTuple => Boolean(coordinates));

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

function MapCityPopup({ city, locale }: { city: DealsMapCity; locale: Locale }) {
  const copy = COPY[locale];

  return (
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
  );
}

function PriceMapMarker({ city, locale }: { city: DealsMapCity; locale: Locale }) {
  return (
    <Marker
      eventHandlers={{
        mouseover: (event) => (event.target as LeafletMarker).openPopup(),
      }}
      icon={createPriceMarkerIcon(city.lowestPrice, locale)}
      position={AIRPORT_COORDINATES[city.airport.toUpperCase()]}
    >
      <MapCityPopup city={city} locale={locale} />
    </Marker>
  );
}

function ClusteredPriceMarkers({ cities, locale }: { cities: DealsMapCity[]; locale: Locale }) {
  const copy = COPY[locale];
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    const syncZoom = () => setZoom(map.getZoom());
    map.on("zoomend", syncZoom);
    return () => {
      map.off("zoomend", syncZoom);
    };
  }, [map]);

  const clusters = useMemo(() => buildMapClusters(cities, map, zoom), [cities, map, zoom]);

  const expandCluster = (cluster: MapCityCluster) => {
    const nextZoom = Math.min(map.getZoom() + 3, CLUSTER_EXPANSION_ZOOM);
    map.setView(cluster.center, nextZoom, { animate: true });
  };

  return clusters.map((cluster) => {
    if (cluster.cities.length === 1) {
      const [{ city }] = cluster.cities;
      return <PriceMapMarker city={city} key={city.key} locale={locale} />;
    }

    const label = copy.clusterLabel(cluster.cities.length);
    return (
      <Marker
        alt={label}
        eventHandlers={{ click: () => expandCluster(cluster) }}
        icon={createClusterMarkerIcon(cluster.cities.length)}
        key={cluster.key}
        position={cluster.center}
        riseOnHover
        title={label}
      />
    );
  });
}

function DealsLeafletMap({ cities, compact, locale }: PublicDealsMapProps & { compact: boolean }) {
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
      {compact ? (
        mappedCities.map((city) => (
          <Marker
            icon={markerIcon}
            key={city.key}
            position={AIRPORT_COORDINATES[city.airport.toUpperCase()]}
          />
        ))
      ) : (
        <ClusteredPriceMarkers cities={mappedCities} locale={locale} />
      )}
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

export function PublicDealsMap({ cities, locale, presentation = "preview" }: PublicDealsMapProps) {
  const copy = COPY[locale];
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mappedCities = useMemo(
    () => cities.filter((city) => AIRPORT_COORDINATES[city.airport.toUpperCase()]),
    [cities],
  );
  const previewCities = useMemo(
    () => mappedCities.slice(0, PREVIEW_MARKER_LIMIT),
    [mappedCities],
  );

  const closeModal = () => {
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <>
      {presentation === "toolbar" ? (
        <button
          className="deals-mobile-results-bar__action"
          disabled={mappedCities.length === 0}
          onClick={() => setIsOpen(true)}
          ref={triggerRef}
          type="button"
        >
          <MapPin aria-hidden="true" />
          <span>{copy.mapLabel}</span>
        </button>
      ) : (
        <section className="deals-results-map" aria-label={copy.sectionTitle}>
          <div className="deals-results-map__heading">
            <span>{copy.sectionTitle}</span>
            <strong>{mappedCities.length}</strong>
          </div>
          <div className="deals-results-map__preview">
            {mappedCities.length > 0 ? (
              <DealsLeafletMap cities={previewCities} compact locale={locale} />
            ) : (
              <p className="deals-results-map__empty">{copy.noCoordinates}</p>
            )}
            <button
              aria-label={copy.openMap}
              disabled={mappedCities.length === 0}
              onClick={() => setIsOpen(true)}
              ref={triggerRef}
              type="button"
            >
              <span>
                <MapPin aria-hidden="true" />
                {copy.openMap}
              </span>
            </button>
          </div>
        </section>
      )}
      {isOpen ? <DealsMapModal cities={mappedCities} locale={locale} onClose={closeModal} /> : null}
    </>
  );
}
