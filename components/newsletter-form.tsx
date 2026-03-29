"use client";

import { useState, useTransition } from "react";

type FormStatus =
  | { tone: "idle"; message: string }
  | { tone: "success"; message: string }
  | { tone: "error"; message: string };

const initialStatus: FormStatus = {
  tone: "idle",
  message: "No spam, no generic airfare roundups. Only routes we actively scan from Luxembourg.",
};

export function NewsletterForm() {
  const [status, setStatus] = useState<FormStatus>(initialStatus);
  const [isPending, startTransition] = useTransition();

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
            message: "Submitting your seat on the list...",
          });

          try {
            const response = await fetch("/api/subscribe", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ email }),
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
                  ? "Check your inbox to confirm your subscription."
                  : "You're in."),
            });
          } catch (error) {
            setStatus({
              tone: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "We could not save your email right now.",
            });
          }
        });
      }}
    >
      <label className="sr-only" htmlFor="email">
        Email address
      </label>
      <div className="newsletter-form__controls">
        <input
          autoComplete="email"
          className="newsletter-form__input"
          id="email"
          name="email"
          placeholder="you@company.com"
          required
          type="email"
        />
        <button className="newsletter-form__button" disabled={isPending} type="submit">
          {isPending ? "Joining..." : "Join the waitlist"}
        </button>
      </div>
      <p className={`newsletter-form__status newsletter-form__status--${status.tone}`}>
        {status.message}
      </p>
    </form>
  );
}
