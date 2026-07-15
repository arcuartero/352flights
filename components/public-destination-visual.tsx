"use client";

import { useEffect, useState } from "react";

import { toDestinationSlug } from "@/lib/destination-slugs";

type DestinationVisualProps = {
  destinationCity: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
  alt?: string;
  landmarkTitle?: string;
  photoSrc?: string | null;
};

const COASTAL_DESTINATIONS = new Set([
  "Agadir", "Alicante", "Barcelona", "Bari", "Bodrum", "Cagliari", "Corfu",
  "Dubrovnik", "Faro", "Fuerteventura", "Gran Canaria", "Heraklion", "Ibiza",
  "Lanzarote", "Madeira", "Malaga", "Mallorca", "Malta", "Menorca", "Naples",
  "Nice", "Palermo", "Porto", "Split", "Tenerife", "Thessaloniki", "Valencia",
]);

const NATURE_DESTINATIONS = new Set([
  "Bergen", "Geneva", "Innsbruck", "Reykjavik", "Salzburg", "Tromso", "Zurich",
]);

type DestinationPhotoPayload = {
  photos?: Record<
    string,
    {
      url?: string;
    }
  >;
};

let destinationPhotoMapPromise: Promise<Record<string, string>> | null = null;

function getDestinationVisual(city: string) {
  if (COASTAL_DESTINATIONS.has(city)) {
    return "/destinations/coastal-town.webp";
  }
  if (NATURE_DESTINATIONS.has(city)) {
    return "/destinations/alpine-nature.webp";
  }
  return "/destinations/european-city.webp";
}

function loadDestinationPhotoMap() {
  if (!destinationPhotoMapPromise) {
    destinationPhotoMapPromise = fetch("/api/destination-photos", {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          return {};
        }
        const payload = (await response.json()) as DestinationPhotoPayload;
        return Object.fromEntries(
          Object.entries(payload.photos ?? {})
            .map(([slug, photo]) => [slug, photo.url ?? ""])
            .filter(([, url]) => url),
        );
      })
      .catch(() => ({}))
      .finally(() => {
        destinationPhotoMapPromise = null;
      });
  }

  return destinationPhotoMapPromise;
}

export function DestinationVisual({
  destinationCity,
  className,
  priority = false,
  sizes,
  alt,
  landmarkTitle,
  photoSrc,
}: DestinationVisualProps) {
  const fallbackSrc = getDestinationVisual(destinationCity);
  const resolvedPhotoSrc = photoSrc?.trim() || null;
  const [src, setSrc] = useState(resolvedPhotoSrc ?? fallbackSrc);

  useEffect(() => {
    if (resolvedPhotoSrc) {
      setSrc(resolvedPhotoSrc);
      return;
    }

    let isMounted = true;
    const slug = toDestinationSlug(destinationCity);
    setSrc(fallbackSrc);

    loadDestinationPhotoMap().then((photoMap) => {
      if (!isMounted) {
        return;
      }
      setSrc(photoMap[slug] ?? fallbackSrc);
    });

    return () => {
      isMounted = false;
    };
  }, [destinationCity, fallbackSrc, resolvedPhotoSrc]);

  return (
    <img
      alt={
        alt ??
        (landmarkTitle
          ? `${landmarkTitle} in ${destinationCity}`
          : `Travel inspiration for ${destinationCity}`)
      }
      className={className}
      fetchPriority={priority ? "high" : "auto"}
      loading={priority ? "eager" : "lazy"}
      sizes={sizes}
      src={src}
      style={{ objectFit: "cover" }}
    />
  );
}
