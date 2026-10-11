"use client";

import { motion } from "motion/react";
import { useState } from "react";

/** Small line marks, drawn to match Icon's 16-unit grid and stroke. */
const MARKS = {
  // a seeded shuffle: two crossing paths
  shuffle: "M2.5 5h2c1.3 0 2.1.6 2.9 1.8l1.7 2.4c.8 1.2 1.6 1.8 2.9 1.8h1.5M2.5 11h2c.9 0 1.6-.3 2.2-.9M9.3 5.9c.6-.6 1.3-.9 2.2-.9h1.5M11.8 3.3 13.5 5l-1.7 1.7M11.8 9.3 13.5 11l-1.7 1.7",
  // a clock that starts on arrival
  clock: "M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM8 5v3.2l2.1 1.3",
  // one balanced judgement
  scales: "M8 2.6v10.6M5.2 13.2h5.6M3.2 4.4h9.6M3.2 4.4l-1.7 4a1.9 1.9 0 0 0 3.4 0zM12.8 4.4l-1.7 4a1.9 1.9 0 0 0 3.4 0z",
} as const;

export interface FairStep {
  tag: string;
  title: string;
  body: string;
  mark: keyof typeof MARKS;
}

/**
 * "Fair by construction" as a journey, not a row of blocks: three numbered stations joined by thin
 * arrows (left → right on desktop, top → bottom on phones) that draw in once on view. Hovering a
 * station lights the path up to it, so the order — equal entry, then equal reading, then one grader —
 * is felt, not just read.
 */
export function FairJourney({ steps }: { steps: FairStep[] }) {
  const [active, setActive] = useState<number | null>(null);
  return (
    <ol className="relative mt-14 grid gap-12 md:mt-16 md:grid-cols-3 md:gap-8" onPointerLeave={() => setActive(null)}>
      {steps.map((s, i) => {
        const reached = active !== null && i <= active;
        const pathLit = active !== null && i < active;
        const last = i === steps.length - 1;
        return (
          <li key={s.title} className="group relative grid grid-cols-[3rem_minmax(0,1fr)] gap-x-5 md:block" onPointerEnter={() => setActive(i)}>
            {/* station + the arrow to the next one */}
            <div className="relative md:flex md:items-center">
              <span
                className={`relative z-10 grid h-12 w-12 shrink-0 place-items-center rounded-full border transition-[background-color,border-color,color,transform] duration-300 ease-[var(--ease-water)] group-hover:scale-105 ${
                  reached ? "border-teal bg-teal text-white" : "border-teal/35 bg-paper text-teal"
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={MARKS[s.mark]} />
                </svg>
              </span>
              {!last ? (
                <>
                  {/* desktop: a horizontal arrow across to the next station */}
                  <span aria-hidden className="relative mx-4 hidden h-px flex-1 md:block">
                    <motion.span
                      className={`absolute inset-0 origin-left transition-colors duration-300 ${pathLit ? "bg-teal" : "bg-teal/30"}`}
                      initial={{ scaleX: 0 }}
                      whileInView={{ scaleX: 1 }}
                      viewport={{ once: true, amount: 0.8 }}
                      transition={{ duration: 0.9, delay: 0.25 + i * 0.35, ease: [0.22, 0.8, 0.2, 1] }}
                    />
                    <motion.svg
                      width="8"
                      height="10"
                      viewBox="0 0 8 10"
                      className={`absolute -right-px top-1/2 -translate-y-1/2 transition-colors duration-300 ${pathLit ? "text-teal" : "text-teal/45"}`}
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true, amount: 0.8 }}
                      transition={{ duration: 0.3, delay: 1 + i * 0.35 }}
                    >
                      <path d="M1 1l5.5 4L1 9" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </motion.svg>
                  </span>
                  {/* phones: the same arrow, downwards */}
                  <span aria-hidden className="absolute left-6 top-14 -bottom-10 w-px md:hidden">
                    <motion.span
                      className={`absolute inset-0 origin-top transition-colors duration-300 ${pathLit ? "bg-teal" : "bg-teal/30"}`}
                      initial={{ scaleY: 0 }}
                      whileInView={{ scaleY: 1 }}
                      viewport={{ once: true, amount: 0.8 }}
                      transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 0.8, 0.2, 1] }}
                    />
                    <svg width="10" height="8" viewBox="0 0 10 8" className={`absolute -bottom-px left-1/2 -translate-x-1/2 ${pathLit ? "text-teal" : "text-teal/45"}`}>
                      <path d="M1 1l4 5.5L9 1" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </>
              ) : null}
            </div>

            <div className="min-w-0 pt-1 md:mt-7 md:pr-6 md:pt-0">
              <p className="flex items-baseline gap-2.5">
                <span className="num mono text-sm text-teal">0{i + 1}</span>
                <span className="text-2xs font-semibold uppercase tracking-[0.16em] text-ink-3">{s.tag}</span>
              </p>
              <h3 className="mt-2.5 font-serif text-[1.5rem] leading-tight text-ink transition-transform duration-300 ease-[var(--ease-water)] group-hover:-translate-y-0.5">
                {s.title}
              </h3>
              <span aria-hidden className="mt-3.5 block h-px w-8 bg-teal/40 transition-[width,background-color] duration-500 ease-[var(--ease-water)] group-hover:w-16 group-hover:bg-teal" />
              <p className="mt-3.5 max-w-[34ch] text-[0.9375rem] leading-relaxed text-ink-2 transition-colors duration-300 group-hover:text-ink">{s.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
