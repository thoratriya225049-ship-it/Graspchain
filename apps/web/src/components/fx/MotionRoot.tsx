"use client";

import { MotionConfig } from "motion/react";

/** Every motion component honours the visitor's reduced-motion setting (transforms off, fades kept). */
export function MotionRoot({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.32, ease: [0.22, 0.8, 0.2, 1] }}>
      {children}
    </MotionConfig>
  );
}
