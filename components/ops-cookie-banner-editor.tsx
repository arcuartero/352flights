"use client";

import { useEffect, useState } from "react";
import { cookieCategories, defaultCookieConfig, type CookieConfig, type CookieCopy } from "@/lib/cookie-consent";

type TextKey = Exclude<keyof CookieConfig["copy"], (typeof cookieCategories)[number]>;
const textFields: { key: TextKey; label: string }[] = [
  { key: "title", label: "Banner title" }, { key: "description", label: "Banner description" },
  { key: "preferencesTitle", label: "Preferences title" }, { key: "preferencesDescription", label: "Preferences description" },
  { key: "acceptAll", label: "Accept all button" },
  { key: "rejectAll", label: "Reject all button" }, { key: "preferences", label: "View preferences button" },
  { key: "savePreferences", label: "Save preferences button" }, { key: "reopen", label: "Reopen button" },
  { key: "close", label: "Close button label" }, { key: "alwaysActive", label: "Necessary status label" },
];
const colorFields: { key: keyof CookieConfig; label: string }[] = [
  { key: "panelColor", label: "Panel" }, { key: "textColor", label: "Text" },
  { key: "mutedColor", label: "Muted text" }, { key: "borderColor", label: "Border" },
  { key: "primaryColor", label: "Primary button" }, { key: "primaryTextColor", label: "Primary button text" },
  { key: "secondaryColor", label: "Secondary button" }, { key: "secondaryTextColor", label: "Secondary button text" },
  { key: "accentColor", label: "Accent" },
];
const toggles: { key: keyof CookieConfig; label: string; help: string }[] = [
  { key: "enabled", label: "Show banner", help: "When off, new visitors cannot grant optional consent; previous choices remain saved." },
  { key: "showClose", label: "Show close button", help: "Closing the banner saves necessary only." },
  { key: "showReopen", label: "Show floating settings button", help: "Lets visitors change consent later." },
  { key: "showPolicyLink", label: "Show cookie policy link", help: "Links to the matching language policy page." },
  { key: "showCategorySummary", label: "Show category names", help: "Lists all categories on the first view." },
  { key: "backdrop", label: "Darken the blurred page", help: "The background is always blurred while the banner is open; this adds a darker tint." },
  { key: "compact", label: "Compact layout", help: "Reduces panel width and padding." },
];

export function OpsCookieBannerEditor() {
  const [config, setConfig] = useState<CookieConfig>(defaultCookieConfig);
  const [status, setStatus] = useState("Loading settings…");
  const [saving, setSaving] = useState(false);
  const [editingLocale, setEditingLocale] = useState<"en" | "fr" | "de" | "pt" | "it" | "es">("en");

  useEffect(() => {
    fetch("/api/ops/cookie-banner", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load settings");
        setConfig(data);
        setStatus("");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Could not load settings"));
  }, []);

  function setField<K extends keyof CookieConfig>(key: K, value: CookieConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  const currentCopy: CookieCopy = editingLocale === "en" ? config.copy : config.translations?.[editingLocale] ?? defaultCookieConfig.translations![editingLocale];
  function setCopy(next: CookieCopy) {
    setConfig((current) => editingLocale === "en"
      ? { ...current, copy: next }
      : { ...current, translations: { ...(current.translations ?? defaultCookieConfig.translations!), [editingLocale]: next } });
  }

  async function save() {
    setSaving(true);
    setStatus("Saving…");
    try {
      const response = await fetch("/api/ops/cookie-banner", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save settings");
      setConfig(data);
      setStatus("Saved. Visitors will see the new banner on their next page load.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save settings");
    } finally { setSaving(false); }
  }

  return (
    <div className="ops-cookie-editor">
      <div className="ops-cookie-editor__toolbar"><p role="status">{status}</p><button disabled={saving} onClick={save} type="button">Save cookie banner</button></div>
      <section><h3>Display and behaviour</h3><div className="ops-cookie-editor__grid">
        <label>Position<select value={config.position} onChange={(event) => setField("position", event.target.value as CookieConfig["position"])}><option value="bottom">Bottom</option><option value="center">Center</option></select></label>
        <label>Horizontal alignment<select value={config.alignment} onChange={(event) => setField("alignment", event.target.value as CookieConfig["alignment"])}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
        <label>Corner radius: {config.cornerRadius}px<input max="40" min="0" onChange={(event) => setField("cornerRadius", Number(event.target.value))} type="range" value={config.cornerRadius} /></label>
      </div><div className="ops-cookie-editor__toggle-list">{toggles.map(({ key, label, help }) => <label key={key}><input checked={Boolean(config[key])} onChange={(event) => setField(key, event.target.checked as never)} type="checkbox" /><span><strong>{label}</strong><small>{help}</small></span></label>)}</div></section>
      <section><h3>Words and buttons</h3><label className="ops-cookie-editor__locale">Editing language<select onChange={(event) => setEditingLocale(event.target.value as typeof editingLocale)} value={editingLocale}><option value="en">English</option><option value="fr">Français</option><option value="de">Deutsch</option><option value="pt">Português</option><option value="it">Italiano</option><option value="es">Español</option></select></label><div className="ops-cookie-editor__grid">{textFields.map(({ key, label }) => <label key={key}>{label}{key.toLowerCase().includes("description") ? <textarea maxLength={500} onChange={(event) => setCopy({ ...currentCopy, [key]: event.target.value })} rows={3} value={currentCopy[key]} /> : <input maxLength={500} onChange={(event) => setCopy({ ...currentCopy, [key]: event.target.value })} value={currentCopy[key]} />}</label>)}</div></section>
      <section><h3>Four cookie categories</h3><p>Necessary is always active. Other categories start switched off for every new visitor.</p><div className="ops-cookie-editor__grid">{cookieCategories.map((category) => <div className="ops-cookie-editor__category" key={category}><h4>{category}</h4><label>Name<input maxLength={500} onChange={(event) => setCopy({ ...currentCopy, [category]: { ...currentCopy[category], name: event.target.value } })} value={currentCopy[category].name} /></label><label>Description<textarea maxLength={500} onChange={(event) => setCopy({ ...currentCopy, [category]: { ...currentCopy[category], description: event.target.value } })} rows={3} value={currentCopy[category].description} /></label></div>)}</div></section>
      <section><h3>Colours</h3><div className="ops-cookie-editor__grid ops-cookie-editor__colors">{colorFields.map(({ key, label }) => <label key={key}>{label}<span><input aria-label={`${label} colour`} onChange={(event) => setField(key, event.target.value as never)} type="color" value={String(config[key])} /><input aria-label={`${label} hex value`} maxLength={7} onChange={(event) => setField(key, event.target.value as never)} value={String(config[key])} /></span></label>)}</div></section>
      <div className="ops-cookie-editor__toolbar"><p role="status">{status}</p><button disabled={saving} onClick={save} type="button">Save cookie banner</button></div>
    </div>
  );
}
