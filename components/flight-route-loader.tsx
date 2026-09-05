"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";

type FlightRouteLoaderVisualProps = {
  exiting?: boolean;
  label?: string;
};

const loadingLabels = {
  en: "Loading the next page",
  es: "Cargando la siguiente página",
  fr: "Chargement de la page suivante",
  de: "Die nächste Seite wird geladen",
  it: "Caricamento della pagina successiva",
  pt: "A carregar a próxima página",
};

const ARRIVAL_DURATION = 480;

export function FlightRouteLoaderVisual({
  exiting = false,
  label,
}: FlightRouteLoaderVisualProps) {
  const { locale } = useI18n();
  const flightRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const accessibleLabel = label ?? loadingLabels[locale];

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const startedAt = performance.now();
    const animate = (now: number) => {
      const seconds = (now - startedAt) / 1000;
      // The camera follows the plane: it keeps climbing, but never exits the
      // stage on a timer. Only a committed route triggers the final departure.
      const climb = 48 * (2 / Math.PI) * Math.atan(seconds * seconds / 20);
      flightRef.current?.style.setProperty("--flight-climb", `${28 - climb}px`);
      const speed = 0.45 + 1.35 * (1 - Math.exp(-seconds / 2.5));
      stageRef.current?.getAnimations({ subtree: true }).forEach((animation) => {
        if ((animation as CSSAnimation).animationName === "flight-route-speed") {
          animation.updatePlaybackRate(speed);
        }
      });
      frame = window.requestAnimationFrame(animate);
    };
    const syncMotion = () => {
      window.cancelAnimationFrame(frame);
      if (!motion.matches) frame = window.requestAnimationFrame(animate);
    };
    syncMotion();
    motion.addEventListener("change", syncMotion);
    return () => {
      window.cancelAnimationFrame(frame);
      motion.removeEventListener("change", syncMotion);
    };
  }, []);

  return (
    <div
      className={`flight-route-loader${exiting ? " flight-route-loader--exiting" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={accessibleLabel}
    >
      <div className="flight-route-loader__stage" ref={stageRef} aria-hidden="true">
        <span className="flight-route-loader__halo" />
        <div className="flight-route-loader__ascent" ref={flightRef}>
          <div className="flight-route-loader__flight">
            <span className="flight-route-loader__trail flight-route-loader__trail--1" />
            <span className="flight-route-loader__trail flight-route-loader__trail--2" />
            <span className="flight-route-loader__trail flight-route-loader__trail--3" />
            <svg className="flight-route-loader__plane" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 1.4c-.78 0-1.34.76-1.54 1.67L9.25 8.5l-6.1 3.72c-.47.28-.72.8-.66 1.34l.1.82 6.08-1.66-.62 4.6-2.07 1.34c-.38.24-.58.68-.51 1.12l.12.72L12 18.92l6.41 1.58.12-.72c.07-.44-.13-.88-.51-1.12l-2.07-1.34-.62-4.6 6.08 1.66.1-.82c.06-.54-.19-1.06-.66-1.34l-6.1-3.72-1.21-5.43C13.34 2.16 12.78 1.4 12 1.4Z" />
            </svg>
          </div>
        </div>
      </div>
      <span className="sr-only">{accessibleLabel}</span>
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
    }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ARRIVAL_DURATION);
  }, []);

  useEffect(() => {
    if (previousRouteKey.current !== routeKey) {
      previousRouteKey.current = routeKey;
      // Give the newly committed page a paint before completing the flight.
      let secondFrame = 0;
      const firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(hideWithFade);
      });
      return () => {
        window.cancelAnimationFrame(firstFrame);
        window.cancelAnimationFrame(secondFrame);
      };
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

    // Cancellation dismisses the overlay without pretending the page arrived.
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPhase("hidden");
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [phase]);

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
