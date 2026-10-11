"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { useCalm } from "./hooks";

/**
 * The seal: text set on a circle around a mark — adapted from Sera UI "Curved Text" (MIT),
 * here as an SVG textPath so it stays crisp and costs nothing at rest. It turns once when a
 * verification succeeds, and never otherwise.
 */
export function CurvedSeal({
  size = 148,
  text = "VERIFIED ON-CHAIN · GRASPCHAIN · ",
  tone = "ok",
  spin = false,
  label = "Verified on-chain",
  surface = "light",
  children,
}: {
  size?: number;
  text?: string;
  tone?: "ok" | "neutral" | "dark";
  spin?: boolean;
  label?: string;
  surface?: "light" | "dark";
  children?: React.ReactNode;
}) {
  const { reduced } = useCalm();
  const id = useId().replace(/:/g, "");
  const r = 41;
  const circ = 2 * Math.PI * r;
  const ring = tone === "ok" ? "#2FA37A" : tone === "dark" ? "#6ACCC6" : "#12708A";
  const ink = surface === "dark" ? (tone === "ok" ? "#5FD3A5" : "#EAF8F7") : tone === "ok" ? "#1D7A58" : "#0B3A4A";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <motion.svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        aria-hidden
        className="absolute inset-0"
        initial={false}
        animate={spin && !reduced ? { rotate: 360 } : { rotate: 0 }}
        transition={spin ? { duration: 2.8, ease: [0.22, 0.8, 0.2, 1] } : { duration: 0 }}
      >
        <defs>
          <path id={`seal-${id}`} d={`M50,50 m-${r},0 a${r},${r} 0 1,1 ${r * 2},0 a${r},${r} 0 1,1 -${r * 2},0`} />
        </defs>
        <circle cx="50" cy="50" r="48" fill="none" stroke={ring} strokeOpacity="0.35" strokeWidth="0.6" />
        <circle cx="50" cy="50" r="34" fill="none" stroke={ring} strokeOpacity="0.5" strokeWidth="0.6" />
        <text fill={ink} style={{ fontFamily: "var(--font-mono)", fontSize: 6.4, letterSpacing: "0.12em", fontWeight: 500 }}>
          <textPath href={`#seal-${id}`} textLength={circ - 1} lengthAdjust="spacing">
            {text.repeat(2)}
          </textPath>
        </text>
      </motion.svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children ?? (
          <svg viewBox="0 0 40 40" width={size * 0.36} height={size * 0.36} aria-hidden>
            <circle cx="20" cy="20" r="18" fill={ring} />
            <path d="M12.5 20.5l5 5 10-11" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </div>
  );
}
