"use client";

import { ArrowRight, Check, Mail, Send, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { useI18n, type Locale } from "@/lib/i18n";
import { getHomeLocaleFromPathname, parseLocalizedDealsPathname } from "@/lib/locales";
import { newsletterSubscribedEvent, newsletterSubscribedKey, rememberNewsletterSubscription } from "@/lib/newsletter-popup-client";
import { subscriptionErrorMessage, subscriptionSuccessMessage, type SubscriptionApiPayload } from "@/lib/subscription-response";

import "./newsletter-popup.css";

const DELAY_MS = 45_000;
const seenKey = "352flights-newsletter-popup-seen";
const startedKey = "352flights-newsletter-popup-started";
const copy: Record<Locale, { eyebrow: string; title: string; description: string; email: string; submit: string; footnote: string }> = {
  es: { eyebrow: "Alertas por email", title: "No te pierdas las mejores ofertas", description: "Recibe por email oportunidades reales desde Luxemburgo.", email: "Tu email", submit: "Suscribirme gratis", footnote: "Gratis · Baja en 1 clic" },
  en: { eyebrow: "Email alerts", title: "Don’t miss the best flight deals", description: "Get real flight deals from Luxembourg straight to your inbox.", email: "Your email", submit: "Subscribe for free", footnote: "Free · Unsubscribe in 1 click" },
  fr: { eyebrow: "Alertes par email", title: "Ne manquez pas les meilleures offres", description: "Recevez par email de vraies bonnes affaires au départ du Luxembourg.", email: "Votre email", submit: "M’inscrire gratuitement", footnote: "Gratuit · Désinscription en 1 clic" },
  de: { eyebrow: "Angebote per E-Mail", title: "Verpasse keine Flugangebote", description: "Erhalte echte Flugangebote ab Luxemburg direkt in dein Postfach.", email: "Deine E-Mail", submit: "Kostenlos abonnieren", footnote: "Kostenlos · Mit 1 Klick abmelden" },
  pt: { eyebrow: "Alertas por email", title: "Não percas as melhores ofertas", description: "Recebe por email oportunidades reais a partir do Luxemburgo.", email: "O teu email", submit: "Subscrever grátis", footnote: "Grátis · Cancelar em 1 clique" },
  it: { eyebrow: "Avvisi via email", title: "Non perderti le migliori offerte", description: "Ricevi via email vere occasioni per volare dal Lussemburgo.", email: "La tua email", submit: "Iscrivimi gratis", footnote: "Gratis · Cancellazione in 1 clic" },
};

export function NewsletterPopup() {
  const pathname = usePathname();
  const { locale, t } = useI18n();
  const content = copy[locale];
  const eligible = Boolean(getHomeLocaleFromPathname(pathname) || parseLocalizedDealsPathname(pathname));
  const dialogRef = useRef<HTMLDialogElement>(null);
  const shownRef = useRef(false);
  const startedRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!eligible || shownRef.current) return;
    let timer: number;
    let subscribed = false;
    try {
      if (sessionStorage.getItem(seenKey) || localStorage.getItem(newsletterSubscribedKey)) return;
      const storedStart = Number(sessionStorage.getItem(startedKey));
      startedRef.current ??= storedStart > 0 && storedStart <= Date.now() ? storedStart : Date.now();
      sessionStorage.setItem(startedKey, String(startedRef.current));
    } catch {
      startedRef.current ??= Date.now();
    }

    function showWhenReady() {
      if (subscribed) return;
      // Wait for an active tab and for other dialogs or form interactions to finish.
      const active = document.activeElement;
      if (document.visibilityState !== "visible" || document.querySelector('dialog[open], [aria-modal="true"]') || active?.matches("input, textarea, select, [contenteditable=true]")) {
        timer = window.setTimeout(showWhenReady, 1_000);
        return;
      }
      shownRef.current = true;
      try { sessionStorage.setItem(seenKey, "1"); } catch { /* Storage is optional. */ }
      setOpen(true);
    }

    function onSubscribed() {
      subscribed = true;
      window.clearTimeout(timer);
    }
    window.addEventListener(newsletterSubscribedEvent, onSubscribed);
    timer = window.setTimeout(showWhenReady, Math.max(0, DELAY_MS - (Date.now() - startedRef.current!)));
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(newsletterSubscribedEvent, onSubscribed);
    };
  }, [eligible]);

  useEffect(() => {
    if (!eligible) setOpen(false);
  }, [eligible]);

  useEffect(() => {
    if (!open || !eligible) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open, eligible]);

  if (!open || !eligible) return null;

  return (
    <dialog
      ref={dialogRef}
      className="newsletter-popup"
      aria-labelledby="newsletter-popup-title"
      aria-describedby="newsletter-popup-description"
      onCancel={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)");
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setOpen(false);
      }}
    >
      <button autoFocus className="newsletter-popup__close" type="button" aria-label={t("alerts.close")} onClick={() => setOpen(false)}><X size={22} /></button>
      <span className="newsletter-popup__icon" aria-hidden="true"><Send size={32} fill="currentColor" strokeWidth={1.5} /><i /></span>
      <p className="newsletter-popup__eyebrow">{content.eyebrow}</p>
      <h2 id="newsletter-popup-title">{content.title}</h2>
      <p id="newsletter-popup-description" className="newsletter-popup__description">{content.description}</p>
      {status?.tone === "success" ? (
        <div className="newsletter-popup__success" role="status"><Check aria-hidden="true" size={28} /><p>{status.message}</p></div>
      ) : (
        <form data-route-loader="off" className="newsletter-popup__form" onSubmit={(event) => {
          event.preventDefault();
          if (isPending) return;
          const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
          startTransition(async () => {
            setStatus(null);
            try {
              const response = await fetch("/api/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, locale }) });
              const payload = await response.json() as SubscriptionApiPayload;
              if (!response.ok) {
                setStatus({ tone: "error", message: subscriptionErrorMessage(payload, { generic: t("newsletter.error"), invalidEmail: t("newsletter.invalidEmail") }) });
                return;
              }
              rememberNewsletterSubscription();
              setStatus({ tone: "success", message: subscriptionSuccessMessage(payload, { accessLinkSent: t("newsletter.accessLinkSent"), confirmationRequired: t("newsletter.confirm"), savedWithoutEmail: t("newsletter.savedWithoutEmail") }) });
            } catch {
              setStatus({ tone: "error", message: t("newsletter.error") });
            }
          });
        }}>
          <label className="newsletter-popup__field">
            <span className="sr-only">{t("common.emailAddress")}</span>
            <Mail size={23} aria-hidden="true" />
            <input autoComplete="email" name="email" type="email" placeholder={content.email} required disabled={isPending} aria-describedby={status?.tone === "error" ? "newsletter-popup-error" : undefined} />
          </label>
          <button className="newsletter-popup__submit" disabled={isPending} type="submit"><span>{isPending ? t("alerts.sending") : content.submit}</span><ArrowRight size={24} aria-hidden="true" /></button>
          {status?.tone === "error" && <p id="newsletter-popup-error" className="newsletter-popup__error" role="alert">{status.message}</p>}
        </form>
      )}
      <p className="newsletter-popup__footnote">{content.footnote}</p>
    </dialog>
  );
}
