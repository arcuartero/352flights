"use client";

import { useState, useTransition } from "react";

import { contactCopy } from "@/lib/contact-localization";
import type { Locale } from "@/lib/locales";

type FormStatus = { tone: "idle" | "success" | "error"; message: string };

export function ContactForm({ locale }: { locale: Locale }) {
  const copy = contactCopy[locale];
  const [status, setStatus] = useState<FormStatus>({ tone: "idle", message: "" });
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="v2-contact-form"
      data-route-loader="off"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);

        startTransition(async () => {
          setStatus({ tone: "idle", message: "" });

          try {
            const response = await fetch("/api/contact", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: formData.get("name"),
                email: formData.get("email"),
                reason: formData.get("reason"),
                subject: formData.get("subject"),
                message: formData.get("message"),
                company: formData.get("company"),
                locale,
              }),
            });

            if (!response.ok) {
              setStatus({ tone: "error", message: copy.error });
              return;
            }

            form.reset();
            setStatus({ tone: "success", message: copy.success });
          } catch {
            setStatus({ tone: "error", message: copy.error });
          }
        });
      }}
    >
      <div className="v2-contact-form__row">
        <label>
          <span>{copy.name}</span>
          <input autoComplete="name" maxLength={100} name="name" placeholder={copy.namePlaceholder} required />
        </label>
        <label>
          <span>{copy.email}</span>
          <input autoComplete="email" maxLength={254} name="email" placeholder={copy.emailPlaceholder} required type="email" />
        </label>
      </div>

      <label>
        <span>{copy.reason}</span>
        <select defaultValue="general" name="reason" required>
          {Object.entries(copy.reasons).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>

      <label>
        <span>{copy.subject}</span>
        <input maxLength={160} name="subject" placeholder={copy.subjectPlaceholder} required />
      </label>

      <label>
        <span>{copy.message}</span>
        <textarea maxLength={5000} minLength={10} name="message" placeholder={copy.messagePlaceholder} required rows={7} />
      </label>

      <label className="v2-contact-form__honeypot" aria-hidden="true">
        Company
        <input autoComplete="off" name="company" tabIndex={-1} />
      </label>

      <div className="v2-contact-form__footer">
        <button disabled={isPending} type="submit">
          {isPending ? copy.submitting : copy.submit}
          <span aria-hidden="true">→</span>
        </button>
        <p className={`v2-contact-form__status v2-contact-form__status--${status.tone}`} aria-live="polite">
          {status.message}
        </p>
      </div>
    </form>
  );
}
