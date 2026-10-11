"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { sha256Hex } from "@graspchain/shared";
import { Icon } from "../ui/Icon";
import { DecryptText } from "./DecryptText";
import { useCalm, useSeenOnce } from "./hooks";

/** Stage colours of the chain, used everywhere the chain appears. */
export const FLOW = {
  source: { label: "Source", color: "#AEDFF7", ink: "#0B3A4A" },
  claim: { label: "Claim", color: "#AB9BCB", ink: "#0B3A4A" },
  evidence: { label: "Evidence", color: "#6ACCC6", ink: "#0B3A4A" },
  decision: { label: "Decision", color: "#12708A", ink: "#FFFFFF" },
  proof: { label: "Proof", color: "#0B3A4A", ink: "#EAF8F7" },
} as const;
export type FlowKey = keyof typeof FLOW;

export interface StoryExample {
  articleId: string;
  claim: string;
  sentenceNo: number;
  quote: string;
  verdict: string;
  rule: string;
  chainName: string;
}

const STEP_MS = 1500;

/**
 * Signed-out home: one claim followed to its proof, about six seconds, replayable.
 * A Lavender claim travels to its Aqua evidence, becomes a Teal verdict and is sealed into an
 * Abyss receipt. The hash on the slip is a real SHA-256 of the example, computed in the browser.
 */
