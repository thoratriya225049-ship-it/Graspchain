"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export const EASE_WATER = [0.22, 0.8, 0.2, 1] as const;

function media(query: string) {
  return {
    subscribe(cb: () => void) {
      if (typeof window === "undefined") return () => undefined;
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    get: () => (typeof window === "undefined" ? false : window.matchMedia(query).matches),
  };
}
const reduceQ = media("(prefers-reduced-motion: reduce)");
const coarseQ = media("(pointer: coarse)");

/** True when the visitor asked for less motion. Server render assumes motion is fine; nothing depends on it for content. */
export function useReducedMotionPref() {
  return useSyncExternalStore(reduceQ.subscribe, reduceQ.get, () => false);
}

/** Touch-first pointer: hover effects become taps, pointer parallax is switched off. */
export function useCoarsePointer() {
  return useSyncExternalStore(coarseQ.subscribe, coarseQ.get, () => false);
}

interface NavigatorHints {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
}

function readLowPower() {
  if (typeof navigator === "undefined") return false;
  const n = navigator as Navigator & NavigatorHints;
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = n.deviceMemory ?? 8;
  const slow = n.connection?.saveData || /(^|-)2g|3g/.test(n.connection?.effectiveType ?? "");
  return cores <= 2 || memory <= 2 || !!slow;
}
const noop = () => () => undefined;

/** Low-power or data-saving device: heavy effects (video, beams, parallax) fall back to their still frame. */
export function useLowPower() {
  return useSyncExternalStore(noop, readLowPower, () => false);
}

/** One answer for "may this effect move?" — reduced motion and low power both say no. */
export function useCalm() {
  const reduced = useReducedMotionPref();
  const coarse = useCoarsePointer();
  const lowPower = useLowPower();
  return { reduced, coarse, lowPower, still: reduced || lowPower };
}

/** Visibility via IntersectionObserver: effects pause when their element is offscreen. */
export function useOnScreen<T extends Element>(rootMargin = "120px") {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return setOn(true);
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);
  return [ref, on] as const;
}

/** Becomes true the first time the element enters view, then stays true (for once-only reveals). */
export function useSeenOnce<T extends Element>(threshold = 0.35) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") return setSeen(true);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);
  return [ref, seen] as const;
}
