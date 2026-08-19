"use client";

import { ArrowRight, Bell, LockKeyhole, Mail, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState, useTransition } from "react";

import { useI18n } from "@/lib/i18n";
import {
  subscriptionErrorMessage,
  subscriptionSuccessMessage,
  type SubscriptionApiPayload,
} from "@/lib/subscription-response";

export function V2AlertsModal({ onClose }: { onClose: () => void }) {
  const { locale, t } = useI18n();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{
    tone: "idle" | "pending" | "success" | "error";
    message: string;
  }>(() => ({
    tone: "idle",
    message: "",
  }));
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function submit() {
    const trimmed = email.trim();
    if (!trimmed) {
      setStatus({ tone: "error", message: t("alerts.enterEmail") });
      return;
    }
    startTransition(async () => {
      setStatus({ tone: "pending", message: t("alerts.sendingLink") });
      try {
        const response = await fetch("/api/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmed, locale }),
        });
        const payload = (await response.json()) as SubscriptionApiPayload;
        if (!response.ok) {
          setStatus({
            tone: "error",
            message: subscriptionErrorMessage(payload, {
              generic: t("alerts.sendError"),
              invalidEmail: t("alerts.enterEmail"),
            }),
          });
          return;
        }
        setStatus({
          tone: "success",
          message: subscriptionSuccessMessage(payload, {
            accessLinkSent: t("alerts.accessLinkSent"),
            confirmationRequired: t("alerts.checkInbox"),
            savedWithoutEmail: t("alerts.savedWithoutEmail"),
          }),
        });
      } catch {
        setStatus({
          tone: "error",
          message: t("alerts.sendError"),
        });
      }
    });
  }

  return (
    <div
      className="v2-modal"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby="v2-alerts-title"
        aria-modal="true"
        className="v2-modal__dialog"
        role="dialog"
      >
        <button aria-label={t("alerts.close")} className="v2-modal__close" onClick={onClose} type="button">
          <X strokeWidth={2} />
        </button>

        <div className="v2-modal__main">
          <span className="v2-modal__bell" aria-hidden="true">
            <Bell strokeWidth={1.9} />
            <i />
          </span>
          <p className="v2-modal__eyebrow">{t("alerts.eyebrow")}</p>
          <h2 id="v2-alerts-title">
            {t("alerts.titleBefore")} <em>{t("alerts.titleAccent")}</em>
          </h2>
          <p className="v2-modal__lede">
            {t("alerts.lede")}
          </p>

          <form
            className="v2-modal__form"
            data-route-loader="off"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <label className="v2-modal__field" htmlFor="v2-alerts-email">
              <span className="sr-only">{t("common.emailAddress")}</span>
              <div className="v2-modal__input">
                <Mail strokeWidth={1.8} />
                <input
                  autoComplete="email"
                  autoFocus
                  id="v2-alerts-email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t("common.emailPlaceholder")}
                  type="email"
                  value={email}
                />
              </div>
            </label>

            <div className="v2-modal__actions">
              <button className="v2-modal__primary" disabled={isPending} type="submit">
                <span>{isPending ? t("alerts.sending") : t("alerts.emailMe")}</span>
                <i aria-hidden="true">
                  <ArrowRight strokeWidth={2} />
                </i>
              </button>
              <button
                className="v2-modal__secondary"
                disabled={isPending}
                onClick={submit}
                type="button"
              >
                {t("alerts.manage")}
              </button>
            </div>
          </form>

          {status.message ? (
            <p className={`v2-modal__status v2-modal__status--${status.tone}`} role="status">
              {status.message}
            </p>
          ) : null}

          <p className="v2-modal__privacy">
            <LockKeyhole strokeWidth={1.8} aria-hidden="true" />
            {t("alerts.privacy")}
          </p>
        </div>

        <aside className="v2-modal__aside" aria-hidden="true">
          <Image
            alt=""
            fill
            priority
            sizes="(max-width: 760px) 32rem, 25rem"
            src="/alerts-airplane-window.webp"
          />
        </aside>
      </section>
    </div>
  );
}

export function V2AlertsButton() {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button className="v2-topbar__cta" onClick={() => setIsOpen(true)} type="button">
        {t("common.alerts")}
      </button>
      {isOpen ? <V2AlertsModal onClose={() => setIsOpen(false)} /> : null}
    </>
  );
}
