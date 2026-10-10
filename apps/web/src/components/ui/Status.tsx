import type { CheckState } from "@graspchain/shared";
import { Icon, type IconName } from "./Icon";

export type Tone = "ok" | "warn" | "bad" | "none" | "ink" | "signal";

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
  signal: "bg-signal-wash",
};
export const TONE_MARK: Record<Tone, string> = {
  ok: "bg-ok-mark",
  warn: "bg-warn-mark",
  bad: "bg-bad-mark",
  none: "bg-none-mark",
  ink: "bg-ink",
  signal: "bg-signal",
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
  not_in_article: { tone: "none", icon: "missed", word: "Unsupported by the article" },
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

/** A small washed tag for flags and modes. */
export function Tag({ tone = "ink", children, icon }: { tone?: Tone; children: React.ReactNode; icon?: IconName }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-xs px-2 py-0.5 text-xs font-medium ${TONE_WASH[tone]} ${TONE_TEXT[tone]}`}>
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  );
}
