import type { Metadata } from "next";
import Link from "next/link";
import { formatDateTime, type FusionResult } from "@graspchain/shared";
import { EvidenceTrail, IntegrityBanner, IntegrityPanel, IntegrityTag, STATUS_WORD } from "@/components/assessment/Integrity";
import { ScoreBreakdown } from "@/components/assessment/ScoreBreakdown";
import { Notice } from "@/components/ui/Bits";
import { Reveal } from "@/components/ui/Sheet";
import { CHAIN, CLAIM, KP, Mark, TONE_MARK, TONE_WASH, Tag, type Tone } from "@/components/ui/Status";
import { page, requireMe } from "@/lib/api";
import type { QueueItem, Result } from "@/lib/types";
import { OverrideForm } from "./OverrideForm";

export const metadata: Metadata = { title: "Review item" };

interface Detail extends Result {
  studentCode: string;
  article: {
    id: string;
    title: string;
    sentences: string[];
    keyPoints: { id: string; concept: string; statement: string; weight: number; sentenceIdx: number[] }[];
  };
  claims: { claimId: string; text: string; start: number; end: number; source: string }[];
  fused: FusionResult | null;
  judge: {
    kind: string;
    model: string;
    cached: boolean;
    segmentation: string;
    reask: { keys: string[]; stillUncertain: string[] } | null;
    claimStats: { keptFromLlm: number; rejected: number; llmCoverage: number; coverage: number };
    latency: Record<string, number | null>;
    tokens: { jevInput: number; llm: number; costEst: number };
  } | null;
  reviews: { id: string; reviewer: string; reason: string; previousScore: number; newScore: number; createdAt: string }[];
}

const KP_ORDER = ["correct", "vague", "absent", "incorrect"] as const;
const CLAIM_ORDER = ["supported", "partial", "not_in_article", "contradicted"] as const;

/** A distribution as one segmented bar; the chosen label and its probability are printed. */
function Dist({ p, order, map }: { p: Record<string, number>; order: readonly string[]; map: Record<string, { tone: Tone; word: string }> }) {
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-mint" aria-hidden>
      {order.map((k) => (
        <div
          key={k}
          className={`${TONE_MARK[map[k].tone]} border-r border-paper-raised last:border-0`}
          style={{ width: `${(p[k] ?? 0) * 100}%` }}
          title={`${map[k].word} ${Math.round((p[k] ?? 0) * 100)}%`}
        />
      ))}
    </div>
  );
}

