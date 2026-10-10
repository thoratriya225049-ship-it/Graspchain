"use client";

import { useState } from "react";
import { Icon } from "./Icon";
import { TONE_MARK, TONE_TEXT, type Tone } from "./Status";

/** Inline message with a left rule — not a boxed card. */
export function Notice({ tone = "ink", title, children, role }: { tone?: Tone; title?: string; children?: React.ReactNode; role?: "status" | "alert" }) {
  const rule = { ok: "border-ok-mark", warn: "border-warn-mark", bad: "border-bad-mark", none: "border-none-mark", ink: "border-ink", signal: "border-signal" }[
    tone
  ];
  return (
    <div role={role ?? (tone === "bad" ? "alert" : "status")} className={`border-l-2 ${rule} py-1 pl-4`}>
      {title ? <p className={`text-sm font-semibold ${TONE_TEXT[tone]}`}>{title}</p> : null}
      {children ? <div className="mt-0.5 text-sm text-ink-2">{children}</div> : null}
    </div>
  );
}

/** A labelled 0–1 meter. The value is printed; the bar is a supplement. */
export function Meter({
  label,
  value,
  hint,
  tone = "ink",
  size = "md",
}: {
  label: string;
  value: number | null;
  hint?: string;
  tone?: Tone;
  size?: "sm" | "md";
}) {
  const pct = value === null ? 0 : Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className={size === "sm" ? "text-sm text-ink-2" : "text-[0.9375rem] font-medium"}>{label}</span>
        <span className="num mono text-sm text-ink">{value === null ? "—" : `${pct}`}</span>
      </div>
      <div
        className={`mt-1.5 ${size === "sm" ? "h-1" : "h-1.5"} w-full bg-paper-deep`}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className={`h-full ${TONE_MARK[tone]} origin-left transition-[width] duration-700 ease-out`} style={{ width: `${pct}%` }} />
      </div>
      {hint ? <p className="mt-1.5 text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

/** A hash or id in mono, grouped for reading, with copy. */
export function Hash({ value, short = false, label }: { value: string; short?: boolean; label?: string }) {
  const [copied, setCopied] = useState(false);
  const shown = short && value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
  return (
    <span className="group relative inline-flex max-w-full items-center gap-1.5 align-baseline">
      <span className="mono num break-all text-ink-2" title={value}>
        {shown}
      </span>
      <button
        type="button"
        className="shrink-0 text-ink-3 opacity-70 transition-opacity hover:text-ink hover:opacity-100"
        aria-label={`Copy ${label ?? "value"}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          } catch {
            /* clipboard blocked */
          }
        }}
      >
        <Icon name={copied ? "check" : "copy"} size={13} />
        <span className="sr-only" aria-live="polite">
          {copied ? "Copied" : ""}
        </span>
      </button>
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="eyebrow block">
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {error ? (
        <p className="mt-2 text-sm text-bad" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-2 text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xs border border-rule-strong bg-paper-raised px-3 py-2.5 text-[0.9375rem] text-ink placeholder:text-ink-3/70 transition-colors focus:border-ink focus:outline-none aria-[invalid=true]:border-bad";
