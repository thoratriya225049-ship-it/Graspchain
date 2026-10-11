"use client";

import { motion } from "motion/react";
import { useId } from "react";

/**
 * Pill switch (Sign In / Create New ID, Claims / Coverage / Misreadings, Check modes).
 * A radiogroup: arrow keys move the choice, the pill slides with a water ease.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  tone = "light",
  size = "md",
  className = "",
}: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  label: string;
  tone?: "light" | "dark";
  size?: "sm" | "md";
  className?: string;
}) {
  const id = useId();
  const dark = tone === "dark";
  const move = (dir: 1 | -1) => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length];
    onChange(next.value);
    requestAnimationFrame(() => document.getElementById(`${id}-${next.value}`)?.focus());
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`relative inline-flex rounded-full p-1 ${dark ? "bg-abyss-2 ring-1 ring-white/10" : "bg-mint"} ${className}`}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            id={`${id}-${o.value}`}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={`relative z-0 rounded-full font-medium transition-colors duration-200 ${size === "sm" ? "h-8 px-3.5 text-xs" : "h-10 px-5 text-sm"} ${
              on ? (dark ? "text-abyss" : "text-white") : dark ? "text-on-dark-2 hover:text-on-dark" : "text-ink-2 hover:text-ink"
            }`}
          >
            {on ? (
              <motion.span
                layoutId={`${id}-pill`}
                className={`absolute inset-0 -z-10 rounded-full ${dark ? "bg-aqua" : "bg-teal"}`}
                transition={{ type: "spring", stiffness: 380, damping: 36 }}
              />
            ) : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
