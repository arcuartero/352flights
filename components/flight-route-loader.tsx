"use client";

import { Plane } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type FlightRouteLoaderVisualProps = {
  exiting?: boolean;
  label?: string;
};

type OrbitStyle = CSSProperties & {
  "--flight-orbit-duration": string;
  "--flight-orbit-height": string;
  "--flight-orbit-start": string;
  "--flight-orbit-width": string;
};

const defaultOrbit: OrbitStyle = {
  "--flight-orbit-duration": "2.2s",
  "--flight-orbit-height": "5.5rem",
  "--flight-orbit-start": "0deg",
  "--flight-orbit-width": "8rem",
};

export function FlightRouteLoaderVisual({
  exiting = false,
  label = "Cargando la siguiente pagina",
}: FlightRouteLoaderVisualProps) {
  const [orbitStyle, setOrbitStyle] = useState<OrbitStyle>(defaultOrbit);

  useEffect(() => {
    const circular = Math.random() < 0.38;
    const width = 7.2 + Math.random() * 3.8;
    const height = circular ? width : 4.2 + Math.random() * 3.4;

    setOrbitStyle({
      "--flight-orbit-duration": `${(1.7 + Math.random() * 1.35).toFixed(2)}s`,
      "--flight-orbit-height": `${height.toFixed(2)}rem`,
      "--flight-orbit-start": `${Math.round(Math.random() * 359)}deg`,
      "--flight-orbit-width": `${width.toFixed(2)}rem`,
    });
  }, []);

  return (
    <div
      className={`flight-route-loader${exiting ? " flight-route-loader--exiting" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="flight-route-loader__stage" aria-hidden="true">
        <div
          className="flight-route-loader__orbit"
          style={orbitStyle}
        >
          <div className="flight-route-loader__flight">
            <span className="flight-route-loader__trail flight-route-loader__trail--1" />
            <span className="flight-route-loader__trail flight-route-loader__trail--2" />
            <span className="flight-route-loader__trail flight-route-loader__trail--3" />
            <Plane className="flight-route-loader__plane" fill="currentColor" strokeWidth={1.8} />
          </div>
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
  const [phase, setPhase] = useState<"hidden" | "visible" | "exiting">("hidden");
  const previousRouteKey = useRef(routeKey);
  const hideTimer = useRef<number | null>(null);

  const show = useCallback(() => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setPhase("visible");
  }, []);

  const hideWithFade = useCallback(() => {
    setPhase((current) => (current === "hidden" ? current : "exiting"));
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
    }
    hideTimer.current = window.setTimeout(() => {
      setPhase("hidden");
      hideTimer.current = null;
    }, 180);
  }, []);

  useEffect(() => {
    if (previousRouteKey.current !== routeKey) {
      previousRouteKey.current = routeKey;
      hideWithFade();
    }
  }, [hideWithFade, routeKey]);

  useEffect(() => {
    const showForLink = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (anchor && isInternalPageLink(event, anchor)) {
        show();
      }
    };

    const showForForm = (event: SubmitEvent) => {
      const form = event.target;
      if (
        !(form instanceof HTMLFormElement) ||
        event.defaultPrevented ||
        form.dataset.routeLoader === "off"
      ) {
        return;
      }

      const method = (form.method || "get").toLowerCase();
      const target = form.target;
      const action = new URL(form.action || window.location.href, window.location.href);
      if (method === "get" && target !== "_blank" && action.origin === window.location.origin) {
        show();
      }
    };

    document.addEventListener("click", showForLink, true);
    // Let client-side submit handlers call preventDefault() before deciding
    // whether this submission will actually navigate to another route.
    document.addEventListener("submit", showForForm);

    return () => {
      document.removeEventListener("click", showForLink, true);
      document.removeEventListener("submit", showForForm);
    };
  }, [show]);

  useEffect(() => {
    if (phase !== "visible") {
      return;
    }

    const safetyTimer = window.setTimeout(hideWithFade, 15000);
    return () => window.clearTimeout(safetyTimer);
  }, [hideWithFade, phase]);

  useEffect(
    () => () => {
      if (hideTimer.current !== null) {
        window.clearTimeout(hideTimer.current);
      }
    },
    [],
  );

  return phase === "hidden" ? null : <FlightRouteLoaderVisual exiting={phase === "exiting"} />;
}
