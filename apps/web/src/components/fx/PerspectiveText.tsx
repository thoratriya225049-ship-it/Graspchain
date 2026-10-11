"use client";

import { motion, useMotionValue, useSpring } from "motion/react";
import { useEffect, useRef } from "react";
import { useCalm, useOnScreen } from "./hooks";

/**
 * 3D perspective headline — adapted from Skiper UI "3D perspective text" (skiper28).
 * The block tilts a few degrees toward the pointer; each <Depth> layer sits at its own Z, so
 * lines separate slightly as it turns. Off on touch, low-power and reduced-motion: plain type.
 */
export function PerspectiveText({ children, className = "", max = 7 }: { children: React.ReactNode; className?: string; max?: number }) {
  const { still, coarse } = useCalm();
  const [ref, onScreen] = useOnScreen<HTMLDivElement>();
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const sx = useSpring(rx, { stiffness: 70, damping: 18, mass: 0.8 });
  const sy = useSpring(ry, { stiffness: 70, damping: 18, mass: 0.8 });
  const live = !still && !coarse && onScreen;
  const host = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!live) {
      rx.set(0);
      ry.set(0);
      return;
    }
    host.current = ref.current?.closest<HTMLElement>("[data-tilt-host]") ?? document.body;
    const el = host.current;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 2 - 1;
      const y = ((e.clientY - r.top) / r.height) * 2 - 1;
      ry.set(x * max * 1.3);
      rx.set(-y * max);
    };
    const onLeave = () => {
      rx.set(0);
      ry.set(0);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [live, max, rx, ry, ref]);

  return (
    <div ref={ref} className={className} style={{ perspective: "1100px" }}>
      <motion.div style={{ rotateX: sx, rotateY: sy, transformStyle: "preserve-3d" }}>{children}</motion.div>
    </div>
  );
}

export function Depth({ z, children, className = "" }: { z: number; children: React.ReactNode; className?: string }) {
  return (
    <div className={className} style={{ transform: `translateZ(${z}px)`, transformStyle: "preserve-3d" }}>
      {children}
    </div>
  );
}
