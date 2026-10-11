"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ClaimDecision, EvidenceDecision } from "@graspchain/shared";
import { ChainFlowMini } from "@/components/fx/ChainFlow";
import { TiltCard } from "@/components/fx/TiltCard";
import { useCalm } from "@/components/fx/hooks";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";
import { CLAIM, KP, Mark, type Tone } from "@/components/ui/Status";
import type { XRay } from "@/lib/types";

type Lens = "claims" | "coverage" | "misreadings";
type Claim = XRay["claims"][number];

/** Marks on Abyss: the status hue as a quiet wash and an underline, always with a glyph + word nearby. */
const WASH: Record<Tone, string> = {
  ok: "rgb(47 163 122 / 0.22)",
  warn: "rgb(227 169 58 / 0.2)",
  bad: "rgb(224 100 79 / 0.24)",
  none: "rgb(234 248 247 / 0.08)",
  ink: "transparent",
  signal: "rgb(106 204 198 / 0.2)",
};
const LINE: Record<Tone, string> = { ok: "#2FA37A", warn: "#E3A93A", bad: "#E0644F", none: "#8FB4BB", ink: "#AB9BCB", signal: "#6ACCC6" };
const CLASS_WORD: Record<string, string> = {
  UNDERSTOOD: "Understood",
  PARTIALLY_UNDERSTOOD: "Partly understood",
  MISUNDERSTOOD: "Misunderstood",
  MISSED: "Missed",
  UNSUPPORTED: "Unsupported",
};

/**
 * X-Ray (PRD §9.3), on Abyss. Source passage left (teal family), the student's answer right
 * (lavender family), both cut into claims. Hover or focus a claim and a thread draws to the
 * sentence it was matched to, blending Lavender into Teal. Lenses: Claims / Coverage /
 * Misreadings. Selecting a claim opens the Evidence Inspector. Phones: stacked, with inline
 * expansion instead of threads. The default state is calm; richness appears as you explore.
 */
