"use client";

import { Heart, Mail, ShieldCheck, X, Zap } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { useI18n } from "@/lib/i18n";

export function V2AlertsModal({ onClose }: { onClose: () => void }) {
  const { locale, t } = useI18n();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ tone: "idle" | "success" | "error"; message: string }>(() => ({
    tone: "idle",
    message: t("alerts.initial"),
  }));
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setStatus((current) =>
      current.tone === "idle" ? { tone: "idle", message: t("alerts.initial") } : current,
    );
  }, [t]);

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
      setStatus({ tone: "idle", message: t("alerts.sendingLink") });
      try {
        const response = await fetch("/api/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmed, locale }),
        });
        const payload = (await response.json()) as { message?: string; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? t("alerts.sendError"));
        }
        setStatus({
          tone: "success",
          message: payload.message ?? t("alerts.checkInbox"),
        });
      } catch (error) {
        setStatus({
          tone: "error",
          message: error instanceof Error ? error.message : t("alerts.sendError"),
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
        <button aria-label="Close" className="v2-modal__close" onClick={onClose} type="button">
          <X strokeWidth={2} />
        </button>

        <div className="v2-modal__main">
          <p className="v2-eyebrow">{t("common.alerts")}</p>
          <h2 id="v2-alerts-title">{t("alerts.title")}</h2>
          <p className="v2-modal__lede">
            {t("alerts.lede")}
          </p>

          <form
            className="v2-modal__form"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <label className="v2-modal__field" htmlFor="v2-alerts-email">
              <span>{t("common.emailAddress")}</span>
              <div className="v2-modal__input">
                <Mail strokeWidth={1.8} />
                <input
                  autoComplete="email"
                  id="v2-alerts-email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="iwantcheapflights@gmail.com"
                  type="email"
                  value={email}
                />
              </div>
            </label>

            <div className="v2-modal__actions">
              <button className="v2-modal__primary" disabled={isPending} type="submit">
                {isPending ? t("alerts.sending") : t("alerts.emailMe")}
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

          <p className={`v2-modal__status v2-modal__status--${status.tone}`}>{status.message}</p>
        </div>

        <aside className="v2-modal__aside" aria-hidden="true">
          <div className="v2-modal__aside-card">
            <span className="v2-modal__aside-route">LUX → FCO</span>
            <strong>€44</strong>
            <em>−41% · this morning</em>
          </div>
          <ul className="v2-modal__benefits">
            <li>
              <ShieldCheck strokeWidth={1.8} /> {t("alerts.secure")}
            </li>
            <li>
              <Zap strokeWidth={1.8} /> {t("alerts.instant")}
            </li>
            <li>
              <Heart strokeWidth={1.8} /> {t("alerts.personal")}
            </li>
          </ul>
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
