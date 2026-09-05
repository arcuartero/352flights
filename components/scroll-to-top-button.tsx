"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/lib/i18n";

const SHOW_THRESHOLD = 280;

export function ScrollToTopButton() {
  const pathname = usePathname();
  const { t } = useI18n();
  const [isVisible, setIsVisible] = useState(false);
  const [isFlying, setIsFlying] = useState(false);
  const flightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function updateVisibility() {
      const isAtTop = window.scrollY <= 2;
      setIsVisible(window.scrollY > SHOW_THRESHOLD || (isFlying && !isAtTop));
      if (isFlying && isAtTop) {
        setIsFlying(false);
      }
    }

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });

    return () => {
      window.removeEventListener("scroll", updateVisibility);
    };
  }, [isFlying]);

  useEffect(() => () => {
    if (flightTimerRef.current) {
      clearTimeout(flightTimerRef.current);
    }
  }, []);

  function handleClick() {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (flightTimerRef.current) {
      clearTimeout(flightTimerRef.current);
    }
    if (!prefersReducedMotion) {
      setIsFlying(true);
      flightTimerRef.current = setTimeout(() => {
        flightTimerRef.current = null;
        setIsFlying(false);
      }, 1800);
    }
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }

  if (pathname.startsWith("/ops")) {
    return null;
  }

  const label = t("common.backToTop");

  return (
    <button
      aria-hidden={!isVisible}
      aria-label={label}
      className={`scroll-top-button ${isVisible ? "is-visible" : ""}${isFlying ? " is-flying" : ""}`}
      onClick={handleClick}
      tabIndex={isVisible ? 0 : -1}
      title={label}
      type="button"
    >
      <span className="scroll-top-button__arrow" aria-hidden="true">
        <svg className="scroll-top-button__plane" viewBox="0 0 24 24">
          <path d="M12 1.4c-.78 0-1.34.76-1.54 1.67L9.25 8.5l-6.1 3.72c-.47.28-.72.8-.66 1.34l.1.82 6.08-1.66-.62 4.6-2.07 1.34c-.38.24-.58.68-.51 1.12l.12.72L12 18.92l6.41 1.58.12-.72c.07-.44-.13-.88-.51-1.12l-2.07-1.34-.62-4.6 6.08 1.66.1-.82c.06-.54-.19-1.06-.66-1.34l-6.1-3.72-1.21-5.43C13.34 2.16 12.78 1.4 12 1.4Z" />
        </svg>
        <span className="scroll-top-button__speed-lines">
          <i />
          <i />
          <i />
        </span>
      </span>
      <span>{label}</span>
    </button>
  );
}
