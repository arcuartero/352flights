import { z } from "zod";

const supabaseAdminSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

const resendSchema = z.object({
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().min(1),
  RESEND_REPLY_TO_EMAIL: z.string().email().optional(),
});

const cronSchema = z.object({
  CRON_SECRET: z.string().min(1),
});

function emptyToUndefined(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function hasSupabaseAdminEnv() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdminEnv() {
  return supabaseAdminSchema.parse({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}

export function hasResendEnv() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

export function getResendEnv() {
  return resendSchema.parse({
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    RESEND_REPLY_TO_EMAIL: emptyToUndefined(process.env.RESEND_REPLY_TO_EMAIL),
  });
}

export function hasCronSecret() {
  return Boolean(process.env.CRON_SECRET);
}

export function getCronSecret() {
  return cronSchema.parse({
    CRON_SECRET: process.env.CRON_SECRET,
  });
}

export function getSiteUrl() {
  const value = emptyToUndefined(process.env.NEXT_PUBLIC_SITE_URL);
  if (!value) {
    return "http://localhost:3000";
  }

  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    return "http://localhost:3000";
  }
}
