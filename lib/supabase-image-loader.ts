import type { ImageLoaderProps } from "next/image";

const SUPABASE_OBJECT_PATH = "/storage/v1/object/public/";
const SUPABASE_RENDER_PATH = "/storage/v1/render/image/public/";
const MIN_DESTINATION_IMAGE_WIDTH = 480;
const MAX_DESTINATION_IMAGE_WIDTH = 1200;

export function isSupabaseStorageImage(src: string) {
  try {
    const url = new URL(src);
    return url.hostname.endsWith(".supabase.co") && url.pathname.includes(SUPABASE_OBJECT_PATH);
  } catch {
    return false;
  }
}

export function supabaseImageLoader({ src, width, quality }: ImageLoaderProps) {
  const url = new URL(src);
  url.pathname = url.pathname.replace(SUPABASE_OBJECT_PATH, SUPABASE_RENDER_PATH);
  url.searchParams.set(
    "width",
    String(Math.max(MIN_DESTINATION_IMAGE_WIDTH, Math.min(width, MAX_DESTINATION_IMAGE_WIDTH))),
  );
  url.searchParams.set("quality", String(quality ?? 80));
  url.searchParams.set("resize", "cover");
  return url.toString();
}
