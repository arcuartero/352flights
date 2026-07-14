"use client";

import { useEffect, useId, useRef, useState } from "react";

export type PublicDealsSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export function PublicDealsSelect({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: PublicDealsSelectOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selectedOption = options[selectedIndex] ?? options[0];

  useEffect(() => {
    if (!isOpen) return;
    setActiveIndex(selectedIndex);
    requestAnimationFrame(() => optionRefs.current[selectedIndex]?.focus());

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen, selectedIndex]);

  const moveFocus = (direction: 1 | -1) => {
    let next = activeIndex;
    do {
      next = (next + direction + options.length) % options.length;
    } while (options[next]?.disabled && next !== activeIndex);
    setActiveIndex(next);
    optionRefs.current[next]?.focus();
  };

  return (
    <div className={`deals-control deals-select${className ? ` ${className}` : ""}`} ref={rootRef}>
      <span id={`${listboxId}-label`}>{label}</span>
      <button
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-labelledby={`${listboxId}-label`}
        className={`deals-select__trigger${isOpen ? " is-open" : ""}`}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key) && !isOpen) {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        type="button"
      >
        <strong>{selectedOption?.label ?? label}</strong>
        <i aria-hidden="true">⌄</i>
      </button>

      {isOpen ? (
        <div aria-labelledby={`${listboxId}-label`} className="deals-select__menu" id={listboxId} role="listbox">
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <button
                aria-selected={isSelected}
                className={`deals-select__option${isSelected ? " is-selected" : ""}${option.disabled ? " is-disabled" : ""}`}
                disabled={option.disabled}
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
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
                    setIsOpen(false);
                    rootRef.current?.querySelector<HTMLButtonElement>(".deals-select__trigger")?.focus();
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
    </div>
  );
}
