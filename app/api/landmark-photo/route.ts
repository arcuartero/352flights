import { NextResponse } from "next/server";

type WikipediaSummaryResponse = {
  thumbnail?: {
    source?: string;
  };
  originalimage?: {
    source?: string;
  };
};

type UnsplashPhoto = {
  alt_description?: string | null;
  description?: string | null;
  slug?: string | null;
  urls?: {
    raw?: string;
    regular?: string;
  };
};

type UnsplashSearchResponse = {
  results?: UnsplashPhoto[];
};

type PhotoSource = {
  provider: "unsplash" | "wikipedia";
  src: string;
};

const WIKIPEDIA_FETCH_TIMEOUT_MS = 2500;
const UNSPLASH_FETCH_TIMEOUT_MS = 2500;

const REJECTED_IMAGE_URL_PATTERNS = [
  "blank_map",
  "coat_of_arms",
  "emblem",
  "flag_",
  "flag-of",
  "flag_of",
  "location_map",
  "logo",
  "map_",
  "seal_",
];

const LANDMARK_CANDIDATES_BY_CITY: Record<string, string[]> = {
  faro: ["Arco da Vila", "Faro Cathedral"],
  malta: ["St. John's Co-Cathedral", "Valletta"],
  "palma de mallorca": ["Palma Cathedral", "Palma de Mallorca"],
};

const COASTAL_DESTINATIONS = new Set([
  "faro",
  "malta",
  "palma",
  "palma de mallorca",
]);

function normalizeDestinationKey(value: string) {
  return value.trim().toLowerCase();
}

function getLocalPhotoFallback(destinationCity: string) {
  return COASTAL_DESTINATIONS.has(normalizeDestinationKey(destinationCity))
    ? "/destinations/coastal-town.webp"
    : "/destinations/european-city.webp";
}

function isRejectedWikipediaImage(src: string) {
  const normalized = decodeURIComponent(src).toLowerCase();
  return REJECTED_IMAGE_URL_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function isRejectedImageText(value: string) {
  const normalized = value.toLowerCase();
  return REJECTED_IMAGE_URL_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function buildPhotoCandidates(landmarkTitle: string, destinationCity: string) {
  const cityCandidates = LANDMARK_CANDIDATES_BY_CITY[normalizeDestinationKey(destinationCity)] ?? [];

  return Array.from(
    new Set(
      [landmarkTitle, ...cityCandidates, destinationCity]
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}

function buildUnsplashQuery(candidate: string, destinationCity: string) {
  const city = destinationCity.trim();
  return candidate.toLowerCase() === city.toLowerCase()
    ? `${city} city landmark architecture`
    : `${candidate} ${city} landmark architecture`;
}

function buildUnsplashImageUrl(photo: UnsplashPhoto) {
  const base = photo.urls?.raw ?? photo.urls?.regular;
  if (!base || isRejectedWikipediaImage(base)) {
    return null;
  }

  const photoText = [photo.alt_description, photo.description, photo.slug].filter(Boolean).join(" ");
  if (photoText && isRejectedImageText(photoText)) {
    return null;
  }

  if (!photo.urls?.raw) {
    return base;
  }

  const url = new URL(base);
  url.searchParams.set("auto", "format");
  url.searchParams.set("fit", "crop");
  url.searchParams.set("w", "1800");
  url.searchParams.set("q", "82");
  return url.toString();
}

async function loadUnsplashPhotoForQuery(query: string): Promise<PhotoSource | null> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!accessKey) {
    return null;
  }

  const params = new URLSearchParams({
    content_filter: "high",
    orientation: "landscape",
    order_by: "relevant",
    per_page: "5",
    query,
  });

  const response = await fetch(`https://api.unsplash.com/search/photos?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Client-ID ${accessKey}`,
    },
    signal: AbortSignal.timeout(UNSPLASH_FETCH_TIMEOUT_MS),
    next: {
      revalidate: 60 * 60 * 24,
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as UnsplashSearchResponse;
  for (const photo of payload.results ?? []) {
    const src = buildUnsplashImageUrl(photo);
    if (src) {
      return { provider: "unsplash", src };
    }
  }

  return null;
}

async function loadUnsplashPhoto(landmarkTitle: string, destinationCity: string) {
  for (const candidate of buildPhotoCandidates(landmarkTitle, destinationCity)) {
    try {
      const photo = await loadUnsplashPhotoForQuery(buildUnsplashQuery(candidate, destinationCity));
      if (photo) {
        return photo;
      }
    } catch {
      // Fall through to the next Unsplash query or the Wikipedia fallback.
    }
  }

  return null;
}

async function loadWikipediaPhotoForTitle(title: string): Promise<PhotoSource | null> {
  const response = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    {
      headers: {
        accept: "application/json",
      },
      signal: AbortSignal.timeout(WIKIPEDIA_FETCH_TIMEOUT_MS),
      next: {
        revalidate: 60 * 60 * 24,
      },
    },
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as WikipediaSummaryResponse;
  const src = payload.originalimage?.source ?? payload.thumbnail?.source ?? null;
  if (!src || isRejectedWikipediaImage(src)) {
    return null;
  }

  return { provider: "wikipedia", src };
}

async function loadWikipediaPhoto(landmarkTitle: string, destinationCity: string) {
  for (const candidate of buildPhotoCandidates(landmarkTitle, destinationCity)) {
    try {
      const photo = await loadWikipediaPhotoForTitle(candidate);
      if (photo) {
        return photo;
      }
    } catch {
      // Fall through to the next candidate or the local SVG placeholder.
    }
  }

  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const destinationCity = url.searchParams.get("city")?.trim() || "Destination";
  const landmarkTitle = url.searchParams.get("landmark")?.trim() || destinationCity;
  const photo =
    (await loadUnsplashPhoto(landmarkTitle, destinationCity)) ??
    (await loadWikipediaPhoto(landmarkTitle, destinationCity));

  if (photo) {
    const response = NextResponse.redirect(photo.src, 307);
    response.headers.set("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    response.headers.set("X-Photo-Source", photo.provider);
    return response;
  }

  const response = NextResponse.redirect(
    new URL(getLocalPhotoFallback(destinationCity), request.url),
    307,
  );
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Photo-Source", "local-fallback");
  return response;
}
