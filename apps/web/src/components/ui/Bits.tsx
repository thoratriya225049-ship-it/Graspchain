"use client";

import { useState } from "react";
import { Icon } from "./Icon";
import { TONE_MARK, TONE_TEXT, type Tone } from "./Status";

/** Calm inline message: a quiet rounded panel with a status dot — never a full-width alarm banner. */
export function Notice({
  tone = "ink",
  title,
  children,
  role,
  action,
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  role?: "status" | "alert";
  action?: React.ReactNode;
}) {
  const wash = { ok: "bg-ok-wash", warn: "bg-warn-wash", bad: "bg-bad-wash", none: "bg-none-wash", ink: "bg-paper-sunk", signal: "bg-mint" }[tone];
  return (
    <div role={role ?? (tone === "bad" ? "alert" : "status")} className={`flex items-start gap-3 rounded-[14px] px-4 py-3 ${wash}`}>
      <span className={`mt-[0.45rem] h-2 w-2 shrink-0 rounded-full ${TONE_MARK[tone]}`} aria-hidden />
      <div className="min-w-0 flex-1">
        {title ? <p className={`text-sm font-semibold ${TONE_TEXT[tone]}`}>{title}</p> : null}
        {children ? <div className={`text-sm text-ink-2 ${title ? "mt-0.5" : ""}`}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
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
  const fill = tone === "ink" ? "bg-teal" : TONE_MARK[tone];
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className={size === "sm" ? "text-sm text-ink-2" : "text-[0.9375rem] font-medium"}>{label}</span>
        <span className="num mono text-sm text-ink">{value === null ? "—" : `${pct}`}</span>
      </div>
      <div
        className={`mt-1.5 ${size === "sm" ? "h-1.5" : "h-2"} w-full overflow-hidden rounded-full bg-mint`}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className={`h-full rounded-full ${fill} origin-left transition-[width] duration-700 ease-out`} style={{ width: `${pct}%` }} />
      </div>
      {hint ? <p className="mt-1.5 text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

/** A hash or id in mono, with copy. */
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
        className="shrink-0 rounded-md p-0.5 text-ink-3 opacity-70 transition-opacity hover:text-ink hover:opacity-100"
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
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {error ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-bad" role="alert">
          <Icon name="alert" size={14} /> {error}
        </p>
      ) : hint ? (
        <p className="mt-2 text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "w-full rounded-[12px] border border-rule-strong bg-paper-raised px-3.5 py-2.5 text-[0.9375rem] text-ink placeholder:text-ink-3/70 transition-[border-color,box-shadow] duration-200 focus:border-teal focus:shadow-[0_0_0_4px_rgb(106_204_198/0.45)] focus:outline-none focus-visible:outline-none aria-[invalid=true]:border-bad-mark";
