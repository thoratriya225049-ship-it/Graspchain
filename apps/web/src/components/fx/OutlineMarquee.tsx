"use client";

import { useCalm, useOnScreen } from "./hooks";

/**
 * One slow band of oversized outlined type — adapted from Aceternity Labs "Wispr Flow Text
 * Animation". SVG text so each stage word can be stroked in its own stage colour
 * (Understand Sky · Evidence Aqua · Decision Teal · Proof Abyss). Pauses offscreen; still under
 * reduced motion. Decorative: the sentence is given once to assistive tech.
 */
const WORDS = [
  { w: "Understand", c: "#7cc3e6" },
  { w: "Evidence", c: "#3fb3ac" },
  { w: "Decision", c: "#12708A" },
  { w: "Proof", c: "#0B3A4A" },
];

function Run() {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center whitespace-nowrap pr-[0.35em] font-serif text-[clamp(4.5rem,11vw,9.5rem)] leading-none tracking-[-0.03em]"
    >
      {WORDS.map((x) => (
        <span key={x.w} className="flex items-center">
          <span style={{ WebkitTextStroke: `1.4px ${x.c}`, color: "transparent" }}>{x.w}</span>
          <span className="px-[0.28em] text-[0.5em]" style={{ WebkitTextStroke: "1.2px #9db6bc", color: "transparent" }}>
            →
          </span>
        </span>
      ))}
    </span>
  );
}

export function OutlineMarquee() {
  const { still } = useCalm();
  const [ref, onScreen] = useOnScreen<HTMLDivElement>();
  return (
    <div ref={ref} className="relative overflow-hidden py-6" role="img" aria-label="Understand, then evidence, then decision, then proof.">
      <div
        className="flex w-max"
        style={{
          animationName: still ? "none" : "marquee",
          animationDuration: "70s",
          animationTimingFunction: "linear",
          animationIterationCount: "infinite",
          animationPlayState: onScreen ? "running" : "paused",
        }}
      >
        <Run />
        <Run />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-paper to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-paper to-transparent" />
    </div>
  );
}
