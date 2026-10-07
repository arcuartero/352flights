import "server-only";
import type { CampaignSendType } from "@/lib/ops-shared";
import { getResendEnv } from "@/lib/env";

type SendResendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  emailType: "campaign" | "campaign_test" | "welcome" | "ops_alert" | "contact";
  sendType?: CampaignSendType;
  idempotencyKey: string;
  replyTo?: string;
  /** RFC 8058 one-click endpoint; required by Gmail/Yahoo for bulk mail. */
  listUnsubscribeUrl?: string;
};

const RESEND_NOREPLY_FROM = "352 Flights <noreply@352flights.com>";

const RESEND_ALERTS_FROM = "352 Flights <alerts@352flights.com>";

export function getResendFromEmail(
  emailType: SendResendEmailInput["emailType"],
) {
  return emailType === "campaign" || emailType === "campaign_test"
    ? RESEND_ALERTS_FROM
    : RESEND_NOREPLY_FROM;
}

export async function sendResendEmail(input: SendResendEmailInput) {
  const env = getResendEnv();

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    // Safe to retry after a timeout: the idempotency key deduplicates at Resend.
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      from: getResendFromEmail(input.emailType),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(input.listUnsubscribeUrl
        ? {
            headers: {
              "List-Unsubscribe": `<${input.listUnsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }
        : {}),
      ...((
        input.replyTo !== undefined ? input.replyTo : env.RESEND_REPLY_TO_EMAIL
      )
        ? { replyTo: input.replyTo ?? env.RESEND_REPLY_TO_EMAIL }
        : {}),
      tags: [
        {
          name: "product",
          value: "352flights",
        },
        {
          name: "email_type",
          value: input.emailType,
        },
        ...(input.sendType
          ? [
              {
                name: "send_type",
                value: input.sendType,
              },
            ]
          : []),
      ],
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    id?: string;
    message?: string;
    error?: string;
  } | null;

  if (!response.ok || !payload?.id) {
    throw new Error(
      payload?.message ??
        payload?.error ??
        "Resend rejected the email request.",
    );
  }

  return payload.id;
}
