"use client";

import {
  CalendarDays,
  Check,
  ChevronDown,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

import type { PublicDealsSelectOption } from "@/components/public-deals-select";
import { useI18n, type Locale } from "@/lib/i18n";
import { getWhenFilterDateRange, type WhenFilter } from "@/lib/public-deals-search";

type DatePickerSelection = {
  whenFilter: WhenFilter;
  dateFrom: string | null;
  dateTo: string | null;
};

type PublicDealsDatePickerProps = {
  label: string;
  value: WhenFilter;
  dateFrom: string | null;
  dateTo: string | null;
  presetOptions: PublicDealsSelectOption[];
  onChange: (selection: DatePickerSelection) => void;
  className?: string;
  popoverClassName?: string;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function dateFromKey(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function dateToKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, amount: number) {
  return new Date(value.getTime() + amount * DAY_IN_MS);
}

function addMonths(value: Date, amount: number) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + amount, 1, 12));
}

function startOfMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1, 12));
}

function isSameMonth(left: Date, right: Date) {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth()
  );
}

function getCalendarDays(month: Date) {
  const monthStart = startOfMonth(month);
  const mondayOffset = (monthStart.getUTCDay() + 6) % 7;
  const gridStart = addDays(monthStart, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

function localeTag(locale: Locale) {
  return locale === "pt" ? "pt-PT" : locale;
}

export function formatPublicDealDateRange(
  dateFrom: string | null,
  dateTo: string | null,
  locale: Locale,
) {
  if (!dateFrom || !dateTo) {
    return "";
  }

  const from = dateFromKey(dateFrom);
  const to = dateFromKey(dateTo);
  const formatter = new Intl.DateTimeFormat(localeTag(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return formatter.formatRange(from, to);
}

export function PublicDealsDatePicker({
  label,
  value,
  dateFrom,
  dateTo,
  presetOptions,
  onChange,
  className,
  popoverClassName,
}: PublicDealsDatePickerProps) {
  const { locale, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [draftWhenFilter, setDraftWhenFilter] = useState<WhenFilter>(value);
  const [draftFrom, setDraftFrom] = useState<string | null>(dateFrom);
  const [draftTo, setDraftTo] = useState<string | null>(dateTo);
  const showsCalendar = draftWhenFilter === "custom";
  const today = useMemo(() => {
    const current = new Date();
    return new Date(Date.UTC(current.getFullYear(), current.getMonth(), current.getDate(), 12));
  }, []);
  const minDate = dateToKey(today);
  const maxDate = dateToKey(addDays(addMonths(startOfMonth(today), 19), -1));
  const [opensAbove, setOpensAbove] = useState(false);
  const [popoverMaxHeight, setPopoverMaxHeight] = useState(560);
  const [usesViewportLayer, setUsesViewportLayer] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const monthsScrollRef = useRef<HTMLDivElement | null>(null);
  const monthRefs = useRef<Array<HTMLElement | null>>([]);
  const pickerId = useId();

  const selectedPreset = presetOptions.find((option) => option.value === value);
  const triggerLabel =
    value === "custom"
      ? formatPublicDealDateRange(dateFrom, dateTo, locale) || t("deals.datePicker.custom")
      : selectedPreset?.label ?? t("deals.when.any");
  const draftPresetRange = getWhenFilterDateRange(draftWhenFilter, today);
  const visualFrom = draftWhenFilter === "custom" ? draftFrom : draftPresetRange?.dateFrom ?? null;
  const visualTo = draftWhenFilter === "custom" ? draftTo : draftPresetRange?.dateTo ?? null;

  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        new Intl.DateTimeFormat(localeTag(locale), {
          weekday: "short",
          timeZone: "UTC",
        }).format(new Date(Date.UTC(2026, 0, 5 + index, 12))),
      ),
    [locale],
  );

  const calendarMonths = useMemo(
    () => Array.from({ length: 19 }, (_, index) => addMonths(startOfMonth(today), index)),
    [today],
  );
  const monthFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(localeTag(locale), {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
    [locale],
  );
  const fullDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(localeTag(locale), {
        dateStyle: "full",
        timeZone: "UTC",
      }),
    [locale],
  );

  const updatePopoverPlacement = (calendarVisible: boolean) => {
    const controlRect = rootRef.current?.getBoundingClientRect();
    if (!controlRect) {
      return;
    }

    const spaceAbove = Math.max(240, controlRect.top - 12);
    const spaceBelow = Math.max(240, window.innerHeight - controlRect.bottom - 12);

    if (!calendarVisible) {
      setUsesViewportLayer(window.innerWidth <= 820);
      setOpensAbove(false);
      setPopoverMaxHeight(Math.floor(Math.max(240, window.innerHeight - 32)));
      return;
    }

    const popoverWidth = Math.min(624, window.innerWidth - 32);
    const wouldOverflowHorizontally =
      controlRect.left < 16 || controlRect.left + popoverWidth > window.innerWidth - 16;
    const shouldUseViewportLayer =
      window.innerHeight <= 900 || window.innerWidth <= 560 || wouldOverflowHorizontally;
    const shouldOpenAbove = spaceBelow < 480 && spaceAbove > spaceBelow;
    setUsesViewportLayer(shouldUseViewportLayer);
    setOpensAbove(!shouldUseViewportLayer && shouldOpenAbove);
    setPopoverMaxHeight(
      Math.floor(
        shouldUseViewportLayer
          ? Math.max(240, window.innerHeight - 32)
          : shouldOpenAbove
            ? spaceAbove
            : spaceBelow,
      ),
    );
  };

  const openPicker = () => {
    updatePopoverPlacement(value === "custom");
    const presetRange = getWhenFilterDateRange(value, today);
    setDraftWhenFilter(value);
    setDraftFrom(value === "custom" ? dateFrom : presetRange?.dateFrom ?? null);
    setDraftTo(value === "custom" ? dateTo : presetRange?.dateTo ?? null);
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    const handleResize = () => updatePopoverPlacement(showsCalendar);

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [isOpen, showsCalendar]);

  useEffect(() => {
    if (!isOpen || !usesViewportLayer) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, usesViewportLayer]);

  useEffect(() => {
    if (!isOpen || !showsCalendar) {
      return;
    }

    const selectedMonth = startOfMonth(visualFrom ? dateFromKey(visualFrom) : today);
    const targetIndex = calendarMonths.findIndex((month) => isSameMonth(month, selectedMonth));

    const frame = requestAnimationFrame(() => {
      const scrollContainer = monthsScrollRef.current;
      const targetMonth = monthRefs.current[Math.max(0, targetIndex)];
      const firstMonth = monthRefs.current[0];
      if (scrollContainer && targetMonth && firstMonth) {
        scrollContainer.scrollTop = targetMonth.offsetTop - firstMonth.offsetTop;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [calendarMonths, isOpen, showsCalendar, today, visualFrom]);

  const selectDate = (dateKey: string) => {
    setDraftWhenFilter("custom");

    if (!draftFrom || draftTo) {
      setDraftFrom(dateKey);
      setDraftTo(null);
      return;
    }

    if (dateKey < draftFrom) {
      setDraftFrom(dateKey);
      setDraftTo(null);
      return;
    }

    setDraftTo(dateKey);
  };

  const visiblePresetOptions = presetOptions.filter((option) => option.value !== "any");
  const canApply = Boolean(draftFrom && draftTo);

  const popover = isOpen ? (
    <div
      aria-label={t("deals.datePicker.selectRange")}
      aria-modal={usesViewportLayer ? true : undefined}
      className={`deals-date-picker__popover${showsCalendar ? "" : " is-presets-only"}${opensAbove ? " is-above" : ""}${usesViewportLayer ? " is-viewport-layer" : ""}${popoverClassName ? ` ${popoverClassName}` : ""}`}
      id={`${pickerId}-popover`}
      ref={popoverRef}
      role="dialog"
      style={
        {
          "--deals-date-picker-max-height": `${popoverMaxHeight}px`,
        } as CSSProperties
      }
    >
      <div className="deals-date-picker__presets">
        <div className="deals-date-picker__mobile-header">
          <div className="deals-date-picker__intro">
            <h2>{t("deals.datePicker.travelHeading")}</h2>
            <p>{t("deals.datePicker.travelDescription")}</p>
          </div>
          <button
            aria-label={t("deals.mobile.close")}
            className="deals-date-picker__mobile-close"
            onClick={() => {
              setIsOpen(false);
              requestAnimationFrame(() => triggerRef.current?.focus());
            }}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="deals-date-picker__intro deals-date-picker__intro--desktop">
          <h2>{t("deals.datePicker.travelHeading")}</h2>
          <p>{t("deals.datePicker.travelDescription")}</p>
        </div>
        {visiblePresetOptions.map((option) => {
          const isSelected = option.value === draftWhenFilter;
          return (
            <button
              aria-pressed={isSelected}
              className={isSelected ? "is-selected" : ""}
              disabled={option.disabled}
              key={option.value}
              onClick={() => {
                const whenFilter = option.value as WhenFilter;
                setDraftWhenFilter(whenFilter);
                setDraftFrom(null);
                setDraftTo(null);
                onChange({
                  whenFilter,
                  dateFrom: null,
                  dateTo: null,
                });
                setIsOpen(false);
                requestAnimationFrame(() => triggerRef.current?.focus());
              }}
              type="button"
            >
              <span>{option.label}</span>
              <Check
                aria-hidden="true"
                className="deals-date-picker__preset-check"
                data-visible={isSelected ? "true" : "false"}
                size={16}
                strokeWidth={2.2}
              />
            </button>
          );
        })}
        <button
          aria-pressed={draftWhenFilter === "custom"}
          className={draftWhenFilter === "custom" ? "is-selected" : ""}
          onClick={() => {
            updatePopoverPlacement(true);
            setDraftWhenFilter("custom");
            if (!draftFrom || draftTo) {
              setDraftFrom(null);
              setDraftTo(null);
            }
          }}
          type="button"
        >
          <span>{t("deals.datePicker.custom")}</span>
          <Check
            aria-hidden="true"
            className="deals-date-picker__preset-check"
            data-visible={draftWhenFilter === "custom" ? "true" : "false"}
            size={16}
            strokeWidth={2.2}
          />
        </button>
      </div>

      {showsCalendar ? (
        <div className="deals-date-picker__calendar">
          <div
            aria-label={t("deals.datePicker.selectRange")}
            className="deals-date-picker__months"
            ref={monthsScrollRef}
          >
            {calendarMonths.map((month, monthIndex) => {
                const monthKey = dateToKey(month).slice(0, 7);
                return (
                  <section
                    className="deals-date-picker__month"
                    key={monthKey}
                    ref={(element) => {
                      monthRefs.current[monthIndex] = element;
                    }}
                  >
                    <strong className="deals-date-picker__month-title">
                      {monthFormatter.format(month)}
                    </strong>
                    <div className="deals-date-picker__weekdays" aria-hidden="true">
                      {weekdayLabels.map((weekday) => (
                        <span key={`${monthKey}-${weekday}`}>{weekday}</span>
                      ))}
                    </div>
                    <div className="deals-date-picker__days">
                      {getCalendarDays(month).map((day) => {
                        const key = dateToKey(day);
                        const isOutside = !isSameMonth(day, month);
                        const isDisabled = isOutside || key < minDate || key > maxDate;
                        const isStart = !isOutside && key === visualFrom;
                        const isEnd = !isOutside && key === visualTo;
                        const isInRange = Boolean(
                          !isOutside && visualFrom && visualTo && key > visualFrom && key < visualTo,
                        );
                        const isToday = key === minDate;

                        return (
                          <button
                            aria-current={isToday ? "date" : undefined}
                            aria-label={fullDateFormatter.format(day)}
                            className={[
                              isOutside ? "is-outside" : "",
                              isStart ? "is-range-start" : "",
                              isEnd ? "is-range-end" : "",
                              isInRange ? "is-in-range" : "",
                              isToday ? "is-today" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            disabled={isDisabled}
                            key={`${monthKey}-${key}`}
                            onClick={() => selectDate(key)}
                            type="button"
                          >
                            {day.getUTCDate()}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
            })}
          </div>

        <div className="deals-date-picker__actions">
          <button
            className="deals-date-picker__cancel"
            onClick={() => setIsOpen(false)}
            type="button"
          >
            {t("deals.datePicker.cancel")}
          </button>
          <button
            className="deals-date-picker__apply"
            disabled={!canApply}
            onClick={() => {
              if (!canApply) {
                return;
              }

              onChange({
                whenFilter: draftWhenFilter,
                dateFrom: draftWhenFilter === "custom" ? draftFrom : null,
                dateTo: draftWhenFilter === "custom" ? draftTo : null,
              });
              setIsOpen(false);
            }}
            type="button"
          >
            {t("deals.datePicker.apply")}
          </button>
        </div>
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <>
      <div
        className={`deals-control deals-date-picker${className ? ` ${className}` : ""}`}
        ref={rootRef}
      >
        <span id={`${pickerId}-label`}>{label}</span>
        <button
          aria-controls={`${pickerId}-popover`}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-labelledby={`${pickerId}-label`}
          className={`deals-date-picker__trigger${isOpen ? " is-open" : ""}`}
          onClick={() => (isOpen ? setIsOpen(false) : openPicker())}
          ref={triggerRef}
          type="button"
        >
          <CalendarDays aria-hidden="true" size={18} strokeWidth={1.9} />
          <strong>{triggerLabel}</strong>
          <ChevronDown aria-hidden="true" className="deals-date-picker__chevron" size={18} />
        </button>

        {!usesViewportLayer ? popover : null}
      </div>

      {usesViewportLayer && popover
        ? createPortal(
            <div
              className="deals-date-picker__layer"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setIsOpen(false);
                }
              }}
            >
              {popover}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
