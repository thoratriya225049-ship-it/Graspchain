"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useState } from "react";
import { useCalm, useOnScreen } from "./hooks";

/**
 * One slow band of oversized outlined type — adapted from Aceternity Labs "Wispr Flow Text
 * Animation" — set on a deep forest-teal band as the landing page's signature moment. Each stage
 * word is stroked in its stage colour, lifted for the dark ground (Understand Sky · Evidence Aqua ·
 * Decision light Teal · Proof near-white). The band drifts a little with scroll; hovering pauses it
 * and fills the word under the pointer with a quiet tint of its own colour. Pauses offscreen; still
 * under reduced motion. Decorative: the sentence is given once to assistive tech.
 */
const WORDS = [
  { w: "Understand", c: "#AEDFF7" },
  { w: "Evidence", c: "#6ACCC6" },
  { w: "Decision", c: "#4FB3C9" },
  { w: "Proof", c: "#EAF8F7" },
];

/** Fine grain, a few percent strong: tonal depth without a visible pattern. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

function Run() {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center whitespace-nowrap pr-[0.35em] font-serif text-[clamp(5rem,13vw,11rem)] leading-none tracking-[-0.03em]"
    >
      {WORDS.map((x) => (
        <span key={x.w} className="flex items-center">
          <span
            className="text-transparent transition-[color] duration-700 ease-[var(--ease-water)] hover:[color:var(--fill)]"
            style={{ WebkitTextStroke: `1.5px ${x.c}`, ["--fill" as string]: `color-mix(in srgb, ${x.c} 20%, transparent)` }}
          >
            {x.w}
          </span>
          <span className="px-[0.28em] text-[0.5em] text-transparent" style={{ WebkitTextStroke: "1.2px rgb(143 180 187 / 0.55)" }}>
            →
          </span>
        </span>
      ))}
    </span>
  );
}

export function OutlineMarquee() {
  const { still } = useCalm();
  const [ref, onScreen] = useOnScreen<HTMLElement>();
  const [hover, setHover] = useState(false);
  // A slight drift tied to scroll, layered on the slow loop, so the band answers the reader.
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const drift = useTransform(scrollYProgress, [0, 1], ["4%", "-11%"]);

  return (
    <section
      ref={ref}
      className="relative isolate overflow-hidden py-16 md:py-24"
      style={{
        background:
          "radial-gradient(70% 120% at 12% 0%, rgb(63 179 172 / 0.16), transparent 60%), radial-gradient(60% 110% at 92% 100%, rgb(18 112 138 / 0.28), transparent 65%), linear-gradient(180deg, #062A2E 0%, #08353A 55%, #062B30 100%)",
      }}
      role="img"
      aria-label="Understand, then evidence, then decision, then proof."
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-aqua/20" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-aqua/10" />
      <motion.div
        style={{
          x: still ? 0 : drift,
          maskImage: "linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent)",
          WebkitMaskImage: "linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent)",
        }}
      >
        <div
          className="flex w-max"
          style={{
            animationName: still ? "none" : "marquee",
            animationDuration: "56s",
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
            animationPlayState: onScreen && !hover ? "running" : "paused",
          }}
        >
          <Run />
          <Run />
        </div>
      </motion.div>
    </section>
  );
}
