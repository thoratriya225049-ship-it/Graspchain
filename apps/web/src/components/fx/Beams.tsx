"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCalm, useOnScreen } from "./hooks";

/**
 * Background Beams With Collision — adapted from Aceternity UI. Thin Sky → Aqua → Teal beams
 * fall toward a target (the receipt). While `running`, beams rain slowly; when `collide` turns
 * true, one beam falls onto the target's top edge, a quiet ripple marks the hit, and
 * `onCollide` fires so the result can land. `stopped` (a failure) fades every beam out.
 * No glow halos: 1px lines and a ring, nothing else.
 */
const RAIN = [
  { x: 8, d: 6.5, delay: 0.2, h: 56 },
  { x: 21, d: 4.2, delay: 1.8, h: 36 },
  { x: 34, d: 7.4, delay: 0.9, h: 80 },
  { x: 62, d: 5.1, delay: 2.4, h: 44 },
  { x: 75, d: 8.2, delay: 0.5, h: 96 },
  { x: 88, d: 4.8, delay: 1.3, h: 52 },
  { x: 95, d: 6.1, delay: 3.1, h: 28 },
];

export function Beams({
  running,
  collide,
  stopped,
  targetRef,
  onCollide,
  className = "",
}: {
  running: boolean;
  collide: boolean;
  stopped: boolean;
  targetRef: React.RefObject<HTMLElement | null>;
  onCollide?: () => void;
  className?: string;
}) {
  const { still } = useCalm();
  const [hostRef, onScreen] = useOnScreen<HTMLDivElement>();
  const [hit, setHit] = useState<{ x: number; y: number } | null>(null);
  const [fall, setFall] = useState<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (!collide) {
      fired.current = false;
      setFall(null);
      setHit(null);
      return;
    }
    if (fired.current) return;
    fired.current = true;
    const host = hostRef.current?.getBoundingClientRect();
    const t = targetRef.current?.getBoundingClientRect();
    if (!host || !t || still) {
      onCollide?.();
      return;
    }
    setFall({ x: t.left - host.left + t.width / 2, y: t.top - host.top });
  }, [collide, still, targetRef, hostRef, onCollide]);

  const rain = running && !stopped && !still && onScreen;
  const particles = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i,
        dx: Math.cos((i / 12) * Math.PI) * (26 + (i % 3) * 10),
        dy: -Math.sin((i / 12) * Math.PI) * (14 + (i % 4) * 6),
      })),
    [],
  );

  return (
    <div ref={hostRef} aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <AnimatePresence>
        {rain
          ? RAIN.map((b) => (
              <motion.span
                key={b.x}
                className="absolute top-0 w-px rounded-full"
                style={{ left: `${b.x}%`, height: b.h, background: "linear-gradient(to bottom, transparent, #AEDFF7 40%, #6ACCC6 75%, #12708A)" }}
                initial={{ y: -120, opacity: 0 }}
                animate={{ y: ["-120px", "110vh"], opacity: [0, 0.9, 0.9, 0] }}
                exit={{ opacity: 0, transition: { duration: 0.4 } }}
                transition={{ duration: b.d, delay: b.delay, repeat: Infinity, repeatDelay: 1.2, ease: "linear" }}
              />
            ))
          : null}
      </AnimatePresence>
      {fall && !stopped ? (
        <motion.span
          className="absolute top-0 w-px rounded-full"
          style={{ left: fall.x, height: 120, background: "linear-gradient(to bottom, transparent, #AEDFF7 30%, #6ACCC6 70%, #12708A)" }}
          initial={{ y: -140, opacity: 0 }}
          animate={{ y: fall.y - 120, opacity: 1 }}
          transition={{ duration: 0.9, ease: [0.55, 0, 0.75, 0.3] }}
          onAnimationComplete={() => {
            setHit(fall);
            setFall(null);
            onCollide?.();
          }}
        />
      ) : null}
      <AnimatePresence>
        {hit ? (
          <motion.div
            key="hit"
            className="absolute"
            style={{ left: hit.x, top: hit.y }}
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1.6, delay: 0.4 }}
          >
            <motion.span
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-aqua"
              initial={{ width: 4, height: 4, opacity: 0.9 }}
              animate={{ width: 120, height: 34, opacity: 0 }}
              transition={{ duration: 1.1, ease: [0.22, 0.8, 0.2, 1] }}
            />
            {particles.map((p) => (
              <motion.span
                key={p.id}
                className="absolute h-1 w-1 rounded-full bg-sky"
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{ x: p.dx, y: p.dy, opacity: 0 }}
                transition={{ duration: 0.9 + (p.id % 3) * 0.2, ease: [0.22, 0.8, 0.2, 1] }}
              />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
