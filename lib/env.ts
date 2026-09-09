import { z } from "zod";

const supabaseAdminSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

const resendSchema = z.object({
  RESEND_API_KEY: z.string().min(1),
  RESEND_REPLY_TO_EMAIL: z.string().email().optional(),
});

const cronSchema = z.object({
  CRON_SECRET: z.string().min(1),
});

const createlloInboxSchema = z.object({
  CREATELLO_CONTENT_INBOX_URL: z.string().url().refine((value) => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.pathname.endsWith("/api/content-inbox");
  }, "Debe ser la URL completa terminada en /api/content-inbox"),
  CREATELLO_CONTENT_INBOX_HMAC_SECRET: z.string().min(32),
});

const createlloRevalidationSchema = z.object({
  CREATELLO_352_REVALIDATION_HMAC_SECRET: z.string().min(32),
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
  return Boolean(process.env.RESEND_API_KEY);
}

export function getResendEnv() {
  return resendSchema.parse({
    RESEND_API_KEY: process.env.RESEND_API_KEY,
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

export function hasCreatelloInboxEnv() {
  return Boolean(
    process.env.CREATELLO_CONTENT_INBOX_URL
    && process.env.CREATELLO_CONTENT_INBOX_HMAC_SECRET,
  );
}

export function getCreatelloInboxEnv() {
  return createlloInboxSchema.parse({
    CREATELLO_CONTENT_INBOX_URL: process.env.CREATELLO_CONTENT_INBOX_URL,
    CREATELLO_CONTENT_INBOX_HMAC_SECRET: process.env.CREATELLO_CONTENT_INBOX_HMAC_SECRET,
  });
}

export function getCreatelloRevalidationEnv() {
  return createlloRevalidationSchema.parse({
    CREATELLO_352_REVALIDATION_HMAC_SECRET: process.env.CREATELLO_352_REVALIDATION_HMAC_SECRET,
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
