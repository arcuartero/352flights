import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { sendResendEmail } from "@/lib/email";
import {
  deliverDigestOnce,
  type DigestMessageStore,
} from "@/lib/digest-idempotency";

type EmailInput = Parameters<typeof sendResendEmail>[0];
function fail(error: { message: string } | null) {
  if (error) throw new Error(`Scheduled digest storage: ${error.message}`);
}
export async function getScheduledDigestJob<T>(
  date: string,
  prepare: () => Promise<T>,
  cadence: "digest" | "weekly" = "digest",
) {
  const db = getSupabaseAdminClient();
  const table =
    cadence === "weekly" ? "scheduled_weekly_jobs" : "scheduled_digest_jobs";
  const existing = await db
    .from(table)
    .select("id,model")
    .eq("delivery_date", date)
    .maybeSingle();
  fail(existing.error);
  if (existing.data) return existing.data as { id: string; model: T };
  const model = await prepare();
  const insert = await db.from(table).upsert(
    { delivery_date: date, model },
    {
      onConflict: "delivery_date",
      ignoreDuplicates: true,
    },
  );
  fail(insert.error);
  // Read the winner of a concurrent reservation, never use the loser's new snapshot.
  const saved = await db
    .from(table)
    .select("id,model")
    .eq("delivery_date", date)
    .single();
  fail(saved.error);
  return saved.data as { id: string; model: T };
}
const messageStore: DigestMessageStore<EmailInput> = {
  async reserve(key, payload) {
    const db = getSupabaseAdminClient();
    const insert = await db.from("scheduled_digest_messages").upsert(
      { idempotency_key: key, payload },
      {
        onConflict: "idempotency_key",
        ignoreDuplicates: true,
      },
    );
    fail(insert.error);
    const saved = await db
      .from("scheduled_digest_messages")
      .select("payload,first_attempt_at,provider_message_id")
      .eq("idempotency_key", key)
      .single();
    fail(saved.error);
    return {
      payload: saved.data!.payload as EmailInput,
      firstAttemptAt: saved.data!.first_attempt_at as string,
      providerMessageId: saved.data!.provider_message_id as string | null,
    };
  },
  async acknowledge(key, providerMessageId) {
    const result = await getSupabaseAdminClient()
      .from("scheduled_digest_messages")
      .update({
        provider_message_id: providerMessageId,
        sent_at: new Date().toISOString(),
      })
      .eq("idempotency_key", key);
    fail(result.error);
  },
};
export function sendScheduledDigestEmail(input: EmailInput) {
  return deliverDigestOnce(
    messageStore,
    input.idempotencyKey,
    {
      ...input,
      replyTo: input.replyTo ?? process.env.RESEND_REPLY_TO_EMAIL ?? "",
    },
    sendResendEmail,
  );
}
