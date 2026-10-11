"use client";

import { motion, useScroll, useSpring, useTransform } from "motion/react";

/**
 * The signature motif: a slim Sky → Aqua → Teal → Abyss thread along the left margin of the
 * assessment journey, built on the Aceternity "Tracing Beam" pattern. Four labelled nodes —
 * Understand, Evidence, Decision, Proof. The thread is drawn down to the current node and
 * keeps drawing toward the next one as the page is scrolled; the current node gently fills.
 * Wide screens get the rail; narrower ones get the same four steps inline (JourneySteps).
 */
export type Stage = "understand" | "evidence" | "decision" | "proof";
export const STAGES: { id: Stage; label: string; color: string }[] = [
  { id: "understand", label: "Understand", color: "#AEDFF7" },
  { id: "evidence", label: "Evidence", color: "#6ACCC6" },
  { id: "decision", label: "Decision", color: "#12708A" },
  { id: "proof", label: "Proof", color: "#0B3A4A" },
];
const POS = [0.08, 0.36, 0.64, 0.92];

export function JourneyThread({ stage, tone = "light" }: { stage: Stage; tone?: "light" | "dark" }) {
  const i = STAGES.findIndex((s) => s.id === stage);
  const { scrollYProgress } = useScroll();
  const smooth = useSpring(scrollYProgress, { stiffness: 90, damping: 24 });
  const next = POS[Math.min(3, i + 1)];
  const fill = useTransform(smooth, (p) => `${(POS[i] + (next - POS[i]) * p) * 100}%`);
  const dark = tone === "dark";
  return (
    <nav aria-label="Assessment journey" className="pointer-events-none fixed bottom-12 left-5 top-28 z-20 hidden w-28 xl:block 2xl:left-8">
      <div className={`absolute bottom-0 left-[5px] top-0 w-px ${dark ? "bg-white/12" : "bg-rule"}`} />
      <motion.div
        className="absolute left-[5px] top-0 w-px origin-top"
        style={{ height: fill, background: "var(--thread)" }}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 0.8, 0.2, 1] }}
      />
      <ol>
        {STAGES.map((s, k) => {
          const state = k < i ? "done" : k === i ? "current" : "next";
          return (
            <li
              key={s.id}
              className="absolute left-0 flex -translate-y-1/2 items-center gap-3"
              style={{ top: `${POS[k] * 100}%` }}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="relative flex h-[11px] w-[11px] items-center justify-center">
                {state === "current" ? (
                  <motion.span
                    className="absolute inset-0 rounded-full"
                    style={{ background: s.color }}
                    initial={{ scale: 0.3, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.5, ease: [0.22, 0.8, 0.2, 1] }}
                  />
                ) : null}
                <span
                  className="relative h-[11px] w-[11px] rounded-full border"
                  style={{
                    borderColor:
                      state === "next" ? (dark ? "rgb(234 248 247 / 0.3)" : "rgb(11 58 74 / 0.22)") : s.color === "#0B3A4A" && dark ? "#6ACCC6" : s.color,
                    background: state === "done" ? s.color : "transparent",
                  }}
                />
              </span>
              <span
                className={`text-2xs font-semibold uppercase tracking-[0.14em] ${
                  state === "current" ? (dark ? "text-on-dark" : "text-ink") : dark ? "text-on-dark-2" : "text-ink-3"
                }`}
              >
                {s.label}
                <span className="sr-only">{state === "done" ? " (done)" : state === "current" ? " (you are here)" : ""}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The same four steps, inline, for screens without room for the rail. */
export function JourneySteps({ stage, tone = "light", className = "" }: { stage: Stage; tone?: "light" | "dark"; className?: string }) {
  const i = STAGES.findIndex((s) => s.id === stage);
  const dark = tone === "dark";
  return (
    <ol aria-label="Assessment journey" className={`flex items-center gap-2 xl:hidden ${className}`}>
      {STAGES.map((s, k) => (
        <li key={s.id} className="flex items-center gap-2" aria-current={k === i ? "step" : undefined}>
          <span
            className="h-1 w-6 rounded-full sm:w-10"
            style={{ background: k <= i ? (s.color === "#0B3A4A" && dark ? "#6ACCC6" : s.color) : dark ? "rgb(234 248 247 / 0.15)" : "rgb(11 58 74 / 0.12)" }}
          />
          {k === i ? (
            <span className={`text-2xs font-semibold uppercase tracking-[0.14em] ${dark ? "text-on-dark" : "text-ink"}`}>{s.label}</span>
          ) : (
            <span className="sr-only">{s.label}</span>
          )}
        </li>
      ))}
    </ol>
  );
}
