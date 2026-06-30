"use client";

import { useEffect, useState } from "react";

const storageKey = "luxflightdeals-theme";

type ThemeMode = "light" | "dark";

function resolveInitialTheme(): ThemeMode {
  if (typeof document === "undefined") {
    return "dark";
  }

  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.localStorage.setItem(storageKey, theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const nextTheme = resolveInitialTheme();
    setTheme(nextTheme);
    setMounted(true);
  }, []);

  return (
    <button
      aria-label={mounted ? `Switch to ${theme === "dark" ? "light" : "dark"} mode` : "Toggle theme"}
      className="theme-toggle"
      onClick={() => {
        const currentTheme = resolveInitialTheme();
        const nextTheme = currentTheme === "dark" ? "light" : "dark";
        setTheme(nextTheme);
        setMounted(true);
        applyTheme(nextTheme);
      }}
      type="button"
    >
      <span className="theme-toggle__track" aria-hidden="true">
        <span className="theme-toggle__icon theme-toggle__icon--moon">
          <svg viewBox="0 0 24 24">
            <path
              d="M15.5 3.8a7.8 7.8 0 1 0 4.7 14 8.5 8.5 0 0 1-4.7-14Z"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        </span>
        <span className="theme-toggle__icon theme-toggle__icon--sun">
          <svg viewBox="0 0 24 24">
            <circle
              cx="12"
              cy="12"
              fill="none"
              r="3.8"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="M12 2.5v2.4M12 19.1v2.4M21.5 12h-2.4M4.9 12H2.5M18.7 5.3l-1.7 1.7M7 17l-1.7 1.7M18.7 18.7 17 17M7 7 5.3 5.3"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        </span>
        <span className={`theme-toggle__thumb theme-toggle__thumb--${theme}`} />
      </span>
    </button>
  );
}
