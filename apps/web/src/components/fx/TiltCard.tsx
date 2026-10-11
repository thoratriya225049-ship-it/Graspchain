"use client";

import { motion, useMotionValue, useSpring } from "motion/react";
import { useRef } from "react";
import { useCalm } from "./hooks";

/**
 * A few degrees of tilt toward the pointer — adapted from Aceternity UI "3D Card Effect".
 * Used for the receipt slip and (at 2–3°) the X-Ray panels. Touch, low power and reduced
 * motion get a flat card.
 */
export function TiltCard({
  children,
  max = 4,
  className = "",
  innerClassName = "",
}: {
  children: React.ReactNode;
  max?: number;
  className?: string;
  innerClassName?: string;
}) {
  const { still, coarse } = useCalm();
  const ref = useRef<HTMLDivElement>(null);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const sx = useSpring(rx, { stiffness: 140, damping: 20 });
  const sy = useSpring(ry, { stiffness: 140, damping: 20 });
  const live = !still && !coarse;
  if (!live)
    return (
      <div className={className}>
        <div className={innerClassName}>{children}</div>
      </div>
    );
  return (
    <div className={className} style={{ perspective: "1200px" }}>
      <motion.div
        ref={ref}
        className={innerClassName}
        style={{ rotateX: sx, rotateY: sy, transformStyle: "preserve-3d" }}
        onPointerMove={(e) => {
          if (!live || !ref.current || e.pointerType !== "mouse") return;
          const r = ref.current.getBoundingClientRect();
          ry.set(((e.clientX - r.left) / r.width - 0.5) * 2 * max);
          rx.set(-((e.clientY - r.top) / r.height - 0.5) * 2 * max);
        }}
        onPointerLeave={() => {
          rx.set(0);
          ry.set(0);
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
