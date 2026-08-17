import { revalidateTag, unstable_cache } from "next/cache";

import unsplashDestinationPhotos from "@/data/unsplash-destination-photos.json";
import { hasSupabaseAdminEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase";

export const DESTINATION_PHOTO_BUCKET = "destination-photos";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export type DestinationPhotoEntry = {
  slug: string;
  url: string;
  updatedAt: string | null;
  size: number | null;
  contentType: string | null;
  source: "upload" | "unsplash";
  photographer: string | null;
  photographerUrl: string | null;
  photoUrl: string | null;
};

type UnsplashDestinationPhoto = {
  slug: string;
  url: string;
  photographer: string;
  photographerUrl: string | null;
  photoUrl: string;
};

type StorageListItem = {
  name: string;
  updated_at?: string | null;
  created_at?: string | null;
  metadata?: {
    size?: number;
    mimetype?: string;
    contentType?: string;
  } | null;
};

function normalizeSlug(value: string) {
  return value.trim().toLowerCase();
}

function isMissingBucketError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const message = "message" in error ? String(error.message) : "";
  return /bucket.*not.*found|not found|does not exist/i.test(message);
}

function getDestinationPhotoUrl(slug: string, updatedAt?: string | null) {
  const supabase = getSupabaseAdminClient();
  const { data } = supabase.storage
    .from(DESTINATION_PHOTO_BUCKET)
    .getPublicUrl(slug);
  if (!updatedAt) {
    return data.publicUrl;
  }
  return `${data.publicUrl}?v=${encodeURIComponent(updatedAt)}`;
}

async function ensureDestinationPhotoBucket() {
  const supabase = getSupabaseAdminClient();
  const existing = await supabase.storage.getBucket(DESTINATION_PHOTO_BUCKET);
  if (!existing.error) {
    return;
  }
  if (!isMissingBucketError(existing.error)) {
    throw existing.error;
  }

  const created = await supabase.storage.createBucket(DESTINATION_PHOTO_BUCKET, {
    public: true,
    allowedMimeTypes: [...ALLOWED_IMAGE_TYPES],
    fileSizeLimit: MAX_IMAGE_BYTES,
  });
  if (created.error && !isMissingBucketError(created.error)) {
    throw created.error;
  }
}

export async function listDestinationPhotos(): Promise<DestinationPhotoEntry[]> {
  const photos = new Map<string, DestinationPhotoEntry>(
    (unsplashDestinationPhotos as UnsplashDestinationPhoto[]).map((photo) => [
      photo.slug,
      {
        slug: photo.slug,
        url: photo.url,
        updatedAt: null,
        size: null,
        contentType: "image/jpeg",
        source: "unsplash",
        photographer: photo.photographer,
        photographerUrl: photo.photographerUrl,
        photoUrl: photo.photoUrl,
      },
    ]),
  );

  if (!hasSupabaseAdminEnv()) {
    return [...photos.values()].sort((left, right) => left.slug.localeCompare(right.slug));
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(DESTINATION_PHOTO_BUCKET)
    .list("", {
      limit: 1000,
      sortBy: { column: "name", order: "asc" },
    });

  if (error) {
    if (isMissingBucketError(error)) {
      return [...photos.values()].sort((left, right) => left.slug.localeCompare(right.slug));
    }
    throw error;
  }

  for (const item of (data ?? []) as StorageListItem[]) {
    if (!item.name || item.name.includes("/")) {
      continue;
    }

    const updatedAt = item.updated_at ?? item.created_at ?? null;
    photos.set(item.name, {
      slug: item.name,
      url: getDestinationPhotoUrl(item.name, updatedAt),
      updatedAt,
      size: item.metadata?.size ?? null,
      contentType: item.metadata?.mimetype ?? item.metadata?.contentType ?? null,
      source: "upload",
      photographer: null,
      photographerUrl: null,
      photoUrl: null,
    });
  }

  return [...photos.values()].sort((left, right) => left.slug.localeCompare(right.slug));
}

async function getDestinationPhotoUrlMapUncached(): Promise<Record<string, string>> {
  const photos = await listDestinationPhotos();
  return Object.fromEntries(photos.map((photo) => [photo.slug, photo.url]));
}

const getCachedDestinationPhotoUrlMap = unstable_cache(
  getDestinationPhotoUrlMapUncached,
  ["destination-photo-url-map-v2"],
  { revalidate: 3600, tags: ["destination-photos"] },
);

export async function getDestinationPhotoUrlMap(): Promise<Record<string, string>> {
  return getCachedDestinationPhotoUrlMap();
}

export async function uploadDestinationPhoto(input: {
  slug: string;
  bytes: Buffer;
  contentType: string;
}) {
  if (!hasSupabaseAdminEnv()) {
    throw new Error("Supabase is not configured.");
  }

  const slug = normalizeSlug(input.slug);
  if (!slug) {
    throw new Error("Destination slug is required.");
  }
  if (!ALLOWED_IMAGE_TYPES.has(input.contentType)) {
    throw new Error("Only JPG, PNG, WebP, and AVIF images are allowed.");
  }
  if (input.bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("The image is too large. Use an image smaller than 6 MB.");
  }

  await ensureDestinationPhotoBucket();

  const supabase = getSupabaseAdminClient();
  const uploaded = await supabase.storage
    .from(DESTINATION_PHOTO_BUCKET)
    .upload(slug, input.bytes, {
      cacheControl: "3600",
      contentType: input.contentType,
      upsert: true,
    });

  if (uploaded.error) {
    throw uploaded.error;
  }

  revalidateTag("destination-photos");

  const updatedAt = new Date().toISOString();
  return {
    slug,
    url: getDestinationPhotoUrl(slug, updatedAt),
    updatedAt,
    size: input.bytes.byteLength,
    contentType: input.contentType,
    source: "upload",
    photographer: null,
    photographerUrl: null,
    photoUrl: null,
  } satisfies DestinationPhotoEntry;
}

export async function deleteDestinationPhoto(slugInput: string) {
  if (!hasSupabaseAdminEnv()) {
    throw new Error("Supabase is not configured.");
  }

  const slug = normalizeSlug(slugInput);
  if (!slug) {
    throw new Error("Destination slug is required.");
  }

  const supabase = getSupabaseAdminClient();
  const removed = await supabase.storage
    .from(DESTINATION_PHOTO_BUCKET)
    .remove([slug]);

  if (removed.error && !isMissingBucketError(removed.error)) {
    throw removed.error;
  }

  revalidateTag("destination-photos");
}
