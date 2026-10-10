"use client";

import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { CLAIM, KP, Mark, TONE_TEXT, TONE_WASH } from "@/components/ui/Status";
import type { XRay } from "@/lib/types";

const ORDER = ["correct", "vague", "incorrect", "absent"] as const;

/**
 * PRD §9.3: the article re-rendered sentence by sentence. Key-point sentences carry a tint AND
 * an icon + label; each claim (the student's exact words) links to the sentence the judge
 * matched; contradicted claims become callouts with the correct version.
 */
export function XRayView({ x }: { x: XRay }) {
  const [activeClaim, setActiveClaim] = useState<string | null>(null);
  const [activeKp, setActiveKp] = useState<string | null>(null);
  const refs = useRef(new Map<number, HTMLSpanElement>());

  const kpOf = useMemo(() => {
    const m = new Map<number, XRay["keyPoints"][number]>();
    for (const k of x.keyPoints) for (const i of k.sentenceIdx) if (!m.has(i)) m.set(i, k);
    return m;
  }, [x]);
  const firstOfKp = useMemo(() => new Set(x.keyPoints.map((k) => Math.min(...k.sentenceIdx))), [x]);
  const callouts = useMemo(() => {
    const m = new Map<number, XRay["claims"]>();
    for (const c of x.claims) if (c.label === "contradicted" && c.sourceSentence !== null) m.set(c.sourceSentence, [...(m.get(c.sourceSentence) ?? []), c]);
    return m;
  }, [x]);
  const paragraphs = useMemo(() => {
    const starts = [0, ...x.breaks.filter((b) => b > 0 && b < x.sentences.length)];
    return starts.map((s, i) => Array.from({ length: (starts[i + 1] ?? x.sentences.length) - s }, (_, j) => s + j));
  }, [x]);

  const linked = activeClaim ? (x.claims.find((c) => c.claimId === activeClaim)?.sourceSentence ?? null) : null;
  const kpSentences = activeKp ? new Set(x.keyPoints.find((k) => k.id === activeKp)?.sentenceIdx ?? []) : null;

  function focusSentence(i: number | null) {
    if (i === null) return;
    const el = refs.current.get(i);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 90 || r.bottom > window.innerHeight - 40) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  let order = 0;
  return (
    <div className="mt-10 grid gap-12 border-t border-ink pt-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-16">
      <article aria-label="Article with your understanding marked" className="min-w-0">
        <ul className="mb-8 flex flex-wrap gap-x-6 gap-y-2" aria-label="Legend">
          {ORDER.map((l) => (
            <li key={l} className="flex items-center gap-2 text-xs">
              <span className={`h-3 w-5 ${TONE_WASH[KP[l].tone]}`} aria-hidden />
              <Mark spec={KP[l]} compact />
            </li>
          ))}
          <li className="text-xs text-ink-3">Untinted sentences are context, not key ideas.</li>
        </ul>
        <div className="space-y-6">
          {paragraphs.map((idxs, pi) => (
            <div key={pi}>
              <p className="font-serif text-[1.1875rem] leading-[1.85] md:text-[1.3125rem]">
                {idxs.map((i) => {
                  const kp = kpOf.get(i);
                  const spec = kp ? KP[kp.label] : null;
                  const isLinked = linked === i;
                  const isKp = kpSentences?.has(i);
                  const delay = kp ? order++ * 140 : 0;
                  return (
                    <span key={i}>
                      <span
                        ref={(el) => {
                          if (el) refs.current.set(i, el);
                        }}
                        id={`s${i}`}
                        className={`box-decoration-clone rounded-[2px] px-0.5 transition-[outline-color,box-shadow] duration-200 ${spec ? `${TONE_WASH[spec.tone]} animate-fade` : ""} ${
                          isLinked || isKp ? "shadow-[0_0_0_2px_var(--color-ink)]" : ""
                        }`}
                        style={spec ? { animationDelay: `${delay}ms` } : undefined}
                      >
                        {kp && firstOfKp.has(i) && spec ? (
                          <sup className={`mr-1 select-none font-sans text-[0.625rem] font-semibold not-italic ${TONE_TEXT[spec.tone]}`}>
                            <Icon name={spec.icon} size={10} className="mr-0.5 inline align-[-1px]" />
                            {kp.id}
                            <span className="sr-only">: {spec.word}</span>
                          </sup>
                        ) : null}
                        {x.sentences[i]}
                      </span>{" "}
                    </span>
                  );
                })}
              </p>
              {idxs
                .flatMap((i) => callouts.get(i) ?? [])
                .map((c) => (
                  <aside key={c.claimId} className="mt-4 border-l-2 border-bad-mark bg-bad-wash/60 py-3 pl-4 pr-3 text-sm" aria-label="Misconception">
                    <p className="text-ink-2">
                      <span className="font-semibold text-bad">You wrote · </span>
                      <span className="font-serif italic">“{c.text}”</span>
                    </p>
                    {c.correctVersion ? (
                      <p className="mt-1.5 text-ink-2">
                        <span className="font-semibold text-ok">Correct version · </span>
                        {c.correctVersion}
                      </p>
                    ) : null}
                  </aside>
                ))}
            </div>
          ))}
        </div>
      </article>

      <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
        <section aria-labelledby="kps">
          <h2 id="kps" className="eyebrow">
            Key ideas
          </h2>
          <ul className="mt-3 border-t border-ink">
            {x.keyPoints.map((k) => (
              <li key={k.id} className="border-b border-rule">
                <button
                  type="button"
                  aria-pressed={activeKp === k.id}
                  onMouseEnter={() => setActiveKp(k.id)}
                  onMouseLeave={() => setActiveKp(null)}
                  onFocus={() => setActiveKp(k.id)}
                  onBlur={() => setActiveKp(null)}
                  onClick={() => {
                    setActiveKp(k.id);
                    focusSentence(k.sentenceIdx[0]);
                  }}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 py-3 text-left hover:bg-paper-raised"
                >
                  <span className="text-sm">
                    <span className="mono mr-2 text-xs text-ink-3">{k.id}</span>
                    {k.concept}
                  </span>
                  <Mark spec={KP[k.label]} compact />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="claims" className="mt-10">
          <h2 id="claims" className="eyebrow">
            Your claims · your exact words
          </h2>
          <p className="mt-2 text-xs text-ink-3">Hover or focus a claim to see the sentence it was matched to.</p>
          <ol className="mt-3 border-t border-ink">
            {x.claims.map((c) => (
              <li key={c.claimId} className="border-b border-rule">
                <button
                  type="button"
                  aria-pressed={activeClaim === c.claimId}
                  onMouseEnter={() => setActiveClaim(c.claimId)}
                  onMouseLeave={() => setActiveClaim(null)}
                  onFocus={() => {
                    setActiveClaim(c.claimId);
                    focusSentence(c.sourceSentence);
                  }}
                  onBlur={() => setActiveClaim(null)}
                  onClick={() => {
                    setActiveClaim(c.claimId);
                    focusSentence(c.sourceSentence);
                  }}
                  className={`w-full py-3 text-left transition-colors ${activeClaim === c.claimId ? "bg-paper-raised" : "hover:bg-paper-raised"}`}
                >
                  <p className="font-serif text-[0.9875rem] leading-snug text-ink">“{c.text}”</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Mark spec={CLAIM[c.label]} compact />
                    <span className="mono text-xs text-ink-3">{c.sourceSentence === null ? "no matching sentence" : `→ sentence ${c.sourceSentence + 1}`}</span>
                  </p>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}
