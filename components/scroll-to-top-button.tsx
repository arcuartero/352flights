"use client";

import { ArrowUp } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useI18n } from "@/lib/i18n";

const SHOW_THRESHOLD = 280;

export function ScrollToTopButton() {
  const pathname = usePathname();
  const { t } = useI18n();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    function updateVisibility() {
      setIsVisible(window.scrollY > SHOW_THRESHOLD);
    }

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });

    return () => {
      window.removeEventListener("scroll", updateVisibility);
    };
  }, []);

  function handleClick() {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
      className={`scroll-top-button ${isVisible ? "is-visible" : ""}`}
      onClick={handleClick}
      tabIndex={isVisible ? 0 : -1}
      title={label}
      type="button"
    >
      <span className="scroll-top-button__arrow" aria-hidden="true">
        <ArrowUp size={16} strokeWidth={2.5} />
      </span>
      <span>{label}</span>
    </button>
  );
}
