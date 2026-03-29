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
        const nextTheme = theme === "dark" ? "light" : "dark";
        setTheme(nextTheme);
        applyTheme(nextTheme);
      }}
      type="button"
    >
      <span className="theme-toggle__track" aria-hidden="true">
        <span className={`theme-toggle__thumb theme-toggle__thumb--${theme}`} />
      </span>
      <span className="theme-toggle__label">
        {mounted ? (theme === "dark" ? "Dark mode" : "Light mode") : "Theme"}
      </span>
    </button>
  );
}
