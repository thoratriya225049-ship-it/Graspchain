"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DIMENSION_COPY, countsTowardProgress, createSseParser, formatDateTime, type Feedback, type FeedbackRecord, type Stage } from "@graspchain/shared";
import { ComprehensionReport } from "@/components/assessment/Comprehension";
import { EvidenceTrail, IntegrityPanel, IntegrityTag, STATUS_WORD } from "@/components/assessment/Integrity";
import { ScoreBreakdown } from "@/components/assessment/ScoreBreakdown";
import { ScoreScale } from "@/components/assessment/ScoreScale";
import { ChainFlowMini } from "@/components/fx/ChainFlow";
import { JourneySteps, JourneyThread } from "@/components/fx/JourneyThread";
import { RollingNumber } from "@/components/fx/RollingNumber";
import { ButtonLink } from "@/components/ui/Button";
import { Meter, Notice } from "@/components/ui/Bits";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Sheet";
import { CHAIN } from "@/components/ui/Status";
import { call } from "@/lib/http";
import type { Recommendation, Result, Role, ScorePayload } from "@/lib/types";

const STAGES: { id: Stage; label: string }[] = [
  { id: "segmenting", label: "Splitting your answer into claims" },
  { id: "judging", label: "Matching every claim to the source" },
  { id: "scoring", label: "Computing the score" },
  { id: "explaining", label: "Writing feedback" },
  { id: "recording", label: "Creating your receipt" },
];
const STUDENT_DIMS = ["coverage", "correctness", "reasoning", "ownWords"] as const;
const BAND_MEANING: Record<string, string> = {
  Surface: "Little of the article is explained yet, or there are clear errors.",
  Partial: "Some ideas are explained, with gaps or errors.",
  Functional: "Mostly accurate; some ideas or links between them are missing.",
  Deep: "The key ideas and how they connect are explained.",
  Expert: "Complete, precise and in your own words.",
};

