"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DIMENSION_COPY, countsTowardProgress, createSseParser, formatDateTime, type Feedback, type FeedbackRecord, type Stage } from "@graspchain/shared";
import { KeyIdeas, FeedbackView } from "@/components/assessment/Feedback";
import { EvidenceTrail, IntegrityBanner, IntegrityPanel, IntegrityTag } from "@/components/assessment/Integrity";
import { ScoreBreakdown } from "@/components/assessment/ScoreBreakdown";
import { ScoreScale } from "@/components/assessment/ScoreScale";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Hash, Meter, Notice } from "@/components/ui/Bits";
import { Icon } from "@/components/ui/Icon";
import { CHAIN, Mark, Tag } from "@/components/ui/Status";
import { call } from "@/lib/http";
import { verifierLink } from "@/lib/links";
import type { Recommendation, Result, Role, ScorePayload } from "@/lib/types";

const STAGES: { id: Stage; label: string }[] = [
  { id: "segmenting", label: "Splitting your answer into claims" },
  { id: "judging", label: "Judging every key idea and claim" },
  { id: "scoring", label: "Computing the score" },
  { id: "explaining", label: "Writing feedback" },
  { id: "recording", label: "Creating your receipt" },
];
const STUDENT_DIMS = ["coverage", "correctness", "reasoning", "ownWords"] as const;
const BAND_MEANING: Record<string, string> = {
  Surface: "Little of the article is explained, or there are clear errors.",
  Partial: "Some ideas are explained, with gaps or errors.",
  Functional: "Mostly accurate; some ideas or links are missing.",
  Deep: "The key ideas and how they connect are explained.",
  Expert: "Complete, precise and in your own words.",
};