/** One item, split: the evidence on the left, the decision and correction on the right. */
export default async function ReviewItem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireMe(["teacher", "admin"], `/teacher/${id}`);
  const [d, q] = await Promise.all([
    page<Detail>(`/api/teacher/attempts/${id}`, `/teacher/${id}`),
    page<{ queue: QueueItem[] }>("/api/teacher/queue").catch(() => ({ queue: [] as QueueItem[] })),
  ]);
  const f = d.fused;
  const claimRes = new Map(f?.claims.map((c) => [c.claimId, c]) ?? []);
  const current = d.record;
  const pos = q.queue.findIndex((i) => i.attemptId === id);
  const next = q.queue.find((i, k) => i.attemptId !== id && (pos < 0 || k > pos)) ?? null;

  // The answer with claim spans marked by label, in the student's lavender voice.
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const c of [...d.claims].sort((a, b) => a.start - b.start)) {
    if (c.start > cursor) parts.push(<span key={`g${cursor}`}>{d.attempt.answer.slice(cursor, c.start)}</span>);
    const res = claimRes.get(c.claimId);
    const spec = res ? CLAIM[res.label] : CLAIM.not_in_article;
    parts.push(
      <span key={c.claimId} className={`${TONE_WASH[spec.tone]} rounded-[4px] px-0.5 [box-decoration-break:clone]`}>
        <sup className="mono mr-0.5 text-[0.625rem] text-ink-3">{c.claimId}</sup>
        {d.attempt.answer.slice(c.start, c.end)}
      </span>,
    );
    cursor = Math.max(cursor, c.end);
  }
  if (cursor < d.attempt.answer.length) parts.push(<span key="tail">{d.attempt.answer.slice(cursor)}</span>);

  return (
    <div className="frame pt-8 md:pt-12">
      <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
        <Link href="/teacher" className="link text-ink-3">
          ← Review queue
        </Link>
        {next ? (
          <Link
            href={`/teacher/${next.attemptId}`}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium text-teal no-underline hover:bg-mint"
          >
            Next in queue · <span className="mono">{next.studentCode}</span> →
          </Link>
        ) : null}
      </div>
      <header className="mt-4">
        <p className="eyebrow">
          <span className="mono normal-case tracking-normal">{d.studentCode}</span> · {d.article.id} · attempt {d.attempt.attemptNo} ·{" "}
          {formatDateTime(d.attempt.createdAt)}
        </p>
        <h1 className="display mt-3 max-w-3xl text-[clamp(1.75rem,3.5vw,2.5rem)]">{d.article.title}</h1>
      </header>

      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-14">
        {/* ── Evidence ── */}
        <div className="min-w-0">
          <section aria-labelledby="ans">
            <h2 id="ans" className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-3">
              The answer · {d.attempt.wordCount} words · claims marked
            </h2>
            <p className="mt-4 rounded-[24px] border-l-[3px] border-lavender bg-lavender/[0.07] px-6 py-6 font-serif text-[1.125rem] leading-[1.85]">{parts}</p>
            {d.judge ? (
              <p className="mt-3 text-xs text-ink-3">
                Segmentation: {d.judge.segmentation}
                {d.judge.segmentation === "llm"
                  ? ` · ${d.judge.claimStats.keptFromLlm} LLM claims kept, ${d.judge.claimStats.rejected} rejected (not exact substrings)`
                  : ""}{" "}
                · coverage {Math.round(d.judge.claimStats.coverage * 100)}%
              </p>
            ) : null}
          </section>

          {f ? (
            <section aria-labelledby="jev" className="mt-12">
              <h2 id="jev" className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-3">
                Judge output · {d.judge?.model}
                {d.judge?.kind === "local" ? " (local demo stand-in, not Jev)" : ""}
                {d.judge?.kind === "evidence" ? " (rule outputs from verified evidence: probabilities are 0 or 1)" : ""}
              </h2>
              <h3 className="mt-6 text-sm font-semibold">Key ideas</h3>
              <ul className="mt-2 divide-y divide-rule rounded-[18px] bg-paper-raised px-5 ring-1 ring-rule">
                {f.keyPoints.map((k) => {
                  const kp = d.article.keyPoints.find((x) => x.id === k.id)!;
                  return (
                    <li key={k.id} className="py-3.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm">
                          <span className="mono mr-2 text-xs text-ink-3">{k.id}</span>
                          {kp.concept}
                        </p>
                        <Mark spec={KP[k.label]} compact label={`${KP[k.label].word} ${Math.round(k.p * 100)}%`} />
                      </div>
                      <div className="mt-2">
                        <Dist p={k.probabilities} order={KP_ORDER} map={KP} />
                      </div>
                      <p className="mt-1 text-xs text-ink-3">
                        confidence <span className="num mono">{k.confidence.toFixed(2)}</span>
                        {k.confidence < 0.6 ? <span className="text-warn"> · below 0.6</span> : null}
                      </p>
                    </li>
                  );
                })}
              </ul>

              <h3 className="mt-8 text-sm font-semibold">Claims</h3>
              <ul className="mt-2 divide-y divide-rule rounded-[18px] bg-paper-raised px-5 ring-1 ring-rule">
                {f.claims.map((c) => (
                  <li key={c.claimId} className="py-3.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="mono text-xs text-ink-3">
                        {c.claimId} → {c.sourceSentence === null ? "none" : `s${c.sourceSentence}`}
                      </span>
                      <Mark spec={CLAIM[c.label]} compact label={`${CLAIM[c.label].word} ${Math.round(c.p * 100)}%`} />
                    </div>
                    <div className="mt-2">
                      <Dist p={c.probabilities} order={CLAIM_ORDER} map={CLAIM} />
                    </div>
                  </li>
                ))}
              </ul>

              <h3 className="mt-8 text-sm font-semibold">Yes/no judgments</h3>
              <dl className="mt-2 grid grid-cols-3 gap-4 rounded-[18px] bg-paper-raised p-5 text-sm ring-1 ring-rule">
                {[
                  ["Central idea stated", f.noul.mainPurpose, f.noul.mainPurpose < 0.3],
                  ["Gibberish", f.noul.gibberish, f.noul.gibberish >= 0.7],
                  ["Instructions to grader", f.noul.containsInstructions, f.noul.containsInstructions >= 0.7],
                ].map(([k, v, bad]) => (
                  <div key={k as string}>
                    <dt className="text-xs text-ink-3">{k as string}</dt>
                    <dd className={`num mono mt-1 text-lg ${bad ? "text-bad" : ""}`}>{(v as number).toFixed(2)}</dd>
                  </div>
                ))}
              </dl>
              {d.judge?.reask ? (
                <p className="mt-4 text-xs text-ink-3">
                  Re-asked once with rephrased instructions: {d.judge.reask.keys.join(", ")}. Still uncertain:{" "}
                  {d.judge.reask.stillUncertain.join(", ") || "none"}.
                </p>
              ) : null}
            </section>
          ) : null}

          <div className="mt-12">
            {d.score ? (
              <Reveal summary="Score construction" meta="formula">
                <ScoreBreakdown score={d.score} />
              </Reveal>
            ) : null}
            {d.feedback ? (
              <Reveal summary="Feedback the student saw" meta={d.feedback.source === "llm" ? "LLM" : "template"}>
                <p className="font-serif text-lg">{d.feedback.feedback.oneLineSummary}</p>
                <p className="mt-1 text-xs text-ink-3">
                  {d.feedback.source === "llm" ? `LLM (${d.feedback.model}), ${d.feedback.dropped} items removed by validators` : "Template feedback"}
                </p>
              </Reveal>
            ) : null}
            {d.score && d.integrity ? (
              <Reveal summary="Assessment conditions" meta={STATUS_WORD[d.integrity.status]}>
                <IntegrityPanel integrity={d.integrity} events={d.integrityEvents ?? []} embedded />
              </Reveal>
            ) : null}
            {d.score?.evidence ? (
              <Reveal summary="Evidence trail" meta={`${d.score.evidence.claims.length} claims`}>
                <EvidenceTrail evidence={d.score.evidence} embedded />
              </Reveal>
            ) : null}
            <div className="border-t border-rule" />
          </div>
        </div>

        {/* ── Decision ── */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[28px] bg-paper-raised p-6 shadow-lift ring-1 ring-rule sm:p-7">
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-3">{d.review ? "Current (corrected)" : "System score"}</p>
            <p className="num display mt-2 text-[4rem] leading-none">{d.score?.finalScore.toFixed(1) ?? "—"}</p>
            {d.review ? <p className="mt-1 text-xs text-ink-3">system said {d.review.previousScore.toFixed(1)}</p> : null}

            {d.score ? (
              <div className="mt-5 flex flex-wrap gap-1.5">
                {d.score.lowConfidence ? (
                  <Tag tone="warn" icon="vague">
                    Uncertain: {d.score.uncertainItems.join(", ")}
                  </Tag>
                ) : null}
                {d.score.flags.injectionSuspected ? (
                  <Tag tone="bad" icon="alert">
                    Contains instructions to the grader
                  </Tag>
                ) : null}
                {d.score.flags.gibberishSuspected ? (
                  <Tag tone="bad" icon="alert">
                    Keyword stuffing / off-topic
                  </Tag>
                ) : null}
                {d.score.flags.mainPurposeMissing ? <Tag tone="warn">Central idea not stated</Tag> : null}
                <IntegrityTag integrity={d.integrity} />
                <Tag tone="none">
                  Paste {d.score.flags.pasteCount}× · left {d.score.flags.blurCount}× · copy {d.score.flags.copyCount}×
                </Tag>
              </div>
            ) : (
              <div className="mt-5">
                <Notice tone="warn" title={`Evaluation ${d.status}`}>
                  {d.error?.message ?? "No score yet."}
                </Notice>
              </div>
            )}
            {d.score ? <IntegrityBanner integrity={d.integrity} /> : null}

            <div className="mt-7 border-t border-rule pt-6">
              <h2 className="font-serif text-lg">Correct the score or decide on integrity</h2>
              {current ? (
                <>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-2">
                    Current record <span className="mono">{current.assessmentId.slice(0, 8)}</span> ·{" "}
                    <Mark spec={CHAIN[current.chainStatus] ?? CHAIN.queued} compact />
                  </p>
                  <OverrideForm
                    assessmentId={current.assessmentId}
                    currentScore={d.score?.finalScore ?? 5}
                    integrityOutcome={d.integrity && !d.integrity.review ? d.integrity.outcome : null}
                  />
                </>
              ) : (
                <p className="mt-2 text-sm text-ink-3">There is no receipt to correct yet.</p>
              )}
            </div>
          </div>

          {d.reviews.length ? (
            <div className="mt-8">
              <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-3">History</h2>
              <ul className="mt-2 divide-y divide-rule">
                {d.reviews.map((r) => (
                  <li key={r.id} className="py-3 text-sm">
                    <span className="mono">{r.reviewer}</span> ·{" "}
                    {r.previousScore === r.newScore ? "integrity decision" : `${r.previousScore.toFixed(1)} → ${r.newScore.toFixed(1)}`} ·{" "}
                    {formatDateTime(r.createdAt)}
                    <p className="mt-1 text-ink-3">“{r.reason}”</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <Link href={`/attempts/${id}`} className="link mt-6 inline-block text-sm text-teal">
            Open the student&rsquo;s result view
          </Link>
        </aside>
      </div>
      <div className="h-16" />
    </div>
  );
}
