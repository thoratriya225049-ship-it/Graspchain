"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useCalm, useOnScreen } from "./hooks";

/**
 * Colourful Text — adapted from Aceternity UI "Colourful Text". One key word per screen,
 * on Abyss only. Restricted to the palette tints that pass AA on Abyss as text
 * (Sky 8.55, Aqua 6.44, Periwinkle 6.49, Lavender 4.82; Teal is 2.1:1 there, so it is left out).
 * Screen readers get the word once; the per-letter layer is hidden from them.
 */
const PALETTE = ["#AEDFF7", "#6ACCC6", "#B0BCE3", "#AB9BCB", "#AEDFF7", "#6ACCC6"];
/** On Sky / Paper: the deep end of the same families (Teal, deep Aqua, Abyss, deep Lavender), all AA as large text there. */
const PALETTE_LIGHT = ["#12708A", "#2E8F8A", "#0B3A4A", "#6F5E9E", "#12708A", "#2E8F8A"];

export function ColourfulText({ text, className = "", tone = "dark" }: { text: string; className?: string; tone?: "dark" | "light" }) {
  const { still } = useCalm();
  const [ref, onScreen] = useOnScreen<HTMLSpanElement>();
  const [colors, setColors] = useState(tone === "light" ? PALETTE_LIGHT : PALETTE);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (still || !onScreen) return;
    const i = window.setInterval(() => {
      setColors((c) => [...c].sort(() => Math.random() - 0.5));
      setCycle((n) => n + 1);
    }, 5000);
    return () => window.clearInterval(i);
  }, [still, onScreen]);

  if (still)
    return (
      <span ref={ref} className={`${tone === "light" ? "text-teal" : "text-aqua"} ${className}`}>
        {text}
      </span>
    );
  return (
    <span ref={ref} className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.split("").map((ch, i) => (
          <motion.span
            key={`${ch}-${cycle}-${i}`}
            className="inline-block whitespace-pre"
            initial={{ color: colors[(i + 1) % colors.length] }}
            animate={{
              color: colors[i % colors.length],
              y: [0, -3, 0],
              scale: [1, 1.02, 1],
              filter: ["blur(0px)", "blur(4px)", "blur(0px)"],
              opacity: [1, 0.85, 1],
            }}
            transition={{ duration: 0.6, delay: i * 0.05, ease: [0.22, 0.8, 0.2, 1] }}
          >
            {ch}
          </motion.span>
        ))}
      </span>
    </span>
  );
}
