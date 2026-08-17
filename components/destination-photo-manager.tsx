"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";

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
  source: "upload" | "unsplash";
  photographer: string | null;
  photographerUrl: string | null;
  photoUrl: string | null;
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

function getPhotoExtension(photo: DestinationPhoto) {
  const extensions: Record<string, string> = {
    "image/avif": "avif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const contentType = photo.contentType?.split(";", 1)[0]?.toLowerCase();
  if (contentType && extensions[contentType]) {
    return extensions[contentType];
  }

  try {
    const pathname = new URL(photo.url).pathname;
    const extension = pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
    if (extension && ["avif", "jpeg", "jpg", "png", "webp"].includes(extension)) {
      return extension === "jpeg" ? "jpg" : extension;
    }
  } catch {
    // Supabase URLs should be valid, but JPG remains a safe fallback.
  }

  return "jpg";
}

function getPhotoFilename(city: string, extension: string) {
  const safeCity = city
    .normalize("NFC")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return `${safeCity || "destination"}.${extension}`;
}

export function DestinationPhotoManager({
  destinations,
}: DestinationPhotoManagerProps) {
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [photos, setPhotos] = useState<Record<string, DestinationPhoto>>({});
  const [query, setQuery] = useState("");
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
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

  const photoCount = destinations.filter((destination) => photos[destination.slug]).length;
  const downloadableCount = destinations.filter(
    (destination) => photos[destination.slug]?.source === "upload",
  ).length;

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

  async function downloadAllPhotos() {
    const uploadedDestinations = destinations.filter(
      (destination) => photos[destination.slug]?.source === "upload",
    );
    if (uploadedDestinations.length === 0 || isDownloading) {
      return;
    }

    setIsDownloading(true);
    setStatus({
      tone: "idle",
      message: `Preparing 0 of ${uploadedDestinations.length} photos...`,
    });

    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      let completed = 0;

      for (let index = 0; index < uploadedDestinations.length; index += 4) {
        const batch = uploadedDestinations.slice(index, index + 4);
        await Promise.all(
          batch.map(async (destination) => {
            const photo = photos[destination.slug];
            const response = await fetch(photo.url, { cache: "no-store" });
            if (!response.ok) {
              throw new Error(`The photo for ${destination.city} could not be downloaded.`);
            }
            const blob = await response.blob();
            const extension = getPhotoExtension({
              ...photo,
              contentType: blob.type || photo.contentType,
            });
            zip.file(getPhotoFilename(destination.city, extension), blob);
            completed += 1;
            setStatus({
              tone: "idle",
              message: `Preparing ${completed} of ${uploadedDestinations.length} photos...`,
            });
          }),
        );
      }

      setStatus({ tone: "idle", message: "Creating ZIP file..." });
      const archive = await zip.generateAsync({
        type: "blob",
        compression: "STORE",
      });
      const downloadUrl = URL.createObjectURL(archive);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `352flights-destination-photos-${new Date()
        .toISOString()
        .slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1_000);
      setStatus({
        tone: "success",
        message: `${uploadedDestinations.length} destination photos downloaded.`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Destination photos could not be downloaded.",
      });
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="destination-photo-manager">
      <div className="destination-photo-manager__toolbar">
        <div className="destination-photo-manager__summary">
          <span className="ops-pill">
            {photoCount}/{destinations.length} photos
          </span>
          <button
            className="ops-button destination-photo-manager__download"
            disabled={downloadableCount === 0 || isDownloading}
            onClick={downloadAllPhotos}
            title="Download every uploaded destination photo in one ZIP file"
            type="button"
          >
            {isDownloading ? (
              <LoaderCircle aria-hidden="true" className="is-spinning" size={17} />
            ) : (
              <Download aria-hidden="true" size={17} />
            )}
            {isDownloading ? "Preparing ZIP..." : "Download all"}
          </button>
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
          aria-live="polite"
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
                  {photo?.source === "unsplash" ? (
                    <>
                      Unsplash · Photo by{" "}
                      <a
                        href={photo.photographerUrl ?? photo.photoUrl ?? undefined}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {photo.photographer ?? "Unsplash contributor"}
                      </a>
                    </>
                  ) : photo ? (
                    [formatUpdatedAt(photo.updatedAt), sizeLabel, photo.contentType]
                      .filter(Boolean)
                      .join(" · ")
                  ) : (
                    "Using generic destination image"
                  )}
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
                  {photo?.source === "upload" ? (
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
