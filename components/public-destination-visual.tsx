"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { toDestinationSlug } from "@/lib/destination-slugs";
import {
  isSupabaseStorageImage,
  supabaseImageLoader,
} from "@/lib/supabase-image-loader";

type DestinationVisualProps = {
  destinationCity: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
  alt?: string;
  landmarkTitle?: string;
  photoSrc?: string | null;
  fallbackPhotoSrc?: string | null;
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
  fallbackPhotoSrc,
}: DestinationVisualProps) {
  const fallbackSrc = fallbackPhotoSrc?.trim() || getDestinationVisual(destinationCity);
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
    <Image
      alt={
        alt ??
        (landmarkTitle
          ? `${landmarkTitle} in ${destinationCity}`
          : `Travel inspiration for ${destinationCity}`)
      }
      className={className}
      fill
      loader={isSupabaseStorageImage(src) ? supabaseImageLoader : undefined}
      loading={priority ? undefined : "lazy"}
      onError={() => {
        if (src !== fallbackSrc) {
          setSrc(fallbackSrc);
        }
      }}
      priority={priority}
      quality={80}
      sizes={sizes ?? "(max-width: 640px) 92vw, (max-width: 1024px) 50vw, 33vw"}
      src={src}
      style={{ objectFit: "cover" }}
    />
  );
}
