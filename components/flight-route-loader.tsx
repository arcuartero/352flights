"use client";

import { Plane } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type FlightRouteLoaderVisualProps = {
  label?: string;
};

export function FlightRouteLoaderVisual({
  label = "Cargando la siguiente pagina",
}: FlightRouteLoaderVisualProps) {
  return (
    <div className="flight-route-loader" role="status" aria-live="polite" aria-label={label}>
      <div className="flight-route-loader__stage" aria-hidden="true">
        <div className="flight-route-loader__flight">
          <span className="flight-route-loader__trail flight-route-loader__trail--1" />
          <span className="flight-route-loader__trail flight-route-loader__trail--2" />
          <span className="flight-route-loader__trail flight-route-loader__trail--3" />
          <Plane className="flight-route-loader__plane" fill="currentColor" strokeWidth={1.8} />
        </div>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

function isInternalPageLink(event: MouseEvent, anchor: HTMLAnchorElement) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    anchor.target === "_blank" ||
    anchor.hasAttribute("download") ||
    anchor.dataset.routeLoader === "off"
  ) {
    return false;
  }

  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }

  const target = new URL(anchor.href, window.location.href);
  const current = new URL(window.location.href);

  return (
    target.origin === current.origin &&
    (target.pathname !== current.pathname || target.search !== current.search)
  );
}

export function GlobalFlightRouteLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = useMemo(
    () => `${pathname}?${searchParams.toString()}`,
    [pathname, searchParams],
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
  }, [routeKey]);

  useEffect(() => {
    const showForLink = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (anchor && isInternalPageLink(event, anchor)) {
        setVisible(true);
      }
    };

    const showForForm = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || event.defaultPrevented) {
        return;
      }

      const method = (form.method || "get").toLowerCase();
      const target = form.target;
      const action = new URL(form.action || window.location.href, window.location.href);
      if (method === "get" && target !== "_blank" && action.origin === window.location.origin) {
        setVisible(true);
      }
    };

    document.addEventListener("click", showForLink, true);
    document.addEventListener("submit", showForForm, true);

    return () => {
      document.removeEventListener("click", showForLink, true);
      document.removeEventListener("submit", showForForm, true);
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const safetyTimer = window.setTimeout(() => setVisible(false), 15000);
    return () => window.clearTimeout(safetyTimer);
  }, [visible]);

  return visible ? <FlightRouteLoaderVisual /> : null;
}
