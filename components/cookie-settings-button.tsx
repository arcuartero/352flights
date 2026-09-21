"use client";

import { openCookiePreferencesEvent } from "@/lib/cookie-consent";

export function CookieSettingsButton({ label }: { label: string }) {
  return <button className="cookie-policy-settings" onClick={() => window.dispatchEvent(new Event(openCookiePreferencesEvent))} type="button">{label}</button>;
}
