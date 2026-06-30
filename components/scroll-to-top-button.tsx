"use client";

import { useEffect, useRef, useState } from "react";

const SHOW_THRESHOLD = 320;

export function ScrollToTopButton() {
  const [isVisible, setIsVisible] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    function updateVisibility() {
      const currentScrollY = window.scrollY;
      const scrollingDown = currentScrollY > lastScrollY.current;
      lastScrollY.current = currentScrollY;

      setIsVisible(currentScrollY > SHOW_THRESHOLD && (scrollingDown || currentScrollY > 720));
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

  return (
    <button
      aria-hidden={!isVisible}
      aria-label="Scroll to top"
      className={`scroll-top-button ${isVisible ? "is-visible" : ""}`}
      onClick={handleClick}
      tabIndex={isVisible ? 0 : -1}
      type="button"
    >
      <span className="scroll-top-button__arrow" aria-hidden="true">
        ↑
      </span>
      <span>Scroll to top</span>
    </button>
  );
}
