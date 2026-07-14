"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Destination = {
  city: string;
  slug: string;
  airports: string[];
};

type DestinationPhoto = {
  url: string;
  updatedAt: string | null;
  size: number | null;
  contentType: string | null;
};

type DestinationPhotoPayload = {
  photos: Record<string, DestinationPhoto>;
};

type DestinationPhotoManagerProps = {
  destinations: Destination[];
};

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return "Uploaded";
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatSize(value: number | null) {
  if (!value) {
    return null;
  }
  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function DestinationPhotoManager({
  destinations,
}: DestinationPhotoManagerProps) {
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [photos, setPhotos] = useState<Record<string, DestinationPhoto>>({});
  const [query, setQuery] = useState("");
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    tone: "idle" | "success" | "error";
    message: string;
  }>({ tone: "idle", message: "" });

  const filteredDestinations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return destinations;
    }
    return destinations.filter((destination) => {
      return (
        destination.city.toLowerCase().includes(normalizedQuery) ||
        destination.airports.some((airport) =>
          airport.toLowerCase().includes(normalizedQuery),
        )
      );
    });
  }, [destinations, query]);

  const uploadedCount = destinations.filter((destination) => photos[destination.slug]).length;

  async function refreshPhotos() {
    const response = await fetch("/api/destination-photos", {
      cache: "no-store",
    });
    const payload = (await response.json()) as DestinationPhotoPayload;
    if (!response.ok) {
      throw new Error("Destination photos could not be loaded.");
    }
    setPhotos(payload.photos ?? {});
  }

  useEffect(() => {
    refreshPhotos().catch((error) => {
      setStatus({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Destination photos could not be loaded.",
      });
    });
  }, []);

  async function uploadPhoto(destination: Destination) {
    const file = fileInputs.current[destination.slug]?.files?.[0];
    if (!file) {
      setStatus({
        tone: "error",
        message: `Choose a photo for ${destination.city} first.`,
      });
      return;
    }

    const formData = new FormData();
    formData.append("destinationCity", destination.city);
    formData.append("destinationSlug", destination.slug);
    formData.append("photo", file);

    setPendingSlug(destination.slug);
    setStatus({ tone: "idle", message: "" });

    try {
      const response = await fetch("/api/ops/destination-photos", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Destination photo could not be uploaded.");
      }
      fileInputs.current[destination.slug]!.value = "";
      await refreshPhotos();
      setStatus({
        tone: "success",
        message: payload.message ?? `${destination.city} photo uploaded.`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Destination photo could not be uploaded.",
      });
    } finally {
      setPendingSlug(null);
    }
  }

  async function removePhoto(destination: Destination) {
    setPendingSlug(destination.slug);
    setStatus({ tone: "idle", message: "" });

    try {
      const response = await fetch(
        `/api/ops/destination-photos?slug=${encodeURIComponent(destination.slug)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as {
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Destination photo could not be removed.");
      }
      await refreshPhotos();
      setStatus({
        tone: "success",
        message: `${destination.city} will use the generic fallback image again.`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Destination photo could not be removed.",
      });
    } finally {
      setPendingSlug(null);
    }
  }

  return (
    <div className="destination-photo-manager">
      <div className="destination-photo-manager__toolbar">
        <div>
          <span className="ops-pill">
            {uploadedCount}/{destinations.length} uploaded
          </span>
        </div>
        <label className="destination-photo-manager__search">
          <span>Search destination</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Gran Canaria, LPA..."
            type="search"
            value={query}
          />
        </label>
      </div>

      {status.message ? (
        <p
          className={`destination-photo-manager__status destination-photo-manager__status--${status.tone}`}
          role="status"
        >
          {status.message}
        </p>
      ) : null}

      <div className="destination-photo-manager__grid">
        {filteredDestinations.map((destination) => {
          const photo = photos[destination.slug];
          const isPending = pendingSlug === destination.slug;
          const sizeLabel = formatSize(photo?.size ?? null);

          return (
            <article className="destination-photo-card" key={destination.slug}>
              <div className="destination-photo-card__preview">
                {photo ? (
                  <img alt={destination.city} src={photo.url} />
                ) : (
                  <div className="destination-photo-card__empty">
                    <span>{destination.city.slice(0, 2).toUpperCase()}</span>
                  </div>
                )}
              </div>
              <div className="destination-photo-card__body">
                <div>
                  <h3>{destination.city}</h3>
                  <p>{destination.airports.join(", ")}</p>
                </div>
                <p className="destination-photo-card__meta">
                  {photo
                    ? [formatUpdatedAt(photo.updatedAt), sizeLabel, photo.contentType]
                        .filter(Boolean)
                        .join(" · ")
                    : "Using generic destination image"}
                </p>
                <input
                  accept="image/avif,image/jpeg,image/png,image/webp"
                  ref={(element) => {
                    fileInputs.current[destination.slug] = element;
                  }}
                  type="file"
                />
                <div className="destination-photo-card__actions">
                  <button
                    className="ops-button"
                    disabled={isPending}
                    onClick={() => uploadPhoto(destination)}
                    type="button"
                  >
                    {isPending ? "Uploading..." : photo ? "Replace photo" : "Upload photo"}
                  </button>
                  {photo ? (
                    <button
                      className="ops-button ops-button--ghost"
                      disabled={isPending}
                      onClick={() => removePhoto(destination)}
                      type="button"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
