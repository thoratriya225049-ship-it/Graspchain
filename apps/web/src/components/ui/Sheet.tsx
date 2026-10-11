"use client";

import { useEffect, useId, useRef } from "react";
import { Icon } from "./Icon";

/**
 * Drawer / bottom sheet on the native <dialog>: focus is trapped and restored, Esc closes,
 * the page behind is inert. Slides with CSS (@starting-style), so it costs no JS animation.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  side = "right",
  tone = "light",
  wide = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  side?: "right" | "bottom";
  tone?: "light" | "dark";
  wide?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-t`}
      aria-describedby={description ? `${id}-d` : undefined}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`gc-sheet gc-sheet-${side} ${tone === "dark" ? "on-abyss" : "bg-paper text-ink"} ${
        side === "right" ? `${wide ? "sm:w-[min(40rem,100vw)]" : "sm:w-[min(28rem,100vw)]"}` : ""
      }`}
    >
      <div className="flex h-full flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-rule px-6 pb-4 pt-6">
          <div>
            <h2 id={`${id}-t`} className="font-serif text-xl leading-tight">
              {title}
            </h2>
            {description ? (
              <p id={`${id}-d`} className="mt-1 text-sm text-ink-3">
                {description}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="-mr-2 rounded-full p-2 text-ink-3 hover:bg-paper-sunk hover:text-ink" aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{children}</div>
      </div>
    </dialog>
  );
}

/** A quiet disclosure row: secondary content one interaction away. */
export function Reveal({
  summary,
  children,
  meta,
  defaultOpen = false,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  meta?: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group border-t border-rule" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[0.9375rem] font-medium text-ink [&::-webkit-details-marker]:hidden">
        <span>{summary}</span>
        <span className="flex items-center gap-3 text-ink-3">
          {meta ? <span className="text-xs font-normal">{meta}</span> : null}
          <Icon name="down" size={16} className="transition-transform duration-300 group-open:rotate-180" />
        </span>
      </summary>
      <div className="pb-6">{children}</div>
    </details>
  );
}
