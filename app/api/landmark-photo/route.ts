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
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildPlaceholderSvg(destinationCity: string, landmarkTitle: string) {
  const city = escapeXml(destinationCity);
  const landmark = escapeXml(landmarkTitle);

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 640" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0d1a2a" />
          <stop offset="100%" stop-color="#1a2940" />
        </linearGradient>
        <linearGradient id="glow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="rgba(212,149,53,0.18)" />
          <stop offset="100%" stop-color="rgba(212,149,53,0)" />
        </linearGradient>
      </defs>
      <rect width="960" height="640" fill="url(#bg)" />
      <circle cx="790" cy="100" r="180" fill="url(#glow)" />
      <path d="M120 500C240 440 310 390 390 340C470 290 560 270 700 270C775 270 830 286 900 320V640H120Z" fill="rgba(255,255,255,0.06)" />
      <path d="M340 520V330H390V520M435 520V250H485V520M530 520V380H580V520" fill="none" stroke="rgba(244,238,227,0.16)" stroke-width="24" stroke-linecap="round" />
      <text x="72" y="92" fill="#d49535" font-family="Avenir Next, Segoe UI, sans-serif" font-size="28" letter-spacing="8">LANDMARK</text>
      <text x="72" y="500" fill="#fffaf1" font-family="Iowan Old Style, Palatino Linotype, serif" font-size="60" font-weight="600">${city}</text>
      <text x="72" y="554" fill="rgba(244,238,227,0.78)" font-family="Avenir Next, Segoe UI, sans-serif" font-size="30">${landmark}</text>
    </svg>
  `;
}

function normalizeDestinationKey(value: string) {
  return value.trim().toLowerCase();
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

  return new Response(buildPlaceholderSvg(destinationCity, landmarkTitle), {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      "Content-Type": "image/svg+xml; charset=utf-8",
    },
  });
}
