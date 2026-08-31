"use client";

import { Check, ChevronDown, Clock3, MapPin, Search, Sparkles, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { useI18n } from "@/lib/i18n";

export type PublicDealsSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

const RECENT_DESTINATIONS_KEY = "352flights-recent-destinations-v1";
const MAX_RECENT_DESTINATIONS = 4;
const MAX_POPULAR_DESTINATIONS = 6;
const EMPTY_POPULAR_OPTION_VALUES: string[] = [];

function normalizeSearchValue(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function PublicDealsSelect({
  label,
  value,
  options,
  onChange,
  className,
  leadingIcon,
  mobileDestinationSheet = false,
  popularOptionValues = EMPTY_POPULAR_OPTION_VALUES,
}: {
  label: string;
  value: string;
  options: PublicDealsSelectOption[];
  onChange: (value: string) => void;
  className?: string;
  leadingIcon?: ReactNode;
  mobileDestinationSheet?: boolean;
  popularOptionValues?: string[];
}) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMobileSheetViewport, setIsMobileSheetViewport] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [recentValues, setRecentValues] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxId = useId();
  const sheetTitleId = useId();
  const searchLabelId = useId();
  const selectedValueId = `${listboxId}-value`;
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selectedOption = options[selectedIndex] ?? options[0];

  useEffect(() => {
    if (!mobileDestinationSheet) return;

    const mediaQuery = window.matchMedia("(max-width: 820px)");
    const updateViewport = () => setIsMobileSheetViewport(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, [mobileDestinationSheet]);

  useEffect(() => {
    if (!mobileDestinationSheet) return;

    try {
      const stored = window.localStorage.getItem(RECENT_DESTINATIONS_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      if (Array.isArray(parsed)) {
        setRecentValues(parsed.filter((item): item is string => typeof item === "string"));
      }
    } catch {
      setRecentValues([]);
    }
  }, [mobileDestinationSheet]);

  const closeSelect = useCallback((restoreFocus = true) => {
    setIsOpen(false);
    setSearchQuery("");
    if (restoreFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    if (mobileDestinationSheet && isMobileSheetViewport) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => searchInputRef.current?.focus());

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeSelect();
          return;
        }

        if (event.key !== "Tab" || !sheetRef.current) return;
        const focusable = Array.from(
          sheetRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = previousOverflow;
        window.removeEventListener("keydown", handleKeyDown);
      };
    }

    setActiveIndex(selectedIndex);
    requestAnimationFrame(() => optionRefs.current[selectedIndex]?.focus());

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeSelect(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSelect();
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeSelect, isMobileSheetViewport, isOpen, mobileDestinationSheet, selectedIndex]);

  const enabledDestinationOptions = useMemo(
    () => options.filter((option) => option.value !== "any" && !option.disabled),
    [options],
  );
  const recentOptions = useMemo(
    () =>
      recentValues
        .map((recentValue) =>
          enabledDestinationOptions.find((option) => option.value === recentValue),
        )
        .filter((option): option is PublicDealsSelectOption => Boolean(option))
        .slice(0, MAX_RECENT_DESTINATIONS),
    [enabledDestinationOptions, recentValues],
  );
  const popularOptions = useMemo(() => {
    const requestedValues = new Set(popularOptionValues);
    const requestedOptions = popularOptionValues
      .map((popularValue) =>
        enabledDestinationOptions.find((option) => option.value === popularValue),
      )
      .filter((option): option is PublicDealsSelectOption => Boolean(option));
    const fallbacks = enabledDestinationOptions.filter(
      (option) => !requestedValues.has(option.value),
    );
    return [...requestedOptions, ...fallbacks].slice(0, MAX_POPULAR_DESTINATIONS);
  }, [enabledDestinationOptions, popularOptionValues]);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(searchQuery);
    if (!normalizedQuery) return enabledDestinationOptions;
    return enabledDestinationOptions.filter((option) =>
      normalizeSearchValue(option.label).includes(normalizedQuery),
    );
  }, [enabledDestinationOptions, searchQuery]);

  const selectOption = (option: PublicDealsSelectOption) => {
    if (option.disabled) return;

    if (option.value !== "any") {
      setRecentValues((current) => {
        const next = [option.value, ...current.filter((item) => item !== option.value)].slice(
          0,
          MAX_RECENT_DESTINATIONS,
        );
        try {
          window.localStorage.setItem(RECENT_DESTINATIONS_KEY, JSON.stringify(next));
        } catch {
          // The selector still works when storage is unavailable.
        }
        return next;
      });
    }

    onChange(option.value);
    closeSelect();
  };

  const moveFocus = (direction: 1 | -1) => {
    if (options.length === 0) return;
    let next = activeIndex;
    let attempts = 0;
    do {
      next = (next + direction + options.length) % options.length;
      attempts += 1;
    } while (options[next]?.disabled && attempts < options.length);
    if (options[next]?.disabled) return;
    setActiveIndex(next);
    optionRefs.current[next]?.focus();
  };

  const renderSheetOption = (
    option: PublicDealsSelectOption,
    icon?: ReactNode,
  ) => {
    const isSelected = option.value === value;
    return (
      <button
        aria-pressed={isSelected}
        className={`deals-destination-sheet__option${isSelected ? " is-selected" : ""}`}
        key={option.value}
        onClick={() => selectOption(option)}
        type="button"
      >
        <span className="deals-destination-sheet__option-icon" aria-hidden="true">
          {icon ?? <MapPin />}
        </span>
        <span>{option.label}</span>
        {isSelected ? <Check aria-hidden="true" className="deals-destination-sheet__check" /> : null}
      </button>
    );
  };

  const mobileSheet =
    isOpen && mobileDestinationSheet && isMobileSheetViewport
      ? createPortal(
          <div
            className="deals-destination-sheet"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeSelect();
            }}
          >
            <div
              aria-labelledby={sheetTitleId}
              aria-modal="true"
              className="deals-destination-sheet__dialog"
              ref={sheetRef}
              role="dialog"
            >
              <header className="deals-destination-sheet__header">
                <div>
                  <span>{label}</span>
                  <h2 id={sheetTitleId}>{t("destinationPicker.title")}</h2>
                </div>
                <button
                  aria-label={t("destinationPicker.close")}
                  className="deals-destination-sheet__close"
                  onClick={() => closeSelect()}
                  type="button"
                >
                  <X aria-hidden="true" />
                </button>
              </header>

              <label className="deals-destination-sheet__search" htmlFor={searchLabelId}>
                <Search aria-hidden="true" />
                <span className="sr-only">{t("destinationPicker.searchLabel")}</span>
                <input
                  autoComplete="off"
                  id={searchLabelId}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t("destinationPicker.searchPlaceholder")}
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                />
                {searchQuery ? (
                  <button
                    aria-label={t("destinationPicker.clearSearch")}
                    onClick={() => {
                      setSearchQuery("");
                      searchInputRef.current?.focus();
                    }}
                    type="button"
                  >
                    <X aria-hidden="true" />
                  </button>
                ) : null}
              </label>

              <div className="deals-destination-sheet__body">
                {searchQuery ? (
                  <section className="deals-destination-sheet__section">
                    <h3>{t("destinationPicker.searchResults")}</h3>
                    {filteredOptions.length > 0 ? (
                      <div className="deals-destination-sheet__list">
                        {filteredOptions.map((option) => renderSheetOption(option))}
                      </div>
                    ) : (
                      <p className="deals-destination-sheet__empty">
                        {t("destinationPicker.noResults")}
                      </p>
                    )}
                  </section>
                ) : (
                  <>
                    {options.find((option) => option.value === "any" && !option.disabled)
                      ? renderSheetOption(
                          options.find((option) => option.value === "any")!,
                          <Sparkles />,
                        )
                      : null}

                    {recentOptions.length > 0 ? (
                      <section className="deals-destination-sheet__section">
                        <h3>
                          <Clock3 aria-hidden="true" />
                          {t("destinationPicker.recent")}
                        </h3>
                        <div className="deals-destination-sheet__chips">
                          {recentOptions.map((option) => renderSheetOption(option))}
                        </div>
                      </section>
                    ) : null}

                    <section className="deals-destination-sheet__section">
                      <h3>
                        <Sparkles aria-hidden="true" />
                        {t("destinationPicker.popular")}
                      </h3>
                      <div className="deals-destination-sheet__chips">
                        {popularOptions.map((option) => renderSheetOption(option))}
                      </div>
                    </section>

                    <section className="deals-destination-sheet__section">
                      <h3>{t("destinationPicker.all")}</h3>
                      <div className="deals-destination-sheet__list">
                        {enabledDestinationOptions.map((option) => renderSheetOption(option))}
                      </div>
                    </section>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className={`deals-control deals-select${mobileDestinationSheet ? " deals-select--destination-sheet" : ""}${className ? ` ${className}` : ""}`}
      ref={rootRef}
    >
      <span id={`${listboxId}-label`}>{label}</span>
      <button
        aria-controls={isMobileSheetViewport && mobileDestinationSheet ? undefined : listboxId}
        aria-expanded={isOpen}
        aria-haspopup={isMobileSheetViewport && mobileDestinationSheet ? "dialog" : "listbox"}
        aria-labelledby={`${listboxId}-label ${selectedValueId}`}
        className={`deals-select__trigger${leadingIcon ? " has-leading-icon" : ""}${isOpen ? " is-open" : ""}`}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key) && !isOpen) {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        ref={triggerRef}
        type="button"
      >
        {leadingIcon ? (
          <span aria-hidden="true" className="deals-select__leading-icon">
            {leadingIcon}
          </span>
        ) : null}
        <strong id={selectedValueId}>{selectedOption?.label ?? label}</strong>
        <ChevronDown
          aria-hidden="true"
          className="deals-select__chevron"
          size={18}
          strokeWidth={1.9}
        />
      </button>

      {isOpen && (!mobileDestinationSheet || !isMobileSheetViewport) ? (
        <div aria-labelledby={`${listboxId}-label`} className="deals-select__menu" id={listboxId} role="listbox">
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <button
                aria-selected={isSelected}
                className={`deals-select__option${isSelected ? " is-selected" : ""}${option.disabled ? " is-disabled" : ""}`}
                disabled={option.disabled}
                key={option.value}
                onClick={() => selectOption(option)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    moveFocus(event.key === "ArrowDown" ? 1 : -1);
                  } else if (event.key === "Home" || event.key === "End") {
                    event.preventDefault();
                    const next = event.key === "Home" ? 0 : options.length - 1;
                    setActiveIndex(next);
                    optionRefs.current[next]?.focus();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    closeSelect();
                  }
                }}
                ref={(node) => { optionRefs.current[index] = node; }}
                role="option"
                tabIndex={index === activeIndex ? 0 : -1}
                type="button"
              >
                <span>{option.label}</span>
                {isSelected ? <i aria-hidden="true">✓</i> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {mobileSheet}
    </div>
  );
}
