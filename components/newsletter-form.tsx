"use client";

import { useEffect, useState, useTransition } from "react";

import { useI18n } from "@/lib/i18n";

type FormStatus =
  | { tone: "idle"; message: string }
  | { tone: "success"; message: string }
  | { tone: "error"; message: string };

export function NewsletterForm() {
  const { locale, t } = useI18n();
  const [status, setStatus] = useState<FormStatus>(() => ({
    tone: "idle",
    message: t("newsletter.idle"),
  }));
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setStatus((current) =>
      current.tone === "idle" ? { tone: "idle", message: t("newsletter.idle") } : current,
    );
  }, [t]);

  return (
    <form
      className="newsletter-form"
      onSubmit={(event) => {
        event.preventDefault();

        const form = event.currentTarget;
        const formData = new FormData(form);
        const email = String(formData.get("email") ?? "").trim();

        startTransition(async () => {
          setStatus({
            tone: "idle",
            message: t("newsletter.submitting"),
          });

          try {
            const response = await fetch("/api/subscribe", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ email, locale }),
            });

            const payload = (await response.json()) as {
              message?: string;
              error?: string;
              requiresConfirmation?: boolean;
            };

            if (!response.ok) {
              throw new Error(payload.error ?? "Subscription failed.");
            }

            form.reset();
            setStatus({
              tone: "success",
              message:
                payload.message ??
                (payload.requiresConfirmation
                  ? t("newsletter.confirm")
                  : t("newsletter.success")),
            });
          } catch (error) {
            setStatus({
              tone: "error",
              message:
                error instanceof Error
                  ? error.message
                  : t("newsletter.error"),
            });
          }
        });
      }}
    >
      <label className="sr-only" htmlFor="email">
        {t("common.emailAddress")}
      </label>
      <div className="newsletter-form__controls">
        <input
          autoComplete="email"
          className="newsletter-form__input"
          id="email"
          name="email"
          placeholder="Iwantcheapflights@gmail.com"
          required
          type="email"
        />
        <button className="newsletter-form__button" disabled={isPending} type="submit">
          {isPending ? t("common.joining") : t("common.joinNow")}
        </button>
      </div>
      <p className={`newsletter-form__status newsletter-form__status--${status.tone}`}>
        {status.message}
      </p>
    </form>
  );
}
