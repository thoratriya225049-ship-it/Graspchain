"use client";

import { useEffect, useState } from "react";
import { useCalm } from "./hooks";

/**
 * Decrypting Text — adapted from Sera UI "Decrypting Text" (MIT). A hash resolves character by
 * character from left to right. The final value is always the real DOM text once done; while
 * resolving, screen readers get the final value through aria-label.
 */
const HEX = "0123456789abcdef";

export function DecryptText({
  value,
  className = "",
  speed = 2,
  start = true,
  onDone,
}: {
  value: string;
  className?: string;
  /** Frames per resolved character (lower is faster). */
  speed?: number;
  start?: boolean;
  onDone?: () => void;
}) {
  const { still } = useCalm();
  const [shown, setShown] = useState(value);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!start || still || !value) {
      setShown(value);
      if (start) onDone?.();
      return;
    }
    let frame = 0;
    let raf = 0;
    setRunning(true);
    const tick = () => {
      const resolved = Math.floor(frame / speed);
      setShown(
        value
          .split("")
          .map((c, i) => (i < resolved || /[\s\-·:.x]/.test(c) ? c : HEX[Math.floor(Math.random() * 16)]))
          .join(""),
      );
      if (resolved >= value.length) {
        setShown(value);
        setRunning(false);
        onDone?.();
        return;
      }
      frame += 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, start, still, speed]);

  return (
    <span className={`mono num ${className}`} aria-label={running ? value : undefined}>
      <span aria-hidden={running || undefined}>{shown}</span>
    </span>
  );
}