export function ResultView({
  initial,
  viewer,
  recommendation,
}: {
  initial: Result;
  viewer: Role;
  recommendation: Recommendation | null;
  verifierUrl: string;
  publicWebUrl: string;
  explorerUrl: string | null;
}) {
  const id = initial.attemptId;
  const [r, setR] = useState<Result>(initial);
  const [stage, setStage] = useState<Stage | null>(null);
  const [partial, setPartial] = useState<Partial<Feedback> | null>(null);
  const [mode, setMode] = useState<"stream" | "poll" | "idle">(initial.status === "done" || initial.status === "failed" ? "idle" : "stream");

  const refresh = useCallback(async () => {
    const res = await call<Result>(`/api/result/${id}`);
    if (res.ok) setR(res.data);
    return res.ok ? res.data : null;
  }, [id]);

  // Live: SSE re-attach; if nothing arrives within 3 s, or the stream breaks, poll every second.
  useEffect(() => {
    if (mode !== "stream") return;
    const ac = new AbortController();
    let last = Date.now();
    let finished = false;
    const watchdog = window.setInterval(() => {
      if (!finished && Date.now() - last > 3000) {
        ac.abort();
        setMode("poll");
      }
    }, 500);
    (async () => {
      try {
        const res = await fetch(`/api/result/${id}/stream`, { headers: { accept: "text/event-stream" }, signal: ac.signal, cache: "no-store" });
        if (!res.ok || !res.body) throw new Error("stream");
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        const feed = createSseParser((type, data) => {
          last = Date.now();
          const d = data as Record<string, unknown>;
          if (type === "stage") setStage(d.stage as Stage);
          else if (type === "score") setR((p) => ({ ...p, status: "scored", score: d as unknown as ScorePayload }));
          else if (type === "hidden") setR((p) => ({ ...p, status: "scored", researchHidden: true }));
          else if (type === "feedback") {
            if ("final" in d) setR((p) => ({ ...p, feedback: d.final as FeedbackRecord }));
            else setPartial(d.partial as Partial<Feedback>);
          } else if (type === "xray") setR((p) => ({ ...p, xrayReady: true }));
          else if (type === "record")
            setR((p) => ({ ...p, record: { ...(d as { assessmentId: string; recordHash: string; chainStatus: string }), ethTx: null, blockNumber: null } }));
          else if (type === "done") {
            finished = true;
            void refresh();
          } else if (type === "error") {
            finished = true;
            setR((p) => ({ ...p, status: (d.code as string) === "EVALUATION_FAILED" ? "failed" : "delayed", error: d as { code: string; message: string } }));
          }
        });
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          feed(dec.decode(value, { stream: true }));
        }
        if (!finished) setMode("poll");
        else setMode("idle");
      } catch {
        if (!ac.signal.aborted) setMode("poll");
      }
    })();
    return () => {
      window.clearInterval(watchdog);
      ac.abort();
    };
  }, [mode, id, refresh]);

  useEffect(() => {
    if (mode !== "poll") return;
    const i = window.setInterval(
      async () => {
        const d = await refresh();
        if (d && (d.status === "done" || d.status === "failed")) setMode("idle");
      },
      r.status === "delayed" ? 10_000 : 1000,
    );
    return () => window.clearInterval(i);
  }, [mode, refresh, r.status]);

  // The receipt is committed asynchronously: watch it reach a block.
  const chainStatus = r.record?.chainStatus;
  useEffect(() => {
    if (!chainStatus || chainStatus === "mined" || chainStatus === "failed" || mode !== "idle") return;
    const i = window.setInterval(refresh, 3000);
    return () => window.clearInterval(i);
  }, [chainStatus, mode, refresh]);

  const s = r.score;
  const evaluating = !s && !r.researchHidden && (r.status === "evaluating" || r.status === "scored");
  const kps = useMemo(() => s?.keyPoints ?? [], [s]);
  const isOwner = viewer === "student";
  const integrity = r.integrity ?? s?.integrity ?? null;
  const certified = countsTowardProgress(integrity?.outcome);
  const f = (r.feedback?.feedback ?? partial ?? null) as Partial<Feedback> | null;

  // The student's next moves: retry first (the one primary on this screen), then side routes.
  const recommended = recommendation && recommendation.articleId !== r.attempt.articleId ? recommendation : null;
  const nextMoves =
    isOwner && (r.status === "done" || r.researchHidden) ? (
      <>
        <ButtonLink href={`/start/${r.attempt.articleId}`} icon="replay" className="w-full sm:w-auto">
          Retry this article
        </ButtonLink>
        <ButtonLink href="/progress" variant="ghost" className="w-full sm:w-auto">
          Your progress
        </ButtonLink>
        {recommended ? (
          // Its own row (basis-full) so a long title never pushes the two buttons apart.
          <div className="mt-2.5 min-w-0 basis-full border-t border-teal/15 pt-3">
            <Link
              href={`/start/${recommended.articleId}`}
              className="group -mx-3 flex items-center justify-between gap-4 rounded-[12px] px-3 py-2.5 transition-colors duration-200 hover:bg-paper-raised/70"
            >
              <span className="min-w-0">
                <span className="eyebrow block">Up next</span>
                <span className="mt-1 block truncate font-serif text-[1.0625rem] text-ink">{recommended.title}</span>
              </span>
              <Icon name="arrow" size={18} className="shrink-0 text-teal transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        ) : null}
      </>
    ) : null;

  // Understood / partial / missed, weighted by each key idea's importance.
  const split = useMemo(() => {
    const w = { understood: 0, partial: 0, missed: 0 };
    const n = { understood: 0, partial: 0, missed: 0 };
    for (const k of kps) {
      const bucket = k.label === "correct" ? "understood" : k.label === "vague" ? "partial" : "missed";
      w[bucket] += k.weight;
      n[bucket] += 1;
    }
    const total = w.understood + w.partial + w.missed || 1;
    return { w, n, total };
  }, [kps]);

  return (
    <>
      <JourneyThread stage="decision" />
      <div className="frame-narrow pt-8 md:pt-12">
        <JourneySteps stage="decision" className="mb-8" />
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">
              <span className="mono normal-case tracking-normal">{r.attempt.articleId}</span> · attempt {r.attempt.attemptNo} ·{" "}
              {formatDateTime(r.attempt.createdAt)}
              {r.attempt.seeded ? " · seeded demo" : ""}
            </p>
            <p className="mt-2 font-serif text-lg leading-snug text-ink-2">{r.attempt.articleTitle}</p>
          </div>
          {viewer !== "student" ? (
            <ButtonLink href={`/teacher/${id}`} variant="secondary" size="sm">
              Open in review
            </ButtonLink>
          ) : null}
        </header>

        {r.status === "delayed" || r.status === "failed" ? (
          <div className="mt-8">
            <Notice tone={r.status === "failed" ? "bad" : "warn"} title={r.status === "failed" ? "Evaluation failed" : "Evaluation delayed"}>
              {r.error?.message ?? "Your answer is saved."} {r.status === "delayed" ? "This page checks again by itself." : ""}
            </Notice>
          </div>
        ) : null}

        {r.researchHidden ? (
          <section className="panel mt-10 px-8 py-10">
            <p className="display text-3xl">Thanks — your answer is recorded.</p>
            <p className="mt-3 max-w-xl text-ink-2">
              Research mode is on, so scores and feedback are hidden for now. Your receipt is still created and committed.
            </p>
          </section>
        ) : null}

        {evaluating ? <Progress stage={stage} mode={mode} /> : null}

        {s ? (
          <>
            {/* ── Your result ── */}
            <section aria-labelledby="score-h" className="mt-8">
              <h1 id="score-h" className="eyebrow">
                Your result
              </h1>
              <div
                className="mt-4 overflow-hidden rounded-[32px] px-7 pb-7 pt-8 sm:px-10 sm:pt-10"
                style={{ background: "linear-gradient(160deg, #AEDFF7 0%, #DAF3F2 58%, #EEF8F8 100%)" }}
              >
                <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                  <RollingNumber
                    value={s.finalScore}
                    label={`Score ${s.finalScore.toFixed(1)} out of 10`}
                    className={`display text-[clamp(6.5rem,24vw,10rem)] leading-[0.82] tracking-[-0.055em] ${certified ? "text-abyss" : "text-abyss/55"}`}
                  />
                  <div className="pb-3">
                    <p className="font-serif text-2xl text-abyss">{s.band}</p>
                    <p className="text-sm text-abyss/80">out of 10{certified ? "" : " · not certified"}</p>
                  </div>
                </div>
                {kps.length ? (
                  <div className="mt-8">
                    <div className="flex h-2.5 overflow-hidden rounded-full bg-white/60" aria-hidden>
                      <div className="bg-ok-mark" style={{ width: `${(split.w.understood / split.total) * 100}%` }} />
                      <div className="bg-warn-mark" style={{ width: `${(split.w.partial / split.total) * 100}%` }} />
                      <div className="bg-bad-mark" style={{ width: `${(split.w.missed / split.total) * 100}%` }} />
                    </div>
                    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-abyss">
                      <li className="flex items-center gap-1.5">
                        <Icon name="check" size={14} className="text-ok" /> {split.n.understood} understood
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Icon name="vague" size={14} className="text-warn" /> {split.n.partial} partly
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Icon name="missed" size={14} className="text-bad" /> {split.n.missed} missed or misread
                      </li>
                    </ul>
                  </div>
                ) : null}
              </div>

              {!certified && integrity ? (
                <div className="mt-4">
                  <Notice tone={integrity.outcome === "NOT_CERTIFIED" ? "bad" : "warn"} title={`Assessment conditions: ${STATUS_WORD[integrity.status]}`}>
                    {integrity.outcome === "NOT_CERTIFIED" ? "This result is not certified." : "A teacher reviews this result before it counts."} The
                    comprehension score itself is unchanged.
                    {integrity.review ? ` A teacher ${integrity.review.decision === "CLEARED" ? "cleared" : "upheld"} it: “${integrity.review.reason}”` : ""}
                  </Notice>
                </div>
              ) : null}
              {r.review ? (
                <div className="mt-4">
                  <Notice tone="signal" title={`Corrected by a teacher: ${r.review.previousScore.toFixed(1)} → ${r.review.newScore.toFixed(1)}`}>
                    “{r.review.reason}” The original record still verifies; the correction is a new, linked record.
                  </Notice>
                </div>
              ) : null}
              {s.flags.injectionSuspected || s.flags.gibberishSuspected ? (
                <div className="mt-4">
                  <Notice tone="bad" title={s.flags.injectionSuspected ? "Contains instructions to the grader" : "Looks like keyword stuffing"}>
                    {s.flags.injectionSuspected
                      ? "Text addressed to the grader earns nothing and sends the answer to a teacher."
                      : "The answer reads like a list of terms rather than an explanation."}
                  </Notice>
                </div>
              ) : null}
              {s.lowConfidence ? (
                <div className="mt-4">
                  <Notice tone="warn" title="A teacher will look at this one">
                    Part of the judgement stayed uncertain, so it is in the review queue.
                  </Notice>
                </div>
              ) : null}
              {r.delta ? (
                <p className="mt-4 text-sm text-ink-3">
                  <span className={`num mono font-medium ${r.delta.finalScore >= 0 ? "text-ok" : "text-bad"}`}>
                    {r.delta.finalScore >= 0 ? "+" : "−"}
                    {Math.abs(r.delta.finalScore).toFixed(1)}
                  </span>{" "}
                  since your previous attempt at this article
                </p>
              ) : null}

              <ChainFlowMini
                className="mt-6"
                current="decision"
                items={[
                  { key: "source", value: <span className="mono">{r.attempt.articleId}</span> },
                  { key: "claim", value: s.claimSummary.count },
                  { key: "evidence", value: `${s.claimSummary.supported} supported` },
                  { key: "decision", value: s.band },
                  { key: "proof", value: r.record ? (CHAIN[r.record.chainStatus] ?? CHAIN.queued).word : "…" },
                ]}
              />
            </section>

            {/* ── What it means ── */}
            <ComprehensionReport
              f={f}
              record={r.feedback ?? null}
              keyPoints={kps}
              evidence={s.evidence}
              fallbackSummary={BAND_MEANING[s.band]}
              actions={nextMoves}
            />

            {/* Retry is the primary move for the student; the evidence views step down beside it. */}
            <div className={nextMoves ? "mt-12" : "mt-12 flex flex-wrap items-center gap-x-6 gap-y-4"}>
              {nextMoves ? <p className="eyebrow">Explore the evidence</p> : null}
              <div className={nextMoves ? "mt-3 flex flex-wrap items-center gap-2.5" : "contents"}>
                {r.xrayReady ? (
                  <ButtonLink href={`/attempts/${id}/xray`} variant={nextMoves ? "secondary" : "primary"} size={nextMoves ? "md" : "lg"} iconAfter="arrow">
                    Open X-Ray
                  </ButtonLink>
                ) : (
                  <span className={`inline-flex items-center bg-paper-sunk text-sm text-ink-3 ${nextMoves ? "h-11 rounded-[14px] px-5" : "h-13 rounded-[16px] px-6"}`}>
                    The X-Ray opens when feedback is complete
                  </span>
                )}
                {r.record ? (
                  <ButtonLink href={`/attempts/${id}/proof`} variant={nextMoves ? "ghost" : "secondary"} size={nextMoves ? "md" : "lg"} icon="lock">
                    View proof
                  </ButtonLink>
                ) : null}
              </div>
            </div>

            {/* ── One interaction away ── */}
            <div className="mt-16">
              <Reveal summary="How this score was made" meta="formula, dimensions, fairness">
                <ScoreScale score={s.finalScore} previous={r.delta ? s.finalScore - r.delta.finalScore : null} />
                <div className="mt-8 grid gap-10 md:grid-cols-2">
                  <ScoreBreakdown score={s} />
                  <div className="space-y-5">
                    {STUDENT_DIMS.map((d) => (
                      <Meter
                        key={d}
                        label={DIMENSION_COPY[d].label}
                        value={s.dimensions[d]}
                        hint={DIMENSION_COPY[d].definition}
                        tone={recommendation?.weakest === d ? "signal" : "ink"}
                      />
                    ))}
                  </div>
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                  <IntegrityTag integrity={integrity} />
                </div>
                <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 text-xs sm:grid-cols-3">
                  <Fact
                    k="Judge"
                    v={<span className="mono">{s.judge.model}</span>}
                    sub={
                      s.judge.kind === "local"
                        ? "Local demo stand-in, not Jev"
                        : s.judge.kind === "evidence"
                          ? "The LLM extracts evidence; published rules decide"
                          : undefined
                    }
                  />
                  <Fact k="Claims" v={s.segmentation === "llm" ? "Split by the LLM, verified as your exact words" : "Split by sentence (no LLM)"} />
                  <Fact k="Fair entry" v={r.fairness.admissionMode === "fair" ? "Shuffled window" : "Arrival order"} sub={r.fairness.windowId ?? undefined} />
                  <Fact
                    k="Fair clock"
                    v={`${r.fairness.readSecondsGranted} s granted`}
                    sub={r.fairness.clockMode === "fair" ? `+${(r.fairness.latencyCompMs / 1000).toFixed(1)} s delivery delay added` : "server clock only"}
                  />
                  <Fact
                    k="Time to score"
                    v={<span className="num mono">{s.tScoreMs < 1000 ? `${s.tScoreMs} ms` : `${(s.tScoreMs / 1000).toFixed(2)} s`}</span>}
                  />
                </dl>
              </Reveal>
              {integrity ? (
                <Reveal summary="Assessment conditions" meta={STATUS_WORD[integrity.status]}>
                  <IntegrityPanel integrity={integrity} events={r.integrityEvents ?? []} embedded />
                </Reveal>
              ) : null}
              {s.evidence ? (
                <Reveal summary="Evidence trail" meta={`${s.evidence.claims.length} claims`}>
                  <EvidenceTrail evidence={s.evidence} embedded />
                </Reveal>
              ) : null}
              <div className="border-t border-rule" />
            </div>
          </>
        ) : null}

        {!s && nextMoves ? (
          <nav aria-label="Next" className="mt-10 flex flex-wrap items-center gap-2.5">
            {nextMoves}
          </nav>
        ) : null}
      </div>
    </>
  );
}

function Fact({ k, v, sub }: { k: string; v: React.ReactNode; sub?: string }) {
  return (
    <div>
      <dt className="eyebrow">{k}</dt>
      <dd className="mt-1 text-sm text-ink">{v}</dd>
      {sub ? <dd className="mt-0.5 text-ink-3">{sub}</dd> : null}
    </div>
  );
}

function Progress({ stage, mode }: { stage: Stage | null; mode: string }) {
  const idx = stage ? STAGES.findIndex((s) => s.id === stage) : 0;
  return (
    <section aria-live="polite" aria-busy="true" className="mt-10">
      <p className="display text-[clamp(2rem,4vw,2.75rem)]">Reading your explanation…</p>
      <ol className="mt-8 max-w-lg space-y-1">
        {STAGES.map((s, i) => (
          <li
            key={s.id}
            className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[0.9375rem] transition-colors duration-300 ${i === idx ? "bg-mint text-ink" : i < idx ? "text-ink-3" : "text-ink-3/60"}`}
          >
            <span className={`flex h-5 w-5 items-center justify-center rounded-full ${i < idx ? "bg-ok-wash text-ok" : ""}`}>
              {i < idx ? (
                <Icon name="check" size={12} />
              ) : i === idx ? (
                <span className="h-2 w-2 rounded-full bg-teal" style={{ animation: "ticker 1.2s var(--ease-in-out) infinite" }} />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-rule-strong" />
              )}
            </span>
            {s.label}
          </li>
        ))}
      </ol>
      {mode === "poll" ? (
        <p className="mt-4 text-xs text-ink-3">Live updates aren&rsquo;t available on this connection — checking every second instead.</p>
      ) : null}
    </section>
  );
}
