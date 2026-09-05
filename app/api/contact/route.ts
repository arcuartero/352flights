import { NextResponse } from "next/server";
import { z } from "zod";

import { sendResendEmail } from "@/lib/email";
import { hasResendEnv } from "@/lib/env";
import { locales } from "@/lib/locales";

const CONTACT_EMAIL = "info@352flights.com";

const contactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  reason: z.enum(["general", "deals", "partnership", "privacy", "technical"]),
  subject: z.string().trim().min(2).max(160),
  message: z.string().trim().min(10).max(5000),
  company: z.string().max(0).optional().default(""),
  locale: z.enum(locales).optional().default("en"),
});

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

export async function POST(request: Request) {
  const payload = contactSchema.safeParse(await request.json().catch(() => null));

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid contact form." }, { status: 400 });
  }

  if (!hasResendEnv()) {
    return NextResponse.json({ error: "Email service unavailable." }, { status: 503 });
  }

  const { name, email, reason, subject, message, locale } = payload.data;
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br />");

  try {
    await sendResendEmail({
      to: CONTACT_EMAIL,
      subject: `[352 Flights contact] ${subject}`,
      html: `<h1>New website contact</h1><p><strong>Name:</strong> ${escapeHtml(name)}</p><p><strong>Email:</strong> ${escapeHtml(email)}</p><p><strong>Reason:</strong> ${escapeHtml(reason)}</p><p><strong>Language:</strong> ${escapeHtml(locale)}</p><p><strong>Subject:</strong> ${escapeHtml(subject)}</p><p><strong>Message:</strong><br />${safeMessage}</p>`,
      text: `New website contact\n\nName: ${name}\nEmail: ${email}\nReason: ${reason}\nLanguage: ${locale}\nSubject: ${subject}\n\n${message}`,
      emailType: "contact",
      replyTo: email,
      idempotencyKey: `contact-${crypto.randomUUID()}`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/contact] email failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Message could not be sent." }, { status: 500 });
  }
}