export function XRayView({ x, evidence }: { x: XRay; evidence: EvidenceDecision | null }) {
  const { coarse } = useCalm();
  const gid = useId().replace(/:/g, "");
  const [lens, setLens] = useState<Lens>("claims");
  const [hot, setHot] = useState<string | null>(null);
  const [inspect, setInspect] = useState<Claim | null>(null);
  const [kpHot, setKpHot] = useState<string | null>(null);
  const [openMobile, setOpenMobile] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const claimEls = useRef(new Map<string, HTMLElement>());
  const sentEls = useRef(new Map<number, HTMLElement>());
  const [thread, setThread] = useState<{ d: string; x1: number; x2: number; key: string } | null>(null);

  const evById = useMemo(() => new Map<string, ClaimDecision>((evidence?.claims ?? []).map((c) => [c.claimId, c])), [evidence]);
  const kpOf = useMemo(() => {
    const m = new Map<number, XRay["keyPoints"][number]>();
    for (const k of x.keyPoints) for (const i of k.sentenceIdx) if (!m.has(i)) m.set(i, k);
    return m;
  }, [x]);
  const firstOfKp = useMemo(() => new Set(x.keyPoints.map((k) => Math.min(...k.sentenceIdx))), [x]);
  const linkedSentences = useMemo(() => new Set(x.claims.flatMap((c) => (c.sourceSentence === null ? [] : [c.sourceSentence]))), [x]);
  const contradicted = useMemo(() => x.claims.filter((c) => c.label === "contradicted"), [x]);
  const paragraphs = useMemo(() => {
    const starts = [0, ...x.breaks.filter((b) => b > 0 && b < x.sentences.length)];
    return starts.map((s, i) => Array.from({ length: (starts[i + 1] ?? x.sentences.length) - s }, (_, j) => s + j));
  }, [x]);
  const answerParts = useMemo(() => {
    const parts: ({ kind: "text"; text: string; key: string } | { kind: "claim"; c: Claim })[] = [];
    let cursor = 0;
    for (const c of [...x.claims].sort((a, b) => a.start - b.start)) {
      if (c.start > cursor) parts.push({ kind: "text", text: x.answer.slice(cursor, c.start), key: `t${cursor}` });
      parts.push({ kind: "claim", c });
      cursor = Math.max(cursor, c.end);
    }
    if (cursor < x.answer.length) parts.push({ kind: "text", text: x.answer.slice(cursor), key: "tail" });
    return parts;
  }, [x]);

  const active = hot ? (x.claims.find((c) => c.claimId === hot) ?? null) : null;
  const linked = active?.sourceSentence ?? null;
  const kpSentences = kpHot ? new Set(x.keyPoints.find((k) => k.id === kpHot)?.sentenceIdx ?? []) : null;

  // Draw the thread from the claim (right) to its sentence (left).
  const measure = useCallback(() => {
    if (!active || linked === null || coarse || !wrap.current || window.innerWidth < 1024) return setThread(null);
    const W = wrap.current.getBoundingClientRect();
    const ce = claimEls.current.get(active.claimId);
    const se = sentEls.current.get(linked);
    if (!ce || !se) return setThread(null);
    const c = ce.getClientRects()[0] ?? ce.getBoundingClientRect();
    const rects = Array.from(se.getClientRects());
    const cy = c.top + c.height / 2;
    const s = rects.reduce(
      (best, r) => (Math.abs(r.top + r.height / 2 - cy) < Math.abs(best.top + best.height / 2 - cy) ? r : best),
      rects[0] ?? se.getBoundingClientRect(),
    );
    const x1 = c.left - W.left - 6;
    const y1 = cy - W.top;
    const x2 = s.right - W.left + 6;
    const y2 = s.top + s.height / 2 - W.top;
    const dx = Math.max(40, (x1 - x2) * 0.45);
    setThread({ d: `M ${x1} ${y1} C ${x1 - dx} ${y1}, ${x2 + dx} ${y2}, ${x2} ${y2}`, x1, x2, key: `${active.claimId}-${linked}` });
  }, [active, linked, coarse]);

  useLayoutEffect(() => measure(), [measure, lens]);
  useEffect(() => {
    if (!active) return;
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [active, measure]);

  function revealSentence(i: number | null) {
    if (i === null) return;
    const el = sentEls.current.get(i);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 90 || r.bottom > window.innerHeight - 40) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const claimTone = (c: Claim): Tone => CLAIM[c.label]?.tone ?? "none";
  const dimClaim = (c: Claim) => (lens === "misreadings" && c.label !== "contradicted") || (hot !== null && hot !== c.claimId);

  function sentenceStyle(i: number): React.CSSProperties {
    const kp = kpOf.get(i);
    const isLinked = linked === i || kpSentences?.has(i);
    if (isLinked) return { background: "rgb(106 204 198 / 0.28)", boxShadow: "0 0 0 1px rgb(106 204 198 / 0.55)", color: "#FFFFFF" };
    if (lens === "coverage") {
      if (kp) return { background: WASH[KP[kp.label].tone], opacity: 1 };
      return { opacity: linkedSentences.has(i) ? 1 : 0.38 };
    }
    if (lens === "misreadings") {
      if (contradicted.some((c) => c.sourceSentence === i)) return { background: WASH.bad };
      return { opacity: 0.55 };
    }
    return {};
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Segmented
          tone="dark"
          label="Lens"
          value={lens}
          onChange={(v) => {
            setLens(v);
            setHot(null);
          }}
          options={[
            { value: "claims", label: "Claims", hint: "Your claims and where they came from" },
            { value: "coverage", label: "Coverage", hint: "Which parts of the source you used" },
            { value: "misreadings", label: "Misreadings", hint: "What contradicts the source" },
          ]}
        />
        <p className="text-xs text-on-dark-2">
          {lens === "claims"
            ? coarse
              ? "Tap a claim to see its source."
              : "Hover or focus a claim to see where it came from. Select it to inspect."
            : lens === "coverage"
              ? "Faded text was not used. Key ideas are tinted by how well you explained them."
              : contradicted.length
                ? `${contradicted.length} claim${contradicted.length > 1 ? "s" : ""} contradict the source.`
                : "Nothing you wrote contradicts the source."}
        </p>
      </div>

      {lens === "coverage" ? (
        <ul className="mt-6 flex flex-wrap gap-2" aria-label="Key ideas">
          {x.keyPoints.map((k) => (
            <li key={k.id}>
              <button
                type="button"
                onMouseEnter={() => setKpHot(k.id)}
                onMouseLeave={() => setKpHot(null)}
                onFocus={() => setKpHot(k.id)}
                onBlur={() => setKpHot(null)}
                onClick={() => revealSentence(k.sentenceIdx[0])}
                className="inline-flex items-center gap-2 rounded-full bg-white/6 py-1.5 pl-3 pr-3.5 text-left text-sm text-on-dark ring-1 ring-white/10 hover:bg-white/10"
              >
                <Mark spec={KP[k.label]} compact label="" />
                <span>{k.concept}</span>
                <span className="sr-only">: {KP[k.label].word}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div ref={wrap} className="relative mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-14">
        {/* the thread */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 z-10 hidden h-full w-full overflow-visible lg:block">
          <defs>
            {thread ? (
              <linearGradient id={`th-${gid}`} gradientUnits="userSpaceOnUse" x1={thread.x1} y1="0" x2={thread.x2} y2="0">
                <stop offset="0" stopColor="#AB9BCB" />
                <stop offset="0.5" stopColor="#B0BCE3" />
                <stop offset="1" stopColor="#6ACCC6" />
              </linearGradient>
            ) : null}
          </defs>
          <AnimatePresence>
            {thread ? (
              <motion.g key={thread.key} initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
                <motion.path
                  d={thread.d}
                  fill="none"
                  stroke={`url(#th-${gid})`}
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.35, ease: [0.22, 0.8, 0.2, 1] }}
                />
                <motion.circle
                  r="3.5"
                  fill="#6ACCC6"
                  cx={thread.x2}
                  cy={Number(thread.d.split(" ").at(-1))}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.3, duration: 0.2 }}
                />
              </motion.g>
            ) : null}
          </AnimatePresence>
        </svg>

        {/* ── Source (teal family) ── */}
        <TiltCard max={hot || coarse ? 0 : 2} className="min-w-0">
          <article
            aria-label="Source passage"
            style={{ background: "linear-gradient(180deg, rgb(18 112 138 / 0.22), rgb(18 112 138 / 0.08))" }}
            className="rounded-[28px] p-6 ring-1 ring-aqua/25 sm:p-8"
          >
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-aqua">Source</p>
            <div className="mt-4 space-y-5">
              {paragraphs.map((idxs, pi) => (
                <div key={pi}>
                  <p className="font-serif text-[1.125rem] leading-[1.85] text-on-dark-2 md:text-[1.1875rem]">
                    {idxs.map((i) => {
                      const kp = kpOf.get(i);
                      return (
                        <span key={i}>
                          <span
                            ref={(el) => {
                              if (el) sentEls.current.set(i, el);
                            }}
                            id={`s${i}`}
                            className="box-decoration-clone rounded-[4px] px-0.5 transition-[background-color,opacity,color,box-shadow] duration-300"
                            style={sentenceStyle(i)}
                          >
                            {lens === "coverage" && kp && firstOfKp.has(i) ? (
                              <sup className="mr-1 select-none font-sans text-[0.625rem] font-semibold not-italic" style={{ color: LINE[KP[kp.label].tone] }}>
                                <Icon name={KP[kp.label].icon} size={10} className="mr-0.5 inline align-[-1px]" />
                                {KP[kp.label].word}
                              </sup>
                            ) : null}
                            <span className={linked === i ? "text-white" : "text-on-dark"}>{x.sentences[i]}</span>
                          </span>{" "}
                        </span>
                      );
                    })}
                  </p>
                  {lens === "misreadings"
                    ? idxs
                        .flatMap((i) => contradicted.filter((c) => c.sourceSentence === i))
                        .map((c) => (
                          <aside key={c.claimId} className="mt-3 rounded-[14px] bg-bad-mark/12 p-4 text-sm ring-1 ring-bad-mark/30" aria-label="Misreading">
                            <p className="text-on-dark-2">
                              <span className="font-semibold text-bad-glow">You wrote · </span>
                              <span className="font-serif italic text-on-dark">“{c.text}”</span>
                            </p>
                            {c.correctVersion ? (
                              <p className="mt-1.5 text-on-dark-2">
                                <span className="font-semibold text-ok-glow">The source says · </span>
                                {c.correctVersion}
                              </p>
                            ) : null}
                          </aside>
                        ))
                    : null}
                </div>
              ))}
            </div>
          </article>
        </TiltCard>

        {/* ── Answer (lavender family) ── */}
        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <TiltCard max={hot || coarse ? 0 : 2}>
            <section
              aria-label="Your answer, cut into claims"
              className="rounded-[28px] p-6 ring-1 ring-lavender/30 sm:p-8"
              style={{ background: "linear-gradient(180deg, rgb(171 155 203 / 0.16), rgb(176 188 227 / 0.06))" }}
            >
              <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-lavender">Your answer</p>
              {/* wide: the answer as written, claims inline */}
              <p className="mt-4 hidden font-serif text-[1.0625rem] leading-[1.9] text-on-dark-2 lg:block">
                {answerParts.map((p) =>
                  p.kind === "text" ? (
                    <span key={p.key}>{p.text}</span>
                  ) : (
                    <span
                      key={p.c.claimId}
                      ref={(el) => {
                        if (el) claimEls.current.set(p.c.claimId, el);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setHot(p.c.claimId);
                          setInspect(p.c);
                        }
                      }}
                      onMouseEnter={() => setHot(p.c.claimId)}
                      onMouseLeave={() => setHot((h) => (h === p.c.claimId && !inspect ? null : h))}
                      onFocus={() => {
                        setHot(p.c.claimId);
                        revealSentence(p.c.sourceSentence);
                      }}
                      onBlur={() => setHot((h) => (h === p.c.claimId && !inspect ? null : h))}
                      onClick={() => {
                        setHot(p.c.claimId);
                        setInspect(p.c);
                      }}
                      aria-label={`Claim: ${p.c.text}. ${CLAIM[p.c.label].word}. ${p.c.sourceSentence === null ? "No matching sentence." : `Matched to sentence ${p.c.sourceSentence + 1}.`} Open the evidence inspector.`}
                      className="cursor-pointer rounded-[4px] px-0.5 font-serif text-on-dark transition-[background-color,opacity] duration-300 [box-decoration-break:clone] [-webkit-box-decoration-break:clone]"
                      style={{
                        background:
                          hot === p.c.claimId ? "rgb(171 155 203 / 0.34)" : lens === "misreadings" && p.c.label === "contradicted" ? WASH.bad : "transparent",
                        textDecoration: "underline",
                        textDecorationColor: lens === "claims" && hot !== p.c.claimId ? "#AB9BCB" : LINE[claimTone(p.c)],
                        textDecorationThickness: "2px",
                        textUnderlineOffset: "5px",
                        opacity: dimClaim(p.c) ? 0.45 : 1,
                      }}
                    >
                      {p.c.text}
                      <span aria-hidden className="ml-1 inline-flex translate-y-[-0.35em] align-baseline" style={{ color: LINE[claimTone(p.c)] }}>
                        <Icon name={CLAIM[p.c.label].icon} size={10} />
                      </span>
                    </span>
                  ),
                )}
              </p>
              {/* phones: one claim per row, inline expansion */}
              <ol className="mt-4 space-y-2 lg:hidden">
                {x.claims.map((c) => {
                  const open = openMobile === c.claimId;
                  return (
                    <li key={c.claimId} className="rounded-[16px] bg-white/5 ring-1 ring-white/10">
                      <button type="button" aria-expanded={open} onClick={() => setOpenMobile(open ? null : c.claimId)} className="w-full p-4 text-left">
                        <p className="font-serif text-[1.0625rem] leading-snug text-on-dark">“{c.text}”</p>
                        <span className="mt-2 inline-flex">
                          <Mark spec={CLAIM[c.label]} compact />
                        </span>
                      </button>
                      <AnimatePresence initial={false}>
                        {open ? (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-white/10 px-4 pb-4 pt-3 text-sm">
                              {c.sourceSentence !== null ? (
                                <p className="rounded-[10px] bg-aqua/15 p-3 font-serif text-on-dark">
                                  <span className="mb-1 block font-sans text-2xs font-semibold uppercase tracking-[0.14em] text-aqua">
                                    Source · sentence {c.sourceSentence + 1}
                                  </span>
                                  {x.sentences[c.sourceSentence]}
                                </p>
                              ) : (
                                <p className="text-on-dark-2">No sentence in the source matches this claim.</p>
                              )}
                              <button type="button" onClick={() => setInspect(c)} className="mt-3 inline-flex items-center gap-1 font-medium text-aqua">
                                Inspect the evidence <Icon name="arrow" size={13} />
                              </button>
                            </div>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </li>
                  );
                })}
              </ol>
              {x.copied?.length ? (
                <p className="mt-5 text-xs text-on-dark-2">
                  {x.copied.length} passage{x.copied.length > 1 ? "s" : ""} copied word for word from the source {x.copied.length > 1 ? "were" : "was"} not
                  judged.
                </p>
              ) : null}
            </section>
          </TiltCard>
          <ChainFlowMini
            tone="dark"
            className="mt-6"
            current="evidence"
            items={[
              { key: "source", value: `${x.sentences.length} sentences` },
              { key: "claim", value: x.claims.length },
              { key: "evidence", value: `${x.claims.filter((c) => c.sourceSentence !== null).length} matched` },
              { key: "decision", value: `${x.keyPoints.filter((k) => k.label === "correct").length}/${x.keyPoints.length} ideas` },
            ]}
          />
        </div>
      </div>

      <Sheet
        open={!!inspect}
        onClose={() => {
          setInspect(null);
          setHot(null);
        }}
        title="Evidence inspector"
        description={inspect ? `Claim ${inspect.claimId}` : undefined}
        tone="dark"
        wide
      >
        {inspect ? <Inspector c={inspect} x={x} ev={evById.get(inspect.claimId) ?? null} /> : null}
      </Sheet>
    </div>
  );
}

function Inspector({ c, x, ev }: { c: Claim; x: XRay; ev: ClaimDecision | null }) {
  const spec = CLAIM[c.label];
  const quotes = ev?.evidence ?? (c.sourceSentence !== null ? [{ sentence: c.sourceSentence, quote: x.sentences[c.sourceSentence] }] : []);
  const rows: { k: string; v: React.ReactNode }[] = [
    {
      k: "Claim",
      v: (
        <p className="rounded-[14px] bg-lavender/18 p-4 font-serif text-[1.0625rem] leading-relaxed text-on-dark">
          <span className="mb-1 block font-sans text-2xs font-semibold uppercase tracking-[0.14em] text-lavender">Your words</span>“{c.text}”
        </p>
      ),
    },
    {
      k: "Matched evidence",
      v: quotes.length ? (
        <ul className="space-y-2">
          {quotes.map((q) => (
            <li
              key={`${q.sentence}-${q.quote.slice(0, 12)}`}
              className="rounded-[14px] bg-aqua/14 p-4 font-serif text-[1.0625rem] leading-relaxed text-on-dark"
            >
              <span className="mb-1 block font-sans text-2xs font-semibold uppercase tracking-[0.14em] text-aqua">Source · sentence {q.sentence + 1}</span>“
              {q.quote}”
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-on-dark-2">No sentence in the source supports or contradicts this claim.</p>
      ),
    },
    {
      k: "Reasoning",
      v: (
        <div className="space-y-1.5 text-sm text-on-dark">
          {c.why ? <p>{c.why}</p> : null}
          {ev?.note ? <p className="text-on-dark-2">Extractor: {ev.note}</p> : null}
          {ev?.reasons.map((r) => (
            <p key={r} className="text-warn">
              {r}
            </p>
          ))}
          {c.correctVersion ? (
            <p>
              <span className="font-semibold text-ok-glow">The source says · </span>
              {c.correctVersion}
            </p>
          ) : null}
          {!c.why && !ev?.note && !c.correctVersion ? <p className="text-on-dark-2">The judge gave no further reasoning for this claim.</p> : null}
        </div>
      ),
    },
    {
      k: "Confidence",
      v: (
        <div className="flex items-center gap-3">
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/10" aria-hidden>
            <div className="h-full rounded-full bg-aqua" style={{ width: `${Math.round(c.p * 100)}%` }} />
          </div>
          <span className="num mono text-sm text-on-dark">{Math.round(c.p * 100)}%</span>
          {ev ? <span className="text-xs text-on-dark-2">verified evidence → rule outcome (0 or 100)</span> : null}
        </div>
      ),
    },
    {
      k: "Decision",
      v: (
        <div className="flex flex-wrap items-center gap-3">
          <Mark spec={spec} />
          {ev ? (
            <span className="text-sm text-on-dark-2">
              {CLASS_WORD[ev.classification]} · <span className="mono text-xs">{ev.rule}</span> · relation {ev.relation.replace(/_/g, " ").toLowerCase()}
            </span>
          ) : null}
        </div>
      ),
    },
  ];
  return (
    <dl className="space-y-7">
      {rows.map((r) => (
        <div key={r.k}>
          <dt className="mb-2 text-2xs font-semibold uppercase tracking-[0.14em] text-on-dark-2">{r.k}</dt>
          <dd>{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}
