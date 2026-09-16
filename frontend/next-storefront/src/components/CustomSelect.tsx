"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";

interface CustomSelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  options: CustomSelectOption[];
  value: string;
  onChange: (value: string) => void;
  id?: string;
  wrapId?: string;
  ariaLabel?: string;
  title?: string;
  className?: string;
}

export default function CustomSelect({
  options,
  value,
  onChange,
  id,
  wrapId,
  ariaLabel,
  title,
  className = "",
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDropup, setIsDropup] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<HTMLDivElement[]>([]);
  const generatedId = useId();
  const listboxId = `${id || generatedId}-listbox`;

  const selectedOption = options.find((o) => o.value === value) || options[0];

  const close = useCallback((restoreFocus = false) => {
    setIsOpen(false);
    setIsDropup(false);
    setFocusedIndex(-1);
    if (restoreFocus) {
      selectedRef.current?.focus();
    }
  }, []);

  const toggleOpen = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next && containerRef.current) {
        const el = containerRef.current;
        const rect = el.getBoundingClientRect();
        const modalContainer = el.closest(".player-modal-body, .player-modal-container, .player-modal");
        let spaceBelow = window.innerHeight - rect.bottom;
        let spaceAbove = rect.top;
        if (modalContainer) {
          const mRect = modalContainer.getBoundingClientRect();
          spaceBelow = Math.min(spaceBelow, mRect.bottom - rect.bottom);
          spaceAbove = Math.min(spaceAbove, rect.top - mRect.top);
        }
        const isNearBottomSection = !!el.closest(".tv-episodes-section");
        if ((spaceBelow < 270 || isNearBottomSection) && spaceAbove > 160) {
          setIsDropup(true);
        } else {
          setIsDropup(false);
        }
      } else if (!next) {
        setIsDropup(false);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (
        containerRef.current &&
        (containerRef.current.contains(target) || (e.composedPath && e.composedPath().includes(containerRef.current)))
      ) {
        return;
      }
      close(false);
    }
    document.addEventListener("click", handleClickOutside, true);
    return () => document.removeEventListener("click", handleClickOutside, true);
  }, [isOpen, close]);

  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && itemsRef.current[focusedIndex]) {
      itemsRef.current[focusedIndex].scrollIntoView({ block: "nearest" });
    }
  }, [isOpen, focusedIndex]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        toggleOpen();
        setFocusedIndex(options.findIndex((o) => o.value === value));
      }
      return;
    }

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (focusedIndex >= 0) {
          onChange(options[focusedIndex].value);
          close(true);
        }
        break;
    }
  }

  const containerId = wrapId || (id ? (id.endsWith("-wrap") ? id : `${id}-wrap`) : undefined);

  return (
    <div
      ref={containerRef}
      className={`custom-select${isOpen ? " select-open" : ""}${isDropup ? " is-dropup" : ""} ${className}`}
      id={containerId}
    >
      {id && (
        <select
          id={id}
          aria-label={ariaLabel || title}
          title={title}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          tabIndex={-1}
          style={{ display: "none" }}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
      <div
        ref={selectedRef}
        className={`select-selected${isOpen ? " select-arrow-active" : ""}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        tabIndex={0}
        title={title}
        onClick={toggleOpen}
        onKeyDown={handleKeyDown}
      >
        <span className="select-text">{selectedOption?.label || ""}</span>
      </div>
      <div
        id={listboxId}
        className={`select-items${isOpen ? "" : " select-hide"}${isDropup ? " select-dropup" : ""}`}
        role="listbox"
      >
        {options.map((option, idx) => (
          <div
            key={option.value}
            ref={(el) => {
              itemsRef.current[idx] = el!;
            }}
            className={`${option.value === value ? "same-as-selected" : ""}${idx === focusedIndex ? " keyboard-focused" : ""}`}
            role="option"
            aria-selected={option.value === value}
            title={option.label}
            onClick={(e) => {
              e.stopPropagation();
              onChange(option.value);
              close(false);
            }}
          >
            {option.label}
          </div>
        ))}
      </div>
    </div>
  );
}
