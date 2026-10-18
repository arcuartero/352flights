import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";

import { cookieConfigSchema, defaultCookieConfig, type CookieConfig } from "@/lib/cookie-consent";
import { getSupabaseAdminClient } from "@/lib/supabase";

export async function getCookieConfig(): Promise<CookieConfig> {
  const { data, error } = await getSupabaseAdminClient()
    .from("cookie_banner_settings").select("settings").eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  const parsed = cookieConfigSchema.safeParse(data?.settings);
  return parsed.success ? parsed.data : defaultCookieConfig;
}

const COOKIE_CONFIG_TAG = "cookie-banner-config";

/** Public banner reads hit this cache instead of Supabase on every page view. */
export const getCachedCookieConfig = unstable_cache(
  getCookieConfig,
  [COOKIE_CONFIG_TAG],
  { revalidate: 300, tags: [COOKIE_CONFIG_TAG] },
);

export async function saveCookieConfig(config: CookieConfig) {
  const { error } = await getSupabaseAdminClient().from("cookie_banner_settings").upsert({
    id: 1, settings: config, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  revalidateTag(COOKIE_CONFIG_TAG);
}
