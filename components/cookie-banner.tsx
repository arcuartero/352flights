"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { getLocalizedLegalPath } from "@/lib/legal-localization";
import {
  cookieCategories, cookieConfigReadyEvent, defaultCookieChoices, defaultCookieConfig, readConsentRevision,
  readCookieChoices, saveCookieChoices, openCookiePreferencesEvent, type CookieChoices,
  type CookieConfig, type CookieDecision,
} from "@/lib/cookie-consent";

const policyLabels = {
  en: { cookies: "Cookie policy", privacy: "Privacy policy" },
  fr: { cookies: "Politique des cookies", privacy: "Politique de confidentialité" },
  de: { cookies: "Cookie-Richtlinie", privacy: "Datenschutz" },
  pt: { cookies: "Política de cookies", privacy: "Política de privacidade" },
  it: { cookies: "Informativa sui cookie", privacy: "Informativa sulla privacy" },
  es: { cookies: "Política de cookies", privacy: "Política de privacidad" },
} as const;

export function CookieBanner() {
  const { locale } = useI18n();
  const [config, setConfig] = useState<CookieConfig>(defaultCookieConfig);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState(false);
  const [choices, setChoices] = useState<CookieChoices>(defaultCookieChoices);

  useEffect(() => {
    let active = true;
    fetch("/api/cookie-banner", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : defaultCookieConfig)
      .catch(() => defaultCookieConfig)
      .then((value: CookieConfig) => {
        if (!active) return;
        setConfig(value);
        setChoices(readCookieChoices());
        setOpen(value.enabled && readConsentRevision() !== value.revision);
        setReady(true);
        window.dispatchEvent(new CustomEvent(cookieConfigReadyEvent, { detail: { revision: value.revision, enabled: value.enabled } }));
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const openSettings = () => {
      setChoices(readCookieChoices());
      setPreferences(true);
      setOpen(true);
    };
    window.addEventListener(openCookiePreferencesEvent, openSettings);
    return () => window.removeEventListener(openCookiePreferencesEvent, openSettings);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  if (!ready || (!config.enabled && !open)) return null;

  const copy = locale === "en" ? config.copy : config.translations?.[locale] ?? defaultCookieConfig.translations![locale];
  const style = {
    "--cookie-panel": config.panelColor, "--cookie-text": config.textColor,
    "--cookie-muted": config.mutedColor, "--cookie-border": config.borderColor,
    "--cookie-primary": config.primaryColor, "--cookie-primary-text": config.primaryTextColor,
    "--cookie-secondary": config.secondaryColor, "--cookie-secondary-text": config.secondaryTextColor,
    "--cookie-accent": config.accentColor, "--cookie-radius": `${config.cornerRadius}px`,
    "--cookie-overlay": config.backdrop ? "rgba(7, 24, 57, .43)" : "rgba(7, 24, 57, .12)",
  } as React.CSSProperties;

  function save(next: CookieChoices, decision: CookieDecision) {
    saveCookieChoices(next, config.revision, decision);
    fetch("/api/analytics/aggregate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: decision, pageGroup: "all" }), keepalive: true,
    }).catch(() => {});
    setChoices(next);
    setOpen(false);
    setPreferences(false);
  }

  return (
    <div className={`cookie-ui cookie-ui--position-${config.position} cookie-ui--align-${config.alignment} ${config.compact ? "cookie-ui--compact" : ""}`} style={style}>
      {open && <div aria-hidden="true" className="cookie-ui__backdrop" />}
      {open ? (
        <section aria-label={preferences ? copy.preferencesTitle : copy.title} aria-modal="true" className={`cookie-ui__panel ${preferences ? "cookie-ui__panel--preferences" : ""}`} role="dialog">
          <header className="cookie-ui__heading">
            <h2>{preferences ? copy.preferencesTitle : copy.title}</h2>
            {(preferences || config.showClose) && <button aria-label={copy.close} className="cookie-ui__close" onClick={() => {
              if (!preferences) { save(defaultCookieChoices, "close"); return; }
              setPreferences(false);
              if (readConsentRevision() === config.revision) setOpen(false);
            }} type="button"><X size={19} /></button>}
          </header>
          <div className="cookie-ui__body">
            <p className="cookie-ui__description">{preferences ? copy.preferencesDescription : copy.description}</p>
            {preferences ? (
              <div className="cookie-ui__categories">
                {cookieCategories.map((category) => (
                  <label className="cookie-ui__category" key={category}>
                    <span className="cookie-ui__category-copy"><strong>{copy[category].name}</strong><small>{copy[category].description}</small></span>
                    <input aria-label={copy[category].name} checked={choices[category]} disabled={category === "necessary"} onChange={(event) => setChoices((current) => ({ ...current, [category]: event.target.checked }))} type="checkbox" />
                  </label>
                ))}
              </div>
            ) : (
              <>
                {config.showCategorySummary && <p className="cookie-ui__summary">{cookieCategories.map((category) => copy[category].name).join(" · ")}</p>}
                {config.showPolicyLink && <p className="cookie-ui__links"><Link href={getLocalizedLegalPath(locale, "cookies")}>{policyLabels[locale].cookies}</Link><span aria-hidden="true">·</span><Link href={getLocalizedLegalPath(locale, "privacy")}>{policyLabels[locale].privacy}</Link></p>}
              </>
            )}
          </div>
          {preferences ? (
            <footer className="cookie-ui__footer">
              <button className="cookie-ui__button cookie-ui__button--primary" onClick={() => save(choices, "selected")} type="button">{copy.savePreferences}</button>
              <div className="cookie-ui__footer-links">
                <button onClick={() => save(defaultCookieChoices, "reject")} type="button">{copy.rejectAll}</button>
                <button onClick={() => save({ necessary: true, functional: true, analytics: true, marketing: true }, "all")} type="button">{copy.acceptAll}</button>
              </div>
            </footer>
          ) : (
            <div className="cookie-ui__actions">
              <button className="cookie-ui__button cookie-ui__button--secondary" onClick={() => save(defaultCookieChoices, "reject")} type="button">{copy.rejectAll}</button>
              <button className="cookie-ui__button cookie-ui__button--secondary" onClick={() => setPreferences(true)} type="button">{copy.preferences}</button>
              <button className="cookie-ui__button cookie-ui__button--primary" onClick={() => save({ necessary: true, functional: true, analytics: true, marketing: true }, "all")} type="button">{copy.acceptAll}</button>
            </div>
          )}
        </section>
      ) : config.showReopen ? (
        <button className="cookie-ui__reopen" onClick={() => { setChoices(readCookieChoices()); setPreferences(true); setOpen(true); }} type="button">{copy.reopen}</button>
      ) : null}
    </div>
  );
}
