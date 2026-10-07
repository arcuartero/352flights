import "server-only";

import { cookieConfigSchema, defaultCookieConfig, type CookieConfig } from "@/lib/cookie-consent";
import { getSupabaseAdminClient } from "@/lib/supabase";

export async function getCookieConfig(): Promise<CookieConfig> {
  const { data, error } = await getSupabaseAdminClient()
    .from("cookie_banner_settings").select("settings").eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  const parsed = cookieConfigSchema.safeParse(data?.settings);
  return parsed.success ? parsed.data : defaultCookieConfig;
}

export async function saveCookieConfig(config: CookieConfig) {
  const { error } = await getSupabaseAdminClient().from("cookie_banner_settings").upsert({
    id: 1, settings: config, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}
