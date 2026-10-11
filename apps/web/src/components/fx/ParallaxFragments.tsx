"use client";

import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react";
import { useEffect } from "react";
import { useCalm, useOnScreen } from "./hooks";

/**
 * Parallax Hero Images — adapted from Aceternity UI. Instead of photos, the layers are rendered
 * fragments of Graspchain itself (a band, a claim, an evidence quote, a receipt). Each layer
 * blurs in, then drifts with the pointer by its depth. Static on touch / low power / reduced motion.
 */
export interface Fragment {
  node: React.ReactNode;
  /** CSS position inside the host. */
  style: React.CSSProperties;
  depth: number;
  className?: string;
}

const SPRING = { damping: 26, stiffness: 110 };

export function ParallaxFragments({ fragments, className = "" }: { fragments: Fragment[]; className?: string }) {
  const { still, coarse } = useCalm();
  const [ref, onScreen] = useOnScreen<HTMLDivElement>();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, SPRING);
  const sy = useSpring(my, SPRING);
  const live = !still && !coarse && onScreen;

  useEffect(() => {
    if (!live) return;
    const onMove = (e: MouseEvent) => {
      mx.set((e.clientX / window.innerWidth) * 2 - 1);
      my.set((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [live, mx, my]);

  return (
    <div ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 ${className}`}>
      {fragments.slice(0, 8).map((f, i) => (
        <Layer key={i} f={f} i={i} sx={sx} sy={sy} still={still} />
      ))}
    </div>
  );
}

function Layer({ f, i, sx, sy, still }: { f: Fragment; i: number; sx: MotionValue<number>; sy: MotionValue<number>; still: boolean }) {
  const max = 34;
  const x = useTransform(sx, [-1, 1], [-max * f.depth, max * f.depth]);
  const y = useTransform(sy, [-1, 1], [-max * f.depth, max * f.depth]);
  return (
    <motion.div
      className={`absolute ${f.className ?? ""}`}
      style={{ ...f.style, x, y, zIndex: Math.round(f.depth * 10) }}
      initial={still ? { opacity: 0 } : { opacity: 0, filter: "blur(18px)", scale: 0.94 }}
      animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
      transition={{ duration: 0.9, delay: 0.5 + i * 0.12, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {f.node}
    </motion.div>
  );
}
