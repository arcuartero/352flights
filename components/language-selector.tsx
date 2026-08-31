"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { localeOptions, useI18n, type Locale } from "@/lib/i18n";
import { getLocalizedPublicPath } from "@/lib/locales";

export function LanguageSelector() {
  const { locale, setLocale, t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
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
        aria-label={`${t("language.label")}: ${current.label}`}
        className="language-selector__trigger"
        onClick={() => setIsOpen((value) => !value)}
        title={current.label}
        type="button"
      >
        <Image
          alt=""
          aria-hidden="true"
          className="language-selector__flag-image"
          height={21}
          src={current.flagSrc}
          unoptimized
          width={28}
        />
        <span className="language-selector__trigger-code">{current.shortLabel}</span>
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
                  const nextLocale = option.code as Locale;
                  setLocale(nextLocale);
                  setIsOpen(false);

                  const localizedPath = getLocalizedPublicPath(pathname, nextLocale);
                  if (localizedPath) {
                    const suffix = `${window.location.search}${window.location.hash}`;
                    router.push(`${localizedPath}${suffix}`);
                  }
                }}
                role="option"
                type="button"
              >
                <Image
                  alt=""
                  aria-hidden="true"
                  className="language-selector__flag-image"
                  height={18}
                  src={option.flagSrc}
                  unoptimized
                  width={24}
                />
                <strong>{option.label}</strong>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
