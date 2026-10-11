"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useCalm, useOnScreen } from "./hooks";

/**
 * Video Text — adapted from Sera UI "Video Text" (MIT). A slow, locally hosted loop of ink
 * dispersing in water shows through the letters of one large word.
 *
 * The real word stays in the DOM (selectable, read once by screen readers) and is filled with
 * the poster frame via background-clip:text. The video sits exactly over it, clipped by an
 * SVG <clipPath> drawn with the same computed font, so webfonts work (a data-URI mask cannot
 * load them). Reduced motion, low power, slow connections and unsupported formats keep the poster.
 */
export function VideoText({ text, src, poster, className = "" }: { text: string; src: string; poster: string; className?: string }) {
  const { still } = useCalm();
  const [hostRef, onScreen] = useOnScreen<HTMLSpanElement>("200px");
  const probe = useRef<HTMLSpanElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const id = useId().replace(/:/g, "");
  const [box, setBox] = useState<{ w: number; h: number; base: number; font: React.CSSProperties } | null>(null);
  const [canPlay, setCanPlay] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const v = document.createElement("video");
    setCanPlay(!!v.canPlayType('video/webm; codecs="vp9"'));
  }, []);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      setBox({
        w: el.offsetWidth,
        h: el.offsetHeight,
        base: probe.current?.offsetTop ?? el.offsetHeight * 0.8,
        font: {
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight as React.CSSProperties["fontWeight"],
          fontStyle: cs.fontStyle,
          letterSpacing: cs.letterSpacing,
          fontVariationSettings: cs.fontVariationSettings,
          fontFeatureSettings: cs.fontFeatureSettings,
        },
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [hostRef, text]);

  const play = !still && canPlay && onScreen;
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (play) void v.play().catch(() => undefined);
    else v.pause();
  }, [play]);

  return (
    <span
      ref={hostRef}
      className={`relative inline-block whitespace-nowrap ${className}`}
      style={{
        backgroundImage: `url(${poster}), linear-gradient(100deg, var(--color-sky), var(--color-aqua) 45%, var(--color-mint))`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
      }}
    >
      {text}
      <span ref={probe} aria-hidden className="inline-block h-0 w-0 align-baseline" />
      {box && !still && canPlay ? (
        <>
          <svg aria-hidden width="0" height="0" className="absolute">
            <defs>
              <clipPath id={`vt-${id}`} clipPathUnits="userSpaceOnUse">
                <text x="0" y={box.base} style={box.font}>
                  {text}
                </text>
              </clipPath>
            </defs>
          </svg>
          <video
            ref={video}
            aria-hidden
            tabIndex={-1}
            muted
            loop
            playsInline
            preload={onScreen ? "auto" : "none"}
            poster={poster}
            onCanPlay={() => setReady(true)}
            className="pointer-events-none absolute left-0 top-0 select-none object-cover transition-opacity duration-700"
            style={{ width: box.w, height: box.h, clipPath: `url(#vt-${id})`, WebkitClipPath: `url(#vt-${id})`, opacity: ready ? 1 : 0 }}
          >
            {onScreen ? <source src={src} type="video/webm" /> : null}
          </video>
        </>
      ) : null}
    </span>
  );
}
