"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { consentEventName, cookieConfigReadyEvent, hasCookieConsent, readConsentRevision, readCookieDecision } from "@/lib/cookie-consent";

const measurementId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID ?? "";
const validMeasurementId = /^G-[A-Z0-9]+$/.test(measurementId) ? measurementId : null;

declare global {
  interface Window {
    dataLayer?: IArguments[];
    gtag?: (...args: unknown[]) => void;
  }
}

function publicPage(pathname: string) {
  return !/^\/(ops|api|preferences|confirm|unsubscribe)(\/|$)/.test(pathname);
}

function groupPage(pathname: string): "home" | "deals" | "legal" | "other" {
  const segments = pathname.split("/").filter(Boolean);
  if (["en", "fr", "de", "pt", "it", "es"].includes(segments[0])) segments.shift();
  if (segments.length === 0) return "home";
  if (["deals", "offres", "fluege", "voos", "voli", "vuelos"].includes(segments[0])) return "deals";
  if (["cookies", "cookie", "privacy", "privacidad", "privacidade", "confidentialite", "datenschutz", "terms", "terminos", "conditions", "nutzungsbedingungen", "contact", "contacto"].includes(segments[0])) return "legal";
  return "other";
}

function removeGoogleCookies() {
  const host = location.hostname;
  const domains = ["", host, ...host.split(".").map((_, index, parts) => parts.slice(index).join(".")).filter((part) => part.includes("."))];
  for (const entry of document.cookie.split("; ")) {
    const name = entry.split("=")[0];
    if (!/^_ga(?:_|$)|^_gid$|^_gat(?:_|$)/.test(name)) continue;
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ""}`;
    }
  }
}

function setupGoogleTag(id: string) {
  if (window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function (...args: unknown[]) { window.dataLayer!.push(arguments); };
  window.gtag("consent", "default", {
    analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
  });
  window.gtag("consent", "update", {
    analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
  });
  window.gtag("js", new Date());
  window.gtag("set", { allow_google_signals: false, allow_ad_personalization_signals: false });
  window.gtag("config", id, { send_page_view: false });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  script.id = "ga4-consented-script";
  document.head.appendChild(script);
}

export function AnalyticsTracker() {
  const pathname = usePathname();
  const lastGooglePage = useRef<string | null>(null);
  const lastAnonymousPage = useRef<string | null>(null);
  const activeConfig = useRef<{ revision: string; enabled: boolean } | null>(null);

  useEffect(() => {
    function update() {
      if (!activeConfig.current || !activeConfig.current.enabled || readConsentRevision() !== activeConfig.current.revision) {
        if (validMeasurementId) {
          (window as unknown as Record<string, boolean>)[`ga-disable-${validMeasurementId}`] = true;
          window.gtag?.("consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
          removeGoogleCookies();
        }
        lastGooglePage.current = null;
        return;
      }
      if (!publicPage(pathname)) {
        if (validMeasurementId) (window as unknown as Record<string, boolean>)[`ga-disable-${validMeasurementId}`] = true;
        return;
      }

      const decision = readCookieDecision();
      if ((decision === "reject" || decision === "close") && !hasCookieConsent("analytics")) {
        if (lastAnonymousPage.current !== pathname) {
          lastAnonymousPage.current = pathname;
          fetch("/api/analytics/aggregate", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "declined_view", pageGroup: groupPage(pathname) }), keepalive: true,
          }).catch(() => {});
        }
      } else lastAnonymousPage.current = null;

      if (!validMeasurementId) return;
      const allowed = hasCookieConsent("analytics");
      (window as unknown as Record<string, boolean>)[`ga-disable-${validMeasurementId}`] = !allowed;
      if (!allowed) {
        window.gtag?.("consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
        removeGoogleCookies();
        lastGooglePage.current = null;
        return;
      }

      setupGoogleTag(validMeasurementId);
      window.gtag?.("consent", "update", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
      if (lastGooglePage.current !== pathname) {
        lastGooglePage.current = pathname;
        window.gtag?.("event", "page_view", {
          page_location: `${location.origin}${pathname}`, page_path: pathname, page_title: document.title,
          send_to: validMeasurementId,
        });
      }
    }

    update();
    const onConfigReady = (event: Event) => {
      const detail = (event as CustomEvent<{ revision: string; enabled: boolean }>).detail;
      activeConfig.current = detail;
      update();
    };
    window.addEventListener(consentEventName, update);
    window.addEventListener(cookieConfigReadyEvent, onConfigReady);
    return () => {
      window.removeEventListener(consentEventName, update);
      window.removeEventListener(cookieConfigReadyEvent, onConfigReady);
    };
  }, [pathname]);

  return null;
}
