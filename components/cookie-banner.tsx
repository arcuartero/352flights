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

  if (!ready || (!config.enabled && !open)) return null;

  const copy = locale === "en" ? config.copy : config.translations?.[locale] ?? defaultCookieConfig.translations![locale];
  const style = {
    "--cookie-panel": config.panelColor, "--cookie-text": config.textColor,
    "--cookie-muted": config.mutedColor, "--cookie-border": config.borderColor,
    "--cookie-primary": config.primaryColor, "--cookie-primary-text": config.primaryTextColor,
    "--cookie-secondary": config.secondaryColor, "--cookie-secondary-text": config.secondaryTextColor,
    "--cookie-accent": config.accentColor, "--cookie-radius": `${config.cornerRadius}px`,
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
      {open && config.backdrop && <div className="cookie-ui__backdrop" />}
      {open ? (
        <section aria-label={preferences ? copy.preferencesTitle : copy.title} aria-modal={config.position === "center" && config.backdrop ? true : undefined} className="cookie-ui__panel" role="dialog">
          <div className="cookie-ui__heading">
            <div><span className="cookie-ui__eyebrow">+352 FLIGHTS · PRIVACY</span><h2>{preferences ? copy.preferencesTitle : copy.title}</h2></div>
            {config.showClose && <button aria-label={copy.close} className="cookie-ui__close" onClick={() => save(defaultCookieChoices, "close")} type="button"><X size={19} /></button>}
          </div>
          <p className="cookie-ui__description">{preferences ? copy.preferencesDescription : copy.description}</p>
          {preferences ? (
            <div className="cookie-ui__categories">
              {cookieCategories.map((category) => (
                <label className="cookie-ui__category" key={category}>
                  <span><strong>{copy[category].name}</strong><small>{copy[category].description}</small></span>
                  {category === "necessary" ? <span className="cookie-ui__always">{copy.alwaysActive}</span> :
                    <input aria-label={copy[category].name} checked={choices[category]} onChange={(event) => setChoices((current) => ({ ...current, [category]: event.target.checked }))} type="checkbox" />}
                </label>
              ))}
            </div>
          ) : config.showCategorySummary ? (
            <p className="cookie-ui__summary">{cookieCategories.map((category) => copy[category].name).join(" · ")}</p>
          ) : null}
          <div className="cookie-ui__actions">
            <button className="cookie-ui__button cookie-ui__button--primary" onClick={() => save(preferences ? choices : readCookieChoices(), "selected")} type="button">{preferences ? copy.savePreferences : copy.acceptSelected}</button>
            <button className="cookie-ui__button cookie-ui__button--secondary" onClick={() => save({ necessary: true, functional: true, analytics: true, marketing: true }, "all")} type="button">{copy.acceptAll}</button>
            <button className="cookie-ui__button cookie-ui__button--ghost" onClick={() => save(defaultCookieChoices, "reject")} type="button">{copy.rejectAll}</button>
            {!preferences && <button className="cookie-ui__button cookie-ui__button--link" onClick={() => setPreferences(true)} type="button">{copy.preferences}</button>}
          </div>
          {config.showPolicyLink && <Link className="cookie-ui__policy" href={getLocalizedLegalPath(locale, "cookies")}>{locale === "es" ? "Política de cookies" : "Cookie policy"}</Link>}
        </section>
      ) : config.showReopen ? (
        <button className="cookie-ui__reopen" onClick={() => { setChoices(readCookieChoices()); setPreferences(true); setOpen(true); }} type="button">{copy.reopen}</button>
      ) : null}
    </div>
  );
}