export function ResultView({
  initial,
  viewer,
  recommendation,
  verifierUrl,
  publicWebUrl,
  explorerUrl,
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
  const qr = useRef<HTMLDialogElement>(null);

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
  const kps = s?.keyPoints ?? [];
  const isOwner = viewer === "student";
  // Integrity as it stands now (a teacher's decision applies), else as streamed with the score.
  const integrity = r.integrity ?? s?.integrity ?? null;
  const certified = countsTowardProgress(integrity?.outcome);

  return (
    <div className="frame pt-10 md:pt-14">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="eyebrow">
            Result · <span className="mono normal-case tracking-normal">{r.attempt.articleId}</span> · attempt {r.attempt.attemptNo} ·{" "}
            {formatDateTime(r.attempt.createdAt)}
            {r.attempt.seeded ? " · seeded demo" : ""}
          </p>
          <h1 className="mt-3 max-w-3xl font-serif text-xl leading-tight md:text-2xl">{r.attempt.articleTitle}</h1>
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
            {r.error?.message ?? "Your answer is saved."} {r.status === "delayed" ? "This page checks again every few seconds." : ""}
          </Notice>
        </div>
      ) : null}

      {r.researchHidden ? (
        <section className="mt-10 border-t border-ink pt-10">
          <p className="font-serif text-2xl">Thanks — your answer is recorded.</p>
          <p className="mt-3 max-w-xl text-ink-2">
            Research mode is on, so scores and feedback are hidden for now. Your receipt is still created and committed.
          </p>
        </section>
      ) : null}

      {evaluating ? <Progress stage={stage} mode={mode} /> : null}

      {s ? <IntegrityBanner integrity={integrity} /> : null}

      {s ? (
        <div className="mt-10 grid gap-14 border-t border-ink pt-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)] lg:gap-20">
          {/* ── The number, and how it was made ── */}
          <section aria-labelledby="score" className="animate-rise">
            <h2 id="score" className="sr-only">
              Score
            </h2>
            <p className="eyebrow mb-3">Comprehension score{certified ? "" : " · not a certified result"}</p>
            <div className="flex items-end gap-5">
              <p
                className={`num font-serif text-[6.5rem] font-medium leading-[0.8] tracking-[-0.05em] md:text-numeral ${certified ? "" : "text-ink-3"}`}
                aria-label={`Score ${s.finalScore.toFixed(1)} out of 10`}
              >
                {s.finalScore.toFixed(1)}
              </p>
              <div className="pb-2">
                <p className="eyebrow text-ink">{s.band}</p>
                <p className="mt-1 text-xs text-ink-3">out of 10</p>
              </div>
            </div>
            <p className="mt-5 max-w-sm text-[0.9375rem] text-ink-2">{BAND_MEANING[s.band]}</p>
            <div className="mt-8">
              <ScoreScale score={s.finalScore} previous={r.delta ? s.finalScore - r.delta.finalScore : null} />
            </div>
            {r.delta ? (
              <p className="mt-4 text-sm">
                <span className={`num mono font-medium ${r.delta.finalScore >= 0 ? "text-ok" : "text-bad"}`}>
                  {r.delta.finalScore >= 0 ? "+" : "−"}
                  {Math.abs(r.delta.finalScore).toFixed(1)}
                </span>{" "}
                <span className="text-ink-3">since your previous attempt at this article</span>
                {STUDENT_DIMS.filter((d) => Math.abs(r.delta!.dimensions[d] ?? 0) >= 0.05).map((d) => (
                  <span key={d} className="ml-3 text-ink-3">
                    {DIMENSION_COPY[d].label.toLowerCase()}{" "}
                    <span className="num mono">{(r.delta!.dimensions[d] >= 0 ? "+" : "−") + Math.abs(Math.round(r.delta!.dimensions[d] * 100))}</span>
                  </span>
                ))}
              </p>
            ) : null}

            {r.review ? (
              <div className="mt-6">
                <Notice tone="signal" title={`Corrected by a teacher: ${r.review.previousScore.toFixed(1)} → ${r.review.newScore.toFixed(1)}`}>
                  “{r.review.reason}” The original record still verifies; the correction is a new, linked record.
                </Notice>
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-2">
              {s.lowConfidence ? (
                <Tag tone="warn" icon="vague">
                  Flagged for teacher review
                </Tag>
              ) : null}
              {s.flags.injectionSuspected ? (
                <Tag tone="bad" icon="alert">
                  Contains instructions to the grader
                </Tag>
              ) : null}
              {s.flags.gibberishSuspected ? (
                <Tag tone="bad" icon="alert">
                  Looks like keyword stuffing
                </Tag>
              ) : null}
              <IntegrityTag integrity={integrity} />
            </div>

            <div className="mt-10">
              <h3 className="eyebrow mb-4">How this number was made</h3>
              <ScoreBreakdown score={s} />
            </div>

            <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-rule pt-5 text-xs">
              <div>
                <dt className="eyebrow">Judge</dt>
                <dd className="mono mt-1">{s.judge.model}</dd>
                {s.judge.kind === "local" ? <dd className="mt-0.5 text-warn">Local demo stand-in, not Jev</dd> : null}
                {s.judge.kind === "evidence" ? <dd className="mt-0.5 text-ink-3">The LLM extracts evidence; published rules decide</dd> : null}
              </div>
              <div>
                <dt className="eyebrow">Claims</dt>
                <dd className="mt-1">{s.segmentation === "llm" ? "Split by the LLM, verified as your exact words" : "Split by sentence (no LLM)"}</dd>
              </div>
              <div>
                <dt className="eyebrow">Fair entry</dt>
                <dd className="mt-1">
                  {r.fairness.admissionMode === "fair" ? "Shuffled window" : "Arrival order"}
                  {r.fairness.windowId ? <span className="mono block text-ink-3">{r.fairness.windowId}</span> : null}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">Fair clock</dt>
                <dd className="mt-1">
                  {r.fairness.readSecondsGranted} s granted
                  <span className="block text-ink-3">
                    {r.fairness.clockMode === "fair" ? `+${(r.fairness.latencyCompMs / 1000).toFixed(1)} s delivery delay added` : "server clock only"}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="eyebrow">Time to score</dt>
                <dd className="num mono mt-1">{s.tScoreMs < 1000 ? `${s.tScoreMs} ms` : `${(s.tScoreMs / 1000).toFixed(2)} s`}</dd>
              </div>
            </dl>
          </section>

          {/* ── What it means ── */}
          <section aria-labelledby="meaning" className="animate-rise [animation-delay:80ms]">
            <h2 id="meaning" className="sr-only">
              Breakdown and feedback
            </h2>
            <div className="grid gap-10 md:grid-cols-2">
              <div>
                <h3 className="eyebrow mb-4">Four dimensions</h3>
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
              <div>
                <h3 className="eyebrow mb-4">Key ideas</h3>
                <KeyIdeas keyPoints={kps} />
                {r.xrayReady ? (
                  <ButtonLink href={`/attempts/${id}/xray`} className="mt-6 w-full" iconAfter="arrow">
                    See it on the article
                  </ButtonLink>
                ) : (
                  <p className="mt-6 text-sm text-ink-3">The X-Ray opens when feedback is complete.</p>
                )}
              </div>
            </div>
            <div className="mt-14 border-t border-ink pt-8">
              <h3 className="eyebrow mb-5">Feedback</h3>
              <FeedbackView record={r.feedback} partial={partial} keyPoints={kps} />
            </div>
          </section>
        </div>
      ) : null}

      {s ? <IntegrityPanel integrity={integrity} events={r.integrityEvents ?? []} /> : null}
      {s ? <EvidenceTrail evidence={s.evidence} /> : null}

      {/* ── The receipt ── */}
      {r.record ? (
        <section aria-labelledby="receipt" className="mt-20 border border-ink bg-paper-raised shadow-doc">
          <div className="grid gap-8 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:p-8">
            <div className="min-w-0">
              <h2 id="receipt" className="eyebrow text-ink">
                Receipt
              </h2>
              <p className="mt-3 font-serif text-lg">
                {r.record.chainStatus === "mined"
                  ? "Committed on-chain. Anyone can check it without trusting Graspchain."
                  : "Receipt created. Its hash is being committed on-chain."}
              </p>
              <div className="mt-4">
                <Mark spec={CHAIN[r.record.chainStatus] ?? CHAIN.queued} />
              </div>
              <dl className="mt-5 grid gap-3 text-sm">
                <div className="grid gap-1 md:grid-cols-[9rem_minmax(0,1fr)]">
                  <dt className="text-ink-3">Assessment id</dt>
                  <dd>
                    <Hash value={r.record.assessmentId} label="assessment id" />
                  </dd>
                </div>
                <div className="grid gap-1 md:grid-cols-[9rem_minmax(0,1fr)]">
                  <dt className="text-ink-3">Record hash</dt>
                  <dd>
                    <Hash value={r.record.recordHash} label="record hash" />
                  </dd>
                </div>
                {r.record.ethTx ? (
                  <div className="grid gap-1 md:grid-cols-[9rem_minmax(0,1fr)]">
                    <dt className="text-ink-3">Transaction</dt>
                    <dd className="flex flex-wrap items-center gap-2">
                      <Hash value={r.record.ethTx} short label="transaction hash" />
                      {r.record.blockNumber ? <span className="text-ink-3">block {r.record.blockNumber}</span> : null}
                      {explorerUrl ? (
                        <a href={`${explorerUrl}/tx/${r.record.ethTx}`} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
                          Explorer <Icon name="external" size={12} />
                        </a>
                      ) : null}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
            <div className="flex flex-col gap-3 md:w-56">
              <ButtonLink href={`/verify/${r.record.assessmentId}`} variant="primary">
                Verify this record
              </ButtonLink>
              {isOwner ? (
                <a
                  href={`/api/result/${id}/receipt`}
                  download
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-ink/80 text-[0.9375rem] font-medium hover:bg-ink hover:text-paper"
                >
                  <Icon name="download" /> Download receipt
                </a>
              ) : null}
              <Button variant="secondary" onClick={() => qr.current?.showModal()}>
                Show QR code
              </Button>
            </div>
          </div>
          {r.lineage.length > 1 ? (
            <div className="border-t border-rule px-6 py-4 text-sm md:px-8">
              <span className="eyebrow mr-3">Versions</span>
              {r.lineage.map((l, i) => (
                <span key={l.assessmentId}>
                  {i ? <span className="mx-2 text-ink-3">→</span> : null}
                  <Link href={`/verify/${l.assessmentId}`} className="mono link">
                    {l.assessmentId.slice(0, 8)}
                  </Link>{" "}
                  <span className="num text-ink-3">{l.finalScore?.toFixed(1) ?? ""}</span>
                </span>
              ))}
            </div>
          ) : null}
          <dialog ref={qr} className="m-auto w-[min(92vw,22rem)] border border-ink bg-paper-raised p-6 text-ink backdrop:bg-ink/40" aria-labelledby="qr-title">
            <h3 id="qr-title" className="eyebrow text-ink">
              Scan to verify independently
            </h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/qr/${r.record.assessmentId}`}
              alt="QR code linking to the independent verifier for this receipt"
              width={256}
              height={256}
              className="mx-auto mt-4 h-64 w-64"
            />
            <p className="mt-4 text-xs text-ink-3">
              Opens the static verifier, which recomputes the hash in the browser and asks the chain directly — no request to Graspchain&rsquo;s API is needed
              to check it.
            </p>
            <div className="mt-5 flex items-center justify-between">
              <a href={verifierLink(verifierUrl, publicWebUrl, r.record.assessmentId)} target="_blank" rel="noreferrer" className="link text-sm">
                Open verifier
              </a>
              <form method="dialog">
                <Button size="sm" variant="secondary">
                  Close
                </Button>
              </form>
            </div>
          </dialog>
        </section>
      ) : null}

      {isOwner && (r.status === "done" || r.researchHidden) ? (
        <nav aria-label="Next" className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-rule pt-6">
          <ButtonLink href={`/start/${r.attempt.articleId}`} variant="secondary">
            Retry this article
          </ButtonLink>
          {recommendation && recommendation.articleId !== r.attempt.articleId ? (
            <Link href={`/start/${recommendation.articleId}`} className="text-[0.9375rem]">
              Next: <span className="font-serif">{recommendation.title}</span> <span aria-hidden>→</span>
            </Link>
          ) : null}
          <Link href="/progress" className="link text-[0.9375rem] text-ink-3">
            Your progress
          </Link>
        </nav>
      ) : null}
    </div>
  );
}

function Progress({ stage, mode }: { stage: Stage | null; mode: string }) {
  const idx = stage ? STAGES.findIndex((s) => s.id === stage) : 0;
  return (
    <section aria-live="polite" aria-busy="true" className="mt-10 border-t border-ink pt-10">
      <p className="font-serif text-2xl">Assessing your explanation…</p>
      <ol className="mt-8 max-w-lg">
        {STAGES.map((s, i) => (
          <li
            key={s.id}
            className={`flex items-center gap-3 border-b border-rule py-3 text-[0.9375rem] ${i < idx ? "text-ink-3" : i === idx ? "text-ink" : "text-ink-3/60"}`}
          >
            <span className={`flex h-4 w-4 items-center justify-center ${i < idx ? "text-ok" : ""}`}>
              {i < idx ? (
                <Icon name="check" size={14} />
              ) : i === idx ? (
                <span className="h-2 w-2 animate-[ticker_1s_ease-in-out_infinite] rounded-full bg-signal" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-rule-strong" />
              )}
            </span>
            {s.label}
          </li>
        ))}
      </ol>
      {mode === "poll" ? <p className="mt-4 text-xs text-ink-3">Live updates unavailable on this connection — checking every second instead.</p> : null}
    </section>
  );
}
