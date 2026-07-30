"use client";

import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import type { PublicDealsSelectOption } from "@/components/public-deals-select";
import { useI18n, type Locale } from "@/lib/i18n";
import type { WhenFilter } from "@/lib/public-deals-search";

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

function localeTag(locale: Locale) {
  return locale === "pt" ? "pt-PT" : locale;
}

function formatDateField(value: string | null, locale: Locale) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat(localeTag(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(dateFromKey(value));
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
}: PublicDealsDatePickerProps) {
  const { locale, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState<string | null>(dateFrom);
  const [draftTo, setDraftTo] = useState<string | null>(dateTo);
  const today = useMemo(() => {
    const current = new Date();
    return new Date(Date.UTC(current.getFullYear(), current.getMonth(), current.getDate(), 12));
  }, []);
  const minDate = dateToKey(today);
  const maxDate = dateToKey(addDays(addMonths(startOfMonth(today), 19), -1));
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(dateFrom ? dateFromKey(dateFrom) : today),
  );
  const [opensAbove, setOpensAbove] = useState(false);
  const [popoverMaxHeight, setPopoverMaxHeight] = useState(560);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const pickerId = useId();

  const selectedPreset = presetOptions.find((option) => option.value === value);
  const triggerLabel =
    value === "custom"
      ? formatPublicDealDateRange(dateFrom, dateTo, locale) || t("deals.datePicker.custom")
      : selectedPreset?.label ?? t("deals.when.any");

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

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(visibleMonth);
    const mondayOffset = (monthStart.getUTCDay() + 6) % 7;
    const gridStart = addDays(monthStart, -mondayOffset);
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  }, [visibleMonth]);

  const openPicker = () => {
    const controlRect = rootRef.current?.getBoundingClientRect();
    if (controlRect) {
      const spaceAbove = Math.max(240, controlRect.top - 12);
      const spaceBelow = Math.max(240, window.innerHeight - controlRect.bottom - 12);
      const shouldOpenAbove = spaceBelow < 480 && spaceAbove > spaceBelow;
      setOpensAbove(shouldOpenAbove);
      setPopoverMaxHeight(Math.floor(shouldOpenAbove ? spaceAbove : spaceBelow));
    }
    setDraftFrom(dateFrom);
    setDraftTo(dateTo);
    setVisibleMonth(startOfMonth(dateFrom ? dateFromKey(dateFrom) : today));
    setIsOpen(true);
  };

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
        triggerRef.current?.focus();
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const selectDate = (dateKey: string) => {
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

  const previousMonth = addMonths(visibleMonth, -1);
  const nextMonth = addMonths(visibleMonth, 1);
  const canGoPrevious = previousMonth >= startOfMonth(today);
  const canGoNext = nextMonth <= startOfMonth(dateFromKey(maxDate));

  return (
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

      {isOpen ? (
        <div
          aria-label={t("deals.datePicker.selectRange")}
          className={`deals-date-picker__popover${opensAbove ? " is-above" : ""}`}
          id={`${pickerId}-popover`}
          role="dialog"
          style={
            {
              "--deals-date-picker-max-height": `${popoverMaxHeight}px`,
            } as CSSProperties
          }
        >
          <div className="deals-date-picker__presets">
            <span>{t("deals.datePicker.quickOptions")}</span>
            {presetOptions.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  aria-pressed={isSelected}
                  className={isSelected ? "is-selected" : ""}
                  disabled={option.disabled}
                  key={option.value}
                  onClick={() => {
                    onChange({
                      whenFilter: option.value as WhenFilter,
                      dateFrom: null,
                      dateTo: null,
                    });
                    setIsOpen(false);
                  }}
                  type="button"
                >
                  <span>{option.label}</span>
                  {isSelected ? <Check aria-hidden="true" size={16} strokeWidth={2.2} /> : null}
                </button>
              );
            })}
            <button
              aria-pressed={value === "custom"}
              className={value === "custom" ? "is-selected" : ""}
              onClick={() => {
                if (!draftFrom || draftTo) {
                  setDraftFrom(null);
                  setDraftTo(null);
                }
              }}
              type="button"
            >
              <span>{t("deals.datePicker.custom")}</span>
              {value === "custom" ? <Check aria-hidden="true" size={16} strokeWidth={2.2} /> : null}
            </button>
          </div>

          <div className="deals-date-picker__calendar">
            <div className="deals-date-picker__fields" aria-live="polite">
              <div>
                <span>{t("deals.datePicker.startDate")}</span>
                <strong>{formatDateField(draftFrom, locale) ?? "—"}</strong>
              </div>
              <i aria-hidden="true">–</i>
              <div>
                <span>{t("deals.datePicker.endDate")}</span>
                <strong>{formatDateField(draftTo, locale) ?? "—"}</strong>
              </div>
            </div>

            <div className="deals-date-picker__month-nav">
              <strong>
                {new Intl.DateTimeFormat(localeTag(locale), {
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(visibleMonth)}
              </strong>
              <div>
                <button
                  aria-label={t("deals.datePicker.previousMonth")}
                  disabled={!canGoPrevious}
                  onClick={() => setVisibleMonth(previousMonth)}
                  title={t("deals.datePicker.previousMonth")}
                  type="button"
                >
                  <ChevronLeft aria-hidden="true" size={19} />
                </button>
                <button
                  aria-label={t("deals.datePicker.nextMonth")}
                  disabled={!canGoNext}
                  onClick={() => setVisibleMonth(nextMonth)}
                  title={t("deals.datePicker.nextMonth")}
                  type="button"
                >
                  <ChevronRight aria-hidden="true" size={19} />
                </button>
              </div>
            </div>

            <div className="deals-date-picker__weekdays" aria-hidden="true">
              {weekdayLabels.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>

            <div className="deals-date-picker__days">
              {calendarDays.map((day) => {
                const key = dateToKey(day);
                const isOutside = !isSameMonth(day, visibleMonth);
                const isDisabled = isOutside || key < minDate || key > maxDate;
                const isStart = key === draftFrom;
                const isEnd = key === draftTo;
                const isInRange = Boolean(draftFrom && draftTo && key > draftFrom && key < draftTo);
                const isToday = key === minDate;

                return (
                  <button
                    aria-current={isToday ? "date" : undefined}
                    aria-label={new Intl.DateTimeFormat(localeTag(locale), {
                      dateStyle: "full",
                      timeZone: "UTC",
                    }).format(day)}
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
                    key={key}
                    onClick={() => selectDate(key)}
                    type="button"
                  >
                    {day.getUTCDate()}
                  </button>
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
                disabled={!draftFrom || !draftTo}
                onClick={() => {
                  if (!draftFrom || !draftTo) {
                    return;
                  }
                  onChange({
                    whenFilter: "custom",
                    dateFrom: draftFrom,
                    dateTo: draftTo,
                  });
                  setIsOpen(false);
                }}
                type="button"
              >
                {t("deals.datePicker.apply")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
