"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { BANDS, EVIDENCE_RULES } from "@graspchain/shared";
import { ParallaxFragments, type Fragment } from "@/components/fx/ParallaxFragments";
import { Depth, PerspectiveText } from "@/components/fx/PerspectiveText";
import { VideoText } from "@/components/fx/VideoText";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { StoryExample } from "@/components/fx/ChainFlow";

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: [0.22, 0.8, 0.2, 1] as const },
});

/**
 * The hero, on Abyss. Signature: a 3D perspective headline whose largest word shows ink
 * dispersing in water (Video Text). Behind it, parallax layers made of Graspchain fragments —
 * a score band, a student claim, its evidence, a published rule, a receipt — all real content.
 */
export function HomeHero({ ex, chain, registry, capS }: { ex: StoryExample; chain: string; registry: string | null; capS: number }) {
  const deep = BANDS.find((b) => b.band === "Deep")!;
  const rule = EVIDENCE_RULES.find((r) => r.id === "V-QUOTE")!;
  const frag = "rounded-[16px] bg-abyss-2/90 p-3.5 text-left ring-1 ring-white/10 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.6)]";
  const fragments: Fragment[] = [
    {
      style: { top: "12%", left: "3%" },
      depth: 0.35,
      className: "hidden lg:block",
      node: (
        <div className={`${frag} w-52`}>
          <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-sky">Score band</p>
          <p className="mt-1 font-serif text-3xl text-on-dark">{deep.band}</p>
          <p className="mono mt-1 text-xs text-on-dark-2">
            {deep.from.toFixed(1)} – {deep.to.toFixed(1)} of 10
          </p>
        </div>
      ),
    },
    {
      style: { top: "14%", right: "4%" },
      depth: 0.9,
      className: "hidden lg:block",
      node: (
        <div className={`${frag} w-72`}>
          <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-lavender">Claim · student</p>
          <p className="mt-1.5 font-serif text-sm leading-snug text-on-dark">
            <span className="bg-lavender/25 px-0.5">“…editing a single record changes its hash and every parent hash…”</span>
          </p>
        </div>
      ),
    },
    {
      style: { top: "58%", left: "5%" },
      depth: 0.8,
      className: "hidden xl:block",
      node: (
        <div className={`${frag} w-72`}>
          <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-aqua">Evidence · sentence {ex.sentenceNo}</p>
          <p className="mt-1.5 font-serif text-sm leading-snug text-on-dark">
            <span className="bg-aqua/20 px-0.5">“{ex.quote.slice(0, 74)}…”</span>
          </p>
        </div>
      ),
    },
    {
      style: { top: "64%", right: "3%" },
      depth: 0.45,
      className: "hidden lg:block",
      node: (
        <div className={`${frag} w-64`}>
          <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-sky">Receipt</p>
          <p className="mono mt-1.5 text-xs text-on-dark">graspchain.receipt/1</p>
          <p className="mono mt-1 truncate text-xs text-on-dark-2">
            {chain}
            {registry ? ` · ${registry.slice(0, 10)}…` : ""}
          </p>
        </div>
      ),
    },
    {
      style: { top: "40%", right: "12%" },
      depth: 0.25,
      className: "hidden 2xl:block",
      node: (
        <div className={`${frag} w-60`}>
          <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-aqua">Rule {rule.id}</p>
          <p className="mt-1.5 text-xs leading-snug text-on-dark-2">{rule.text}</p>
        </div>
      ),
    },
    {
      style: { top: "36%", left: "2%" },
      depth: 0.2,
      className: "hidden 2xl:block",
      node: (
        <div className={`${frag} w-48`}>
          <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-sky">FairClock</p>
          <p className="mt-1.5 text-xs leading-snug text-on-dark-2">Up to {capS} s of delivery delay given back to every reader.</p>
        </div>
      ),
    },
  ];

  return (
    <section data-tilt-host className="on-abyss relative isolate overflow-hidden" aria-labelledby="hero-title">
      {/* one large, quiet wash */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 55% at 50% 38%, rgb(18 112 138 / 0.55), transparent 70%), radial-gradient(40% 40% at 80% 90%, rgb(171 155 203 / 0.16), transparent 70%), radial-gradient(35% 35% at 12% 85%, rgb(174 223 247 / 0.12), transparent 70%)",
        }}
      />
      <ParallaxFragments fragments={fragments} />
      <div className="frame relative flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center py-20 text-center">
        <motion.p {...rise(0)} className="text-2xs font-semibold uppercase tracking-[0.2em] text-aqua">
          Proof of comprehension
        </motion.p>
        <h1 id="hero-title" className="mt-6">
          <PerspectiveText>
            <Depth z={30}>
              <motion.span {...rise(0.05)} className="display block text-[clamp(2.4rem,6.2vw,5rem)] text-on-dark">
                Understanding,
              </motion.span>
            </Depth>
            <Depth z={80}>
              <motion.span {...rise(0.18)} className="block">
                <VideoText
                  text="proven."
                  src="/media/ink-loop.webm"
                  poster="/media/ink-poster.jpg"
                  className="display pb-[0.08em] pr-[0.04em] text-[clamp(5rem,19vw,13.5rem)] leading-[0.9] tracking-[-0.05em]"
                />
              </motion.span>
            </Depth>
          </PerspectiveText>
        </h1>
        <motion.p {...rise(0.42)} className="mt-6 max-w-xl text-md text-on-dark-2 md:text-lg">
          Read a passage, explain it in your own words, and see the evidence behind every point — sealed in a receipt anyone can check.
        </motion.p>
        <motion.div {...rise(0.6)} className="mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-4">
          <ButtonLink href="/login" size="lg" iconAfter="arrow">
            Sign in
          </ButtonLink>
          <Link
            href="/verify"
            className="inline-flex items-center gap-1.5 text-[0.9375rem] font-medium text-aqua underline decoration-aqua/40 underline-offset-4 hover:decoration-aqua"
          >
            Verify a receipt <Icon name="arrow" size={14} />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