export function ChainFlowStory({ ex, tone = "dark" }: { ex: StoryExample; tone?: "dark" | "light" }) {
  const { still } = useCalm();
  // Light tone sits on Sky/Paper: ink text, labels in deep ink, the thread ending in Abyss instead of near-white.
  const light = tone === "light";
  const text = light ? "text-ink" : "text-on-dark";
  const text2 = light ? "text-ink-2" : "text-on-dark-2";
  const end = light ? "#0B3A4A" : "#EAF8F7";
  const [ref, seen] = useSeenOnce<HTMLDivElement>(0.45);
  const [step, setStep] = useState(still ? 4 : 0);
  const [run, setRun] = useState(0);
  const [hash, setHash] = useState("");

  useEffect(() => {
    void sha256Hex(JSON.stringify({ article: ex.articleId, claim: ex.claim, evidence: ex.quote, verdict: ex.verdict })).then(setHash);
  }, [ex]);

  useEffect(() => {
    if (still) return setStep(4);
    if (!seen) return;
    setStep(0);
    const ts = [1, 2, 3, 4].map((n) => window.setTimeout(() => setStep(n), n * STEP_MS - 900));
    return () => ts.forEach(window.clearTimeout);
  }, [seen, run, still]);

  const stations: { key: FlowKey; title: string; body: React.ReactNode }[] = [
    {
      key: "claim",
      title: "A claim, in the student's words",
      body: <p className={`font-serif text-[1.0625rem] leading-snug ${text}`}>“{ex.claim}”</p>,
    },
    {
      key: "evidence",
      title: `Evidence · sentence ${ex.sentenceNo}`,
      body: <p className={`font-serif text-[1.0625rem] leading-snug ${text}`}>“{ex.quote}”</p>,
    },
    {
      key: "decision",
      title: "Decision · rules, not opinion",
      body: (
        <p className={`flex items-center gap-2 ${text}`}>
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ok-mark text-white">
            <Icon name="check" size={14} />
          </span>
          <span className="text-lg font-medium">{ex.verdict}</span>
          <span className={`mono text-xs ${text2}`}>{ex.rule}</span>
        </p>
      ),
    },
    {
      key: "proof",
      title: "Proof · sealed on-chain",
      body: (
        <div className="space-y-1">
          <p className={`text-xs ${text2}`}>SHA-256 of this example</p>
          <DecryptText
            value={hash ? `${hash.slice(0, 20)}…` : "…"}
            start={step >= 4 && !!hash}
            className={`block text-sm ${light ? "text-teal" : "text-aqua"}`}
          />
          <p className={`text-xs ${text2}`}>{ex.chainName} · salted, no names</p>
        </div>
      ),
    },
  ];

  return (
    <div ref={ref}>
      <div className="relative">
        {/* the thread */}
        <div
          aria-hidden
          className={`absolute left-[11px] top-3 bottom-3 w-px ${light ? "bg-abyss/15" : "bg-white/12"} md:left-0 md:right-0 md:top-[11px] md:bottom-auto md:h-px md:w-auto`}
        />
        <motion.div
          aria-hidden
          className="absolute left-[11px] top-3 w-px md:hidden"
          style={{ background: `linear-gradient(180deg, #AB9BCB, #6ACCC6 40%, #12708A 72%, ${end})` }}
          initial={false}
          animate={{ height: `${(Math.max(0, step - 1) / 3) * 88}%` }}
          transition={{ duration: 1, ease: [0.22, 0.8, 0.2, 1] }}
        />
        <motion.div
          aria-hidden
          className="absolute left-0 top-[11px] hidden h-px md:block"
          style={{ background: `linear-gradient(90deg, #AB9BCB, #6ACCC6 40%, #12708A 72%, ${end})` }}
          initial={false}
          animate={{ width: `${(Math.max(0, step - 1) / 3) * 76.5}%` }}
          transition={{ duration: 1, ease: [0.22, 0.8, 0.2, 1] }}
        />
        <ol className="grid gap-8 md:grid-cols-4 md:gap-6">
          {stations.map((s, k) => {
            const on = step > k || (k === 0 && step >= 0 && seen) || still;
            const lit = step >= k + 1 || still;
            return (
              <li key={s.key} className="relative pl-10 md:pl-0 md:pt-10">
                <span aria-hidden className="absolute left-0 top-0 flex h-[23px] w-[23px] items-center justify-center rounded-full md:left-0">
                  <motion.span
                    className="absolute inset-0 rounded-full border"
                    style={{ borderColor: s.key === "proof" ? (light ? "#0B3A4A" : "#6ACCC6") : FLOW[s.key].color }}
                    animate={{ scale: lit ? 1 : 0.7, opacity: lit ? 1 : 0.4 }}
                    transition={{ duration: 0.4 }}
                  />
                  <motion.span
                    className="h-[11px] w-[11px] rounded-full"
                    style={{ background: s.key === "proof" ? end : FLOW[s.key].color }}
                    animate={{ scale: lit ? 1 : 0, opacity: lit ? 1 : 0 }}
                    transition={{ duration: 0.45, ease: [0.22, 0.8, 0.2, 1] }}
                  />
                </span>
                <motion.div
                  initial={false}
                  animate={{ opacity: on || lit ? 1 : 0.45, y: lit ? 0 : 6 }}
                  transition={{ duration: 0.5, ease: [0.22, 0.8, 0.2, 1] }}
                  className="rounded-[18px] p-4 ring-1"
                  style={{
                    background: light
                      ? `color-mix(in srgb, ${s.key === "proof" ? "#0B3A4A" : FLOW[s.key].color} ${s.key === "proof" ? 5 : 12}%, rgb(255 255 255 / 0.62))`
                      : s.key === "proof"
                        ? "rgb(234 248 247 / 0.04)"
                        : `color-mix(in srgb, ${FLOW[s.key].color} 12%, transparent)`,
                    // ring colour follows the stage
                    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${s.key === "proof" ? (light ? "#0B3A4A" : "#6ACCC6") : FLOW[s.key].color} ${light ? 30 : 40}%, transparent)`,
                  }}
                >
                  <p
                    className="text-2xs font-semibold uppercase tracking-[0.14em]"
                    style={{ color: light ? "#3F6672" : s.key === "decision" ? "#6ACCC6" : s.key === "proof" ? "#AEDFF7" : FLOW[s.key].color }}
                  >
                    {s.title}
                  </p>
                  <div className="mt-3">{s.body}</div>
                </motion.div>
              </li>
            );
          })}
        </ol>
        {/* the travelling token */}
        <AnimatePresence>
          {!still && seen && step < 4 ? (
            <motion.span
              key={run}
              aria-hidden
              className="absolute left-[6px] top-[6px] hidden h-3 w-3 rounded-full md:block"
              initial={{ left: "0%", background: "#AB9BCB" }}
              animate={{ left: ["0%", "25.5%", "51%", "76.5%"], background: ["#AB9BCB", "#6ACCC6", "#12708A", end] }}
              exit={{ opacity: 0 }}
              transition={{ duration: (STEP_MS * 3) / 1000 + 0.6, ease: [0.45, 0, 0.25, 1], times: [0, 0.34, 0.67, 1] }}
            />
          ) : null}
        </AnimatePresence>
      </div>
      <div className={`mt-8 flex flex-wrap items-center justify-between gap-4 text-xs ${text2}`}>
        <p>
          Example from article <span className="mono">{ex.articleId}</span> and its prepared demo answer.
        </p>
        {!still ? (
          <button
            type="button"
            onClick={() => setRun((n) => n + 1)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ring-1 transition-colors ${light ? "text-ink ring-abyss/20 hover:bg-white/70" : "text-on-dark ring-white/15 hover:bg-white/5"}`}
          >
            <Icon name="replay" size={14} /> Replay
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The chain in one line, in the same stage colours: used on Result, X-Ray and Receipt. */
export function ChainFlowMini({
  items,
  current,
  tone = "light",
  className = "",
}: {
  items: { key: FlowKey; value: React.ReactNode }[];
  current?: FlowKey;
  tone?: "light" | "dark";
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <ol aria-label="How this result was made" className={`flex flex-wrap items-stretch gap-y-3 ${className}`}>
      {items.map((it, k) => {
        const f = FLOW[it.key];
        const on = current === it.key;
        const dot = it.key === "proof" && dark ? "#6ACCC6" : f.color;
        return (
          <li key={it.key} className="flex items-center">
            <div
              className={`rounded-full py-1 pl-1.5 pr-3 ${on ? (dark ? "bg-white/8 ring-1 ring-white/15" : "bg-paper-raised ring-1 ring-rule") : ""}`}
              aria-current={on ? "step" : undefined}
            >
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: dot }} aria-hidden />
                <span className={`text-2xs font-semibold uppercase tracking-[0.12em] ${dark ? "text-on-dark-2" : "text-ink-3"}`}>{f.label}</span>
                <span className={`text-xs ${dark ? "text-on-dark" : "text-ink"}`}>{it.value}</span>
              </span>
            </div>
            {k < items.length - 1 ? (
              <span
                aria-hidden
                className="mx-1.5 h-px w-4 sm:w-6"
                style={{ background: `linear-gradient(90deg, ${dot}, ${items[k + 1].key === "proof" && dark ? "#6ACCC6" : FLOW[items[k + 1].key].color})` }}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
