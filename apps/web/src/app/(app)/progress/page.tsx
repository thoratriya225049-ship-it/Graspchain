import type { Metadata } from "next";
import Link from "next/link";
import { DIMENSION_COPY, formatDate } from "@graspchain/shared";
import { Fingerprint } from "@/components/charts/Fingerprint";
import { ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Bits";
import { Reveal } from "@/components/ui/Sheet";
import { CHAIN, Mark, Tag } from "@/components/ui/Status";
import { page, requireMe } from "@/lib/api";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Progress" };

const DIMS = ["coverage", "correctness", "reasoning", "ownWords"] as const;
const signed = (v: number, digits = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}`;

/** One trend line, drawn: score over attempts, no grid. Points carry their value as text. */
function Trend({ points }: { points: { x: number; y: number; label: string }[] }) {
  const W = 640;
  const H = 150;
  const px = (i: number) => (points.length === 1 ? W / 2 : 24 + (i * (W - 48)) / (points.length - 1));
  const py = (v: number) => H - 22 - ((v - 1) / 9) * (H - 44);
  const d = points.map((p, i) => `${i ? "L" : "M"} ${px(i)} ${py(p.y)}`).join(" ");
  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Score over ${points.length} attempts: ${points.map((p) => p.y.toFixed(1)).join(", ")}`}
      >
        <defs>
          <linearGradient id="trend" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#AEDFF7" />
            <stop offset="0.4" stopColor="#6ACCC6" />
            <stop offset="0.75" stopColor="#12708A" />
            <stop offset="1" stopColor="#0B3A4A" />
          </linearGradient>
        </defs>
        <path d={d} fill="none" stroke="url(#trend)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={px(i)} cy={py(p.y)} r="5" fill="#F7FCFC" stroke="#12708A" strokeWidth="2" />
            <text x={px(i)} y={py(p.y) - 12} textAnchor="middle" fontSize="13" fill="#0B3A4A" style={{ fontVariantNumeric: "tabular-nums" }}>
              {p.y.toFixed(1)}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

/** S8: one trend line, a quiet attempts timeline, one recommendation. Detail is one click away. */
export default async function ProgressPage() {
  await requireMe(["student"], "/progress");
  const p = await page<Profile>("/api/profile/me", "/progress");
  const timeline = [...p.attempts].reverse();
  return (
    <div className="frame-narrow pt-10 md:pt-14">
      <header>
        <p className="eyebrow">Progress</p>
        <h1 className="display mt-3 text-[clamp(2.25rem,5vw,3.25rem)]">How your understanding is moving</h1>
      </header>

      {p.researchHidden ? (
        <div className="mt-8">
          <Notice tone="warn" title="Research mode is on">
            Scores are hidden until your instructor turns research mode off. Your attempts are listed below.
          </Notice>
        </div>
      ) : null}

      {!p.researchHidden && p.fingerprint.length ? (
        <section className="mt-10" aria-label="Score over attempts">
          <Trend points={p.fingerprint.map((f) => ({ x: f.index, y: f.finalScore, label: f.articleId }))} />
        </section>
      ) : null}

      <section aria-labelledby="next" className="panel mt-10 px-7 py-8 sm:px-9">
        <h2 id="next" className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-3">
          Next
        </h2>
        <p className="mt-3 font-serif text-2xl leading-snug">{p.recommendation.title}</p>
        <p className="mt-2 text-[0.9375rem] text-ink-2">{p.recommendation.reason}</p>
        <ButtonLink href={`/start/${p.recommendation.articleId}`} className="mt-6" iconAfter="arrow">
          Start reading
        </ButtonLink>
      </section>

      <section aria-labelledby="all" className="mt-14">
        <h2 id="all" className="font-serif text-xl">
          Every attempt
        </h2>
        {timeline.length ? (
          <ol className="relative mt-6 pl-8">
            <span aria-hidden className="absolute bottom-3 left-[7px] top-3 w-[2px] rounded-full" style={{ background: "var(--thread)" }} />
            {timeline.map((a) => (
              <li key={a.attemptId} className="relative pb-8 last:pb-0">
                <span className="absolute -left-8 top-1.5 h-4 w-4 rounded-full border-[3px] border-paper bg-teal ring-1 ring-teal/30" aria-hidden />
                <Link href={`/attempts/${a.attemptId}`} className="group block rounded-[16px] px-4 py-3 no-underline transition-colors hover:bg-mint/50">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="min-w-0">
                      <span className="block truncate font-serif text-md text-ink">{a.articleTitle}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-3">
                        <span>{formatDate(a.createdAt)}</span>
                        <span className="mono">{a.articleId}</span>
                        <span>attempt {a.attemptNo}</span>
                        {a.reviewed ? <Tag tone="signal">Teacher-corrected</Tag> : null}
                        {a.lowConfidence ? <Tag tone="warn">Under review</Tag> : null}
                      </span>
                    </span>
                    <span className="num shrink-0 font-serif text-2xl leading-none text-ink">
                      {a.status !== "done" ? (
                        <span className="text-sm text-ink-3">{a.status}</span>
                      ) : a.finalScore === null ? (
                        <span className="text-sm text-ink-3">hidden</span>
                      ) : (
                        a.finalScore.toFixed(1)
                      )}
                    </span>
                  </div>
                  {a.chainStatus ? (
                    <span className="mt-2 inline-flex">
                      <Mark spec={CHAIN[a.chainStatus] ?? CHAIN.queued} compact />
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-5 text-[0.9375rem] text-ink-3">No attempts yet.</p>
        )}
      </section>

      <div className="mt-14">
        {!p.researchHidden && p.fingerprint.length > 1 ? (
          <Reveal summary="The four dimensions over time" meta="coverage, correctness, reasoning, own words">
            <Fingerprint data={p.fingerprint} />
          </Reveal>
        ) : null}
        <Reveal summary="Retries" meta={p.retries.length ? `${p.retries.length}` : "none yet"}>
          {p.retries.length ? (
            <ul className="divide-y divide-rule">
              {p.retries.map((r) => (
                <li key={r.to} className="py-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <Link href={`/attempts/${r.to}`} className="font-serif text-md no-underline hover:underline">
                      {r.articleTitle}
                    </Link>
                    <span className={`num mono text-lg ${r.finalScore >= 0 ? "text-ok" : "text-bad"}`}>{signed(r.finalScore)}</span>
                  </div>
                  <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-3">
                    {DIMS.map((d) => (
                      <span key={d}>
                        {DIMENSION_COPY[d].label} <span className="num mono text-ink">{signed((r.dimensions[d] ?? 0) * 100, 0)}</span>
                      </span>
                    ))}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[0.9375rem] text-ink-3">Retry an article to see how much you improved on it.</p>
          )}
        </Reveal>
        <div className="border-t border-rule" />
      </div>
    </div>
  );
}
