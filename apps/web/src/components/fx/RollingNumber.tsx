"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useState } from "react";
import { EASE_WATER, useCalm, useSeenOnce } from "./hooks";

/**
 * The Score: a drum roll that counts up once, then settles into plain text.
 * Adapted from Skiper UI "3D Rolling Text on scroll" (skiper88) / "Rolling text" (skiper27)
 * and Sera UI "Number Ticker" (MIT). Each digit is a drum that turns (rotateX + travel) to its
 * value as the number enters view; afterwards the DOM holds the real number only, so it can be
 * selected and copied. The whole figure has one accessible name.
 */
export function RollingNumber({
  value,
  decimals = 1,
  className = "",
  label,
  duration = 1.5,
}: {
  value: number;
  decimals?: number;
  className?: string;
  label: string;
  duration?: number;
}) {
  const { still } = useCalm();
  const [ref, seen] = useSeenOnce<HTMLSpanElement>(0.4);
  const [done, setDone] = useState(false);
  const text = value.toFixed(decimals);

  useEffect(() => {
    if (!seen || still) return;
    const t = window.setTimeout(() => setDone(true), duration * 1000 + 450);
    return () => window.clearTimeout(t);
  }, [seen, still, duration]);

  const settled = still || done;
  return (
    <span ref={ref} className={`relative inline-flex items-baseline ${className}`} role="img" aria-label={label}>
      {settled ? (
        <span aria-hidden>{text}</span>
      ) : (
        <>
          <span className="sr-only">{text}</span>
          <span aria-hidden className="inline-flex" style={{ perspective: "600px" }}>
            {text
              .split("")
              .map((ch, i) =>
                /\d/.test(ch) ? (
                  <Drum key={i} digit={Number(ch)} go={seen} delay={(text.length - 1 - i) * 0.09} duration={duration} />
                ) : (
                  <span key={i} data-d={ch} className="before:content-[attr(data-d)]" style={{ opacity: seen ? 1 : 0, transition: "opacity 400ms" }} />
                ),
              )}
          </span>
        </>
      )}
    </span>
  );
}

function Drum({ digit, go, delay, duration }: { digit: number; go: boolean; delay: number; duration: number }) {
  // Travel through one full turn before landing: 0 → 10 + digit (in "digit heights").
  const pos = useMotionValue(0);
  const y = useTransform(pos, (p) => `${-p}em`);
  const tilt = useTransform(pos, (p) => (p % 1) * -24);
  useEffect(() => {
    if (!go) return;
    const c = animate(pos, 10 + digit, { duration, delay, ease: EASE_WATER });
    return () => c.stop();
  }, [go, digit, delay, duration, pos]);
  return (
    <span className="relative inline-block h-[1em] overflow-hidden leading-none" style={{ width: "0.62em" }}>
      <span className="invisible before:content-['0']" />
      <motion.span className="absolute inset-x-0 top-0 flex flex-col items-center" style={{ y, rotateX: tilt, transformOrigin: "50% 50%" }}>
        {Array.from({ length: 20 }, (_, k) => (
          // Digits drawn as generated content: the DOM text stays the real number.
          <span key={k} data-d={k % 10} className="block h-[1em] leading-none before:content-[attr(data-d)]" />
        ))}
      </motion.span>
    </span>
  );
}
