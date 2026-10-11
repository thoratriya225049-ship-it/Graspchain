import type { CheckState } from "@graspchain/shared";
import { Icon, type IconName } from "./Icon";

export type Tone = "ok" | "warn" | "bad" | "none" | "ink" | "signal";

/** Text tints that hold AA on Paper (and, inside .on-abyss, on Abyss). */
export const TONE_TEXT: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
  none: "text-none",
  ink: "text-ink",
  signal: "text-signal-ink",
};
export const TONE_WASH: Record<Tone, string> = {
  ok: "bg-ok-wash",
  warn: "bg-warn-wash",
  bad: "bg-bad-wash",
  none: "bg-none-wash",
  ink: "bg-paper-sunk",
  signal: "bg-mint",
};
/** The status hue itself: small marks only (dots, bars, rules). */
export const TONE_MARK: Record<Tone, string> = {
  ok: "bg-ok-mark",
  warn: "bg-warn-mark",
  bad: "bg-bad-mark",
  none: "bg-none-mark",
  ink: "bg-ink",
  signal: "bg-teal",
};
export const TONE_BORDER: Record<Tone, string> = {
  ok: "border-ok-mark",
  warn: "border-warn-mark",
  bad: "border-bad-mark",
  none: "border-none-mark",
  ink: "border-ink",
  signal: "border-teal",
};

interface Spec {
  tone: Tone;
  icon: IconName;
  word: string;
}

export const KP: Record<string, Spec> = {
  correct: { tone: "ok", icon: "check", word: "Understood" },
  vague: { tone: "warn", icon: "vague", word: "Partly understood" },
  incorrect: { tone: "bad", icon: "cross", word: "Misunderstood" },
  absent: { tone: "none", icon: "missed", word: "Missed" },
};

export const CLAIM: Record<string, Spec> = {
  supported: { tone: "ok", icon: "check", word: "Supported" },
  partial: { tone: "warn", icon: "vague", word: "Partly right" },
  not_in_article: { tone: "none", icon: "missed", word: "Not in the source" },
  contradicted: { tone: "bad", icon: "cross", word: "Contradicted" },
};

export const CHECK: Record<CheckState, Spec> = {
  pass: { tone: "ok", icon: "check", word: "Pass" },
  fail: { tone: "bad", icon: "cross", word: "Fail" },
  pending: { tone: "warn", icon: "vague", word: "Pending" },
  not_applicable: { tone: "none", icon: "dash", word: "Not applicable" },
  unavailable: { tone: "none", icon: "alert", word: "Unavailable" },
};

export const CHAIN: Record<string, Spec> = {
  queued: { tone: "warn", icon: "vague", word: "Queued for the chain" },
  sent: { tone: "warn", icon: "vague", word: "Sent · awaiting a block" },
  mined: { tone: "ok", icon: "check", word: "Recorded on-chain" },
  failed: { tone: "bad", icon: "cross", word: "Chain write failed" },
};

/** Glyph + word, in the tone's text colour. Never colour alone. */
export function Mark({ spec, className = "", compact = false, label }: { spec: Spec; className?: string; compact?: boolean; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${TONE_TEXT[spec.tone]} ${className}`}>
      <Icon name={spec.icon} size={compact ? 13 : 15} />
      <span className={compact ? "text-xs font-medium" : "text-sm font-medium"}>{label ?? spec.word}</span>
    </span>
  );
}

/** A small pill for flags and modes. */
export function Tag({ tone = "ink", children, icon }: { tone?: Tone; children: React.ReactNode; icon?: IconName }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_WASH[tone]} ${TONE_TEXT[tone]}`}>
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  );
}

/** A status dot that always carries a word beside it (or an accessible label). */
export function Dot({ tone, label, pulse = false }: { tone: Tone; label?: string; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {pulse ? (
        <span className={`absolute inset-0 rounded-full ${TONE_MARK[tone]} opacity-50`} style={{ animation: "ticker 2s var(--ease-in-out) infinite" }} />
      ) : null}
      <span className={`relative h-2 w-2 rounded-full ${TONE_MARK[tone]}`} />
    </span>
  );
}
