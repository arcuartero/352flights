"use client";

import { useEffect, useId, useRef, useState } from "react";

import { localeOptions, useI18n, type Locale } from "@/lib/i18n";

export function LanguageSelector() {
  const { locale, setLocale, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const current = localeOptions.find((option) => option.code === locale) ?? localeOptions[0];

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="language-selector" ref={rootRef}>
      <button
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={t("language.label")}
        className="language-selector__trigger"
        onClick={() => setIsOpen((value) => !value)}
        title={current.label}
        type="button"
      >
        {current.flag}
      </button>

      {isOpen ? (
        <div className="language-selector__menu" id={listboxId} role="listbox">
          {localeOptions.map((option) => {
            const isSelected = option.code === locale;
            return (
              <button
                aria-selected={isSelected}
                className={`language-selector__option${isSelected ? " is-selected" : ""}`}
                key={option.code}
                onClick={() => {
                  setLocale(option.code as Locale);
                  setIsOpen(false);
                }}
                role="option"
                type="button"
              >
                <span aria-hidden="true">{option.flag}</span>
                <strong>{option.label}</strong>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
