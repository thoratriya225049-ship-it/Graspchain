"use client";

import { DecryptText } from "@/components/fx/DecryptText";
import { Dot, type Tone } from "@/components/ui/Status";

/**
 * The receipt as an object: a printed slip on Abyss with a thin thread-gradient edge and
 * perforated ends. Mono throughout. The one place in the product where a card is justified.
 */
export interface SlipRow {
  k: string;
  v: React.ReactNode;
}

export function ReceiptSlip({
  assessmentId,
  hash,
  rows = [],
  state,
  decrypt = false,
  seal,
  className = "",
  compact = false,
}: {
  assessmentId: string | null;
  hash: string | null;
  rows?: SlipRow[];
  state?: { tone: Tone; label: string } | null;
  decrypt?: boolean;
  seal?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={`relative ${className}`}>
      <div
        className="on-abyss relative overflow-hidden rounded-[22px] shadow-float"
        style={{
          WebkitMaskImage:
            "radial-gradient(circle 7px at 0 64px, transparent 6.5px, #000 7px), radial-gradient(circle 7px at 100% 64px, transparent 6.5px, #000 7px)",
          WebkitMaskComposite: "source-in",
          maskImage:
            "radial-gradient(circle 7px at 0 64px, transparent 6.5px, #000 7px), radial-gradient(circle 7px at 100% 64px, transparent 6.5px, #000 7px)",
          maskComposite: "intersect",
        }}
      >
        <div aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "var(--thread-x)" }} />
        <div className={compact ? "px-5 pb-5 pt-5" : "px-6 pb-6 pt-6 sm:px-7"}>
          <div className="flex h-8 items-center justify-between gap-3">
            <p className="mono text-2xs uppercase tracking-[0.2em] text-on-dark-2">graspchain.receipt/1</p>
            {state ? (
              <span className="inline-flex items-center gap-2 text-xs font-medium text-on-dark">
                <Dot tone={state.tone} /> {state.label}
              </span>
            ) : null}
          </div>
          <div aria-hidden className="mt-4 border-t border-dashed border-white/20" />
          <dl className="mt-4 space-y-3 font-mono text-[0.8125rem]">
            <div>
              <dt className="text-2xs uppercase tracking-[0.14em] text-on-dark-2">Assessment</dt>
              <dd className="mt-0.5 break-all text-on-dark">{assessmentId ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-2xs uppercase tracking-[0.14em] text-on-dark-2">Record hash · SHA-256</dt>
              <dd className="mt-0.5 break-all text-aqua">
                {hash ? (
                  decrypt ? (
                    <DecryptText value={hash} speed={1} />
                  ) : (
                    <span className="mono num">{hash}</span>
                  )
                ) : (
                  <span className="text-on-dark-2">waiting…</span>
                )}
              </dd>
            </div>
            {rows.map((r) => (
              <div key={r.k} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3">
                <dt className="text-2xs uppercase leading-5 tracking-[0.14em] text-on-dark-2">{r.k}</dt>
                <dd className="min-w-0 break-words text-on-dark">{r.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      {seal ? <div className="absolute -bottom-10 -right-4 z-10 sm:-right-10">{seal}</div> : null}
    </div>
  );
}
