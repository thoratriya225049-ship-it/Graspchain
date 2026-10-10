import crypto from "node:crypto";
import {
  INJECTION_FLAG_AT,
  GIBBERISH_CAP_AT,
  PURPOSE_CAP_BELOW,
  articleText,
  buildQuestions,
  buildState,
  buildXray,
  fiveGramOverlap,
  fuse,
  mergeAnswers,
  sha256Hex,
  templateFeedback,
  uncertainKeys,
  validateClaims,
  validateFeedback,
  type Article,
  type Claim,
  type ClaimSummary,
  type EvalEvent,
  type FeedbackRecord,
  type Flags,
  type JevAnswers,
  type ScorePayload,
  type Segmentation,
} from "@graspchain/shared";
import type { Ctx } from "../context";
import { nowIso, parse } from "../db";
import { AppError } from "../errors";
import { JEV_USD_PER_INPUT_TOKEN, type JudgeCall } from "./judge";
import { buildReceipt, commitReceipt } from "../trust/receipts";

export interface AttemptRow {
  id: string;
  sessionId: string;
  studentId: string;
  articleId: string;
  attemptNo: number;
  answerText: string;
  wordCount: number;
  idempotencyKey: string;
  recordSalt: string;
  status: "evaluating" | "scored" | "done" | "delayed" | "failed";
  error: string | null;
  retryCount: number;
  nextRetryAt: number | null;
  seeded: number;
  createdAt: string;
  updatedAt: string;
}

const RETRY_EVERY_MS = 60_000;
const RETRY_FOR_MS = 60 * 60_000;

function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error(`timed out after ${ms} ms`)), ms);
  return Promise.race([
    run(ac.signal),
    new Promise<never>((_, rej) => ac.signal.addEventListener("abort", () => rej(ac.signal.reason ?? new Error("aborted")))),
  ]).finally(() => clearTimeout(t));
}

/**
 * The evaluator (PRD §9.2, SYSTEM_DESIGN §4.3): segment (LLM) → judge (Jev, one call) → fuse
 * (code) → explain (LLM) → receipt + outbox. The LLM can only choose spans of the student's own
 * text and write grounded feedback; the number comes from Jev probabilities and code.
 */
export class Evaluator {
  private running = new Set<string>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private ctx: Ctx) {}

  start() {
    this.sweepStale();
    this.timer = setInterval(() => {
      this.retryDelayed();
      this.ctx.hub.gc();
    }, 15_000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Wait for in-flight evaluations (graceful shutdown). */
  async drain(timeoutMs = 15_000) {
    const t0 = Date.now();
    while (this.running.size && Date.now() - t0 < timeoutMs) await new Promise((r) => setTimeout(r, 100));
  }

  isRunning(id: string) {
    return this.running.has(id);
  }

  /** Startup sweep: attempts left mid-evaluation by a restart are re-queued (SYSTEM_DESIGN §8). */
  sweepStale() {
    const cutoff = new Date(this.ctx.now() - 2 * 60_000).toISOString();
    const stale = this.ctx.db.prepare("SELECT id FROM attempts WHERE status IN ('evaluating','scored') AND updatedAt < ?").all(cutoff) as { id: string }[];
    for (const s of stale) {
      this.ctx.log.warn({ attemptId: s.id }, "re-queueing an evaluation interrupted by a restart");
      this.run(s.id);
    }
  }

  retryDelayed() {
    const due = this.ctx.db.prepare("SELECT id FROM attempts WHERE status = 'delayed' AND nextRetryAt <= ?").all(this.ctx.now()) as { id: string }[];
    for (const d of due) this.run(d.id);
  }

  /** Run an evaluation to completion (seed script, tests). */
  async runAndWait(attemptId: string): Promise<void> {
    this.run(attemptId);
    while (this.running.has(attemptId)) await new Promise((r) => setTimeout(r, 20));
  }

  /** Start (or join) the evaluation of an attempt. Never throws; failures are recorded on the attempt. */
  run(attemptId: string): void {
    if (this.running.has(attemptId)) return;
    this.running.add(attemptId);
    this.ctx.hub.open(attemptId);
    void this.evaluate(attemptId)
      .catch((e) => this.fail(attemptId, e))
      .finally(() => this.running.delete(attemptId));
  }

  private emit(attemptId: string, e: EvalEvent) {
    this.ctx.hub.emit(attemptId, e);
  }

  private fail(attemptId: string, e: unknown) {
    const { db, log } = this.ctx;
    const a = db.prepare("SELECT * FROM attempts WHERE id = ?").get(attemptId) as AttemptRow | undefined;
    if (!a) return;
    const code = e instanceof AppError ? e.code : "EVALUATION_ERROR";
    const message = e instanceof Error ? e.message : String(e);
    const age = this.ctx.now() - new Date(a.createdAt).getTime();
    const giveUp = age > RETRY_FOR_MS || code === "REPLAY_MISS" || code === "JEV_AUTH";
    const status = giveUp ? "failed" : "delayed";
    db.prepare("UPDATE attempts SET status = ?, error = ?, retryCount = retryCount + 1, nextRetryAt = ?, updatedAt = ? WHERE id = ?").run(
      status,
      JSON.stringify({ code, message }),
      giveUp ? null : this.ctx.now() + RETRY_EVERY_MS,
      nowIso(),
      attemptId,
    );
    log.error({ attemptId, code, err: message, status }, "evaluation.failed");
    this.emit(attemptId, {
      type: "error",
      data: {
        code: giveUp ? "EVALUATION_FAILED" : "EVALUATION_DELAYED",
        message: giveUp
          ? `Evaluation could not complete (${code}). Your answer is saved; a teacher can see it.`
          : `Evaluation is delayed (${code}). Your answer is saved and will be scored automatically; this page updates when it is.`,
      },
    });
  }

  private async evaluate(attemptId: string) {
    const { db, cfg, judge, llm, log, settings } = this.ctx;
    const a = db.prepare("SELECT * FROM attempts WHERE id = ?").get(attemptId) as AttemptRow;
    if (a.status === "done") return this.emit(attemptId, { type: "done", data: { attemptId } });

    // A crash after the receipt was committed must not create a second receipt.
    const committed = db.prepare("SELECT assessmentId FROM receipts WHERE attemptId = ? AND supersedes IS NULL").get(attemptId) as
      { assessmentId: string } | undefined;
    if (committed) {
      this.finalize(a);
      return this.emit(attemptId, { type: "done", data: { attemptId } });
    }

    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(a.sessionId) as {
      clockMode: "fair" | "naive";
      admissionMode: "fair" | "fifo";
      windowId: string | null;
      readSeconds: number;
      latencyCompMs: number;
      pasteCount: number;
      blurCount: number;
      copyCount: number;
    };
    const student = db.prepare("SELECT studentCode, salt FROM students WHERE id = ?").get(a.studentId) as { studentCode: string; salt: string };
    const article = this.ctx.articles.get(a.articleId)!;
    const answer = a.answerText;
    const t0 = this.ctx.now();
    db.prepare("UPDATE attempts SET status='evaluating', updatedAt=? WHERE id=?").run(nowIso(), attemptId);
    this.emit(attemptId, { type: "accepted", data: { attemptId, attemptNo: a.attemptNo } });

    // ── Stage 1: segment (LLM, hard timeout) → validate spans ──
    this.emit(attemptId, { type: "stage", data: { stage: "segmenting" } });
    let raw: string[] | null = null;
    let segTokens = 0;
    if (llm) {
      try {
        const r = await withTimeout(cfg.SEGMENT_TIMEOUT_MS, (signal) => llm.segment(answer, signal));
        raw = r.claims;
        segTokens = r.tokens;
      } catch (e) {
        log.warn({ attemptId, err: e instanceof Error ? e.message : String(e) }, "segmentation fell back to the sentence splitter");
      }
    }
    const v = validateClaims(raw, answer);
    const segmentation: Segmentation = raw && v.keptFromLlm > 0 ? "llm" : "sentence-fallback";
    const claims = v.claims;
    const segMs = this.ctx.now() - t0;
    db.transaction(() => {
      db.prepare("DELETE FROM claims WHERE attemptId = ?").run(attemptId);
      const ins = db.prepare('INSERT INTO claims (id, attemptId, claimId, text, start, "end", source) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const c of claims) ins.run(crypto.randomUUID(), attemptId, c.claimId, c.text, c.start, c.end, c.source);
    })();

    // ── Stage 2: judge (one systemOne call) → gating / re-ask ──
    this.emit(attemptId, { type: "stage", data: { stage: "judging" } });
    const tj = this.ctx.now();
    const state = buildState(article, answer, claims);
    const questions = buildQuestions(article, claims);
    const first: JudgeCall = await judge.systemOne({ article, state, questions });
    let answers: JevAnswers = first.answers;
    let inputTokens = first.usage.input_tokens;
    let debias: JudgeCall | null = null;
    if (cfg.JEV_ORDER_DEBIAS && judge.kind === "jev") {
      debias = await judge.systemOne({ article, state, questions: buildQuestions(article, claims, { reversed: true }) });
      const choiceOnly = Object.fromEntries(Object.entries(debias.answers).filter(([, x]) => x.type === "choice"));
      answers = mergeAnswers(answers, choiceOnly);
      inputTokens += debias.usage.input_tokens;
    }
    const uncertain = uncertainKeys(answers);
    let reask: JudgeCall | null = null;
    let stillUncertain: string[] = [];
    if (uncertain.length) {
      reask = await judge.systemOne({ article, state, questions: buildQuestions(article, claims, { rephrased: true, only: uncertain }) });
      answers = mergeAnswers(answers, reask.answers);
      inputTokens += reask.usage.input_tokens;
      stillUncertain = uncertainKeys(Object.fromEntries(uncertain.map((k) => [k, answers[k]])));
    }
    const jevMs = this.ctx.now() - tj;

    // ── Stage 3: fuse (deterministic) ──
    this.emit(attemptId, { type: "stage", data: { stage: "scoring" } });
    const overlap5 = fiveGramOverlap(answer, articleText(article));
    const fused = fuse({ article, claims, answers, overlap5 });
    const flags: Flags = {
      injectionSuspected: fused.noul.containsInstructions >= INJECTION_FLAG_AT,
      gibberishSuspected: fused.noul.gibberish >= GIBBERISH_CAP_AT,
      mainPurposeMissing: fused.noul.mainPurpose < PURPOSE_CAP_BELOW,
      pasteCount: session.pasteCount,
      blurCount: session.blurCount,
      copyCount: session.copyCount,
    };
    const claimSummary: ClaimSummary = {
      count: fused.claims.length,
      supported: fused.claims.filter((c) => c.label === "supported").length,
      partial: fused.claims.filter((c) => c.label === "partial").length,
      notInArticle: fused.claims.filter((c) => c.label === "not_in_article").length,
      contradicted: fused.claims.filter((c) => c.label === "contradicted").length,
    };
    const tScoreMs = this.ctx.now() - t0;
    const score: ScorePayload = {
      attemptId,
      finalScore: fused.finalScore,
      band: fused.band,
      dimensions: fused.dimensions,
      contributions: fused.contributions,
      adjustments: fused.adjustments,
      labels: Object.fromEntries(fused.keyPoints.map((k) => [k.id, k.label])),
      keyPoints: fused.keyPoints.map((k) => {
        const kp = article.keyPoints.find((x) => x.id === k.id)!;
        return { id: k.id, concept: kp.concept, label: k.label, p: k.p, weight: kp.weight };
      }),
      claimSummary,
      lowConfidence: stillUncertain.length > 0,
      uncertainItems: stillUncertain,
      flags,
      tScoreMs,
      judge: { kind: judge.kind, model: first.model, cached: first.cached },
      segmentation,
    };
    const now = nowIso();
    db.transaction(() => {
      db.prepare("DELETE FROM evaluations WHERE attemptId = ?").run(attemptId);
      db.prepare(
        `INSERT INTO evaluations (id, attemptId, segmentation, judgeKind, jevRequest, jevResponse, jevReask, jevModel, judgeCached, llmProvider, llmModel,
          scorePayload, fused, dimensions, finalScore, band, lowConfidence, flags, claimStats, latencySegMs, latencyJevMs, tScoreMs, jevInputTokens, llmTokens, costEst, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        crypto.randomUUID(),
        attemptId,
        segmentation,
        judge.kind,
        JSON.stringify({ model: judge.model, state, questions }),
        JSON.stringify({
          model: first.model,
          answers: first.answers,
          usage: first.usage,
          cached: first.cached,
          debias: debias?.answers ?? null,
          merged: answers,
        }),
        reask ? JSON.stringify({ keys: uncertain, answers: reask.answers, stillUncertain }) : null,
        first.model,
        first.cached ? 1 : 0,
        llm?.provider ?? null,
        llm?.model ?? null,
        JSON.stringify(score),
        JSON.stringify(fused),
        JSON.stringify(fused.dimensions),
        fused.finalScore,
        fused.band,
        score.lowConfidence ? 1 : 0,
        JSON.stringify(flags),
        JSON.stringify({ ...claimSummary, keptFromLlm: v.keptFromLlm, rejected: v.rejected, llmCoverage: v.llmCoverage, coverage: v.coverage }),
        segMs,
        jevMs,
        tScoreMs,
        inputTokens,
        segTokens,
        inputTokens * JEV_USD_PER_INPUT_TOKEN,
        now,
        now,
      );
      db.prepare("UPDATE attempts SET status='scored', error=NULL, updatedAt=? WHERE id=?").run(now, attemptId);
    })();

    const hidden = settings.get().researchMode;
    if (hidden)
      this.emit(attemptId, { type: "hidden", data: { attemptId, message: "Thanks — your answer is recorded. Scores are hidden while research mode is on." } });
    else this.emit(attemptId, { type: "score", data: score });

    // ── Stage 4: explain (LLM, streamed) → validate → template fallback ──
    this.emit(attemptId, { type: "stage", data: { stage: "explaining" } });
    const tl = this.ctx.now();
    const fctx = { article, answer, claims, fused };
    let feedback: FeedbackRecord | null = null;
    let fallbackReason = "No LLM is configured, so feedback is built from the judge's results.";
    let llmTokens = segTokens;
    if (llm) {
      for (let attempt = 0; attempt < 2 && !feedback; attempt++) {
        try {
          const r = await withTimeout(cfg.FEEDBACK_TIMEOUT_MS, (signal) =>
            llm.feedback(fctx, (partial) => !hidden && attempt === 0 && this.emit(attemptId, { type: "feedback", data: { partial } }), signal, attempt),
          );
          llmTokens += r.tokens;
          const validated = validateFeedback(r.raw, fctx);
          if (validated)
            feedback = { source: "llm", fallbackReason: null, model: `${llm.provider}/${llm.model}`, feedback: validated.feedback, dropped: validated.dropped };
          else fallbackReason = "The LLM's feedback failed validation, so feedback is built from the judge's results.";
        } catch (e) {
          fallbackReason = `The LLM did not respond in time (${e instanceof Error ? e.message : "error"}), so feedback is built from the judge's results.`;
          break;
        }
      }
    }
    feedback ??= { source: "template", fallbackReason, model: null, feedback: templateFeedback(fctx), dropped: 0 };
    const llmMs = this.ctx.now() - tl;
    if (!hidden) this.emit(attemptId, { type: "feedback", data: { final: feedback } });

    const xray = buildXray(article, answer, claims, fused, feedback);
    if (!hidden) this.emit(attemptId, { type: "xray", data: xray });

    // ── Receipt + outbox (never waits for the chain) ──
    this.emit(attemptId, { type: "stage", data: { stage: "recording" } });
    const receipt = await buildReceipt({
      studentRef: await sha256Hex(student.studentCode + student.salt),
      articleId: article.id,
      articleHash: await sha256Hex(articleText(article)),
      answerHash: await sha256Hex(answer + a.recordSalt),
      attemptNo: a.attemptNo,
      rubricVersion: article.rubricVersion,
      promptHash: this.ctx.promptHash,
      models: { jev: first.model, llm: llm ? `${llm.provider}/${llm.model}` : "none" },
      score,
      feedback: feedback.feedback,
      fairness: {
        admissionMode: session.admissionMode,
        admissionWindowId: session.windowId,
        clockMode: session.clockMode,
        readSecondsGranted: Math.round(session.readSeconds + session.latencyCompMs / 1000),
        latencyCompMs: session.latencyCompMs,
      },
      createdAt: a.seeded ? a.createdAt : nowIso(),
    });
    const { recordHash } = await commitReceipt(db, attemptId, receipt, cfg.CHAIN_ID);
    this.emit(attemptId, { type: "record", data: { assessmentId: receipt.assessmentId, recordHash, chainStatus: "queued" } });

    db.prepare("UPDATE evaluations SET llmFeedback=?, feedbackSource=?, xray=?, latencyLlmMs=?, tFeedbackMs=?, llmTokens=?, updatedAt=? WHERE attemptId=?").run(
      JSON.stringify(feedback),
      feedback.source,
      JSON.stringify(xray),
      llmMs,
      this.ctx.now() - t0,
      llmTokens,
      nowIso(),
      attemptId,
    );
    this.finalize(a);
    log.info(
      {
        attemptId,
        segMs,
        jevMs,
        llmMs,
        tScoreMs,
        inputTokens,
        llmTokens,
        costEst: Number((inputTokens * JEV_USD_PER_INPUT_TOKEN).toFixed(6)),
        segmentation,
        judge: judge.kind,
        cached: first.cached,
        reasked: uncertain.length,
        lowConfidence: score.lowConfidence,
        flags: { injection: flags.injectionSuspected, gibberish: flags.gibberishSuspected },
        feedback: feedback.source,
      },
      "evaluation.complete",
    );
    this.emit(attemptId, { type: "done", data: { attemptId } });
  }

  private finalize(a: AttemptRow) {
    const { db } = this.ctx;
    db.transaction(() => {
      db.prepare("UPDATE attempts SET status='done', error=NULL, nextRetryAt=NULL, updatedAt=? WHERE id=?").run(nowIso(), a.id);
      db.prepare("UPDATE sessions SET state='DONE', updatedAt=? WHERE id=?").run(this.ctx.now(), a.sessionId);
    })();
    const s = db.prepare("SELECT ticketId FROM sessions WHERE id=?").get(a.sessionId) as { ticketId: string | null } | undefined;
    if (s?.ticketId) this.ctx.fairgate.release(s.ticketId);
  }
}

/** Shapes stored on an evaluation row, for readers. */
export function readEvaluation(row: { scorePayload: string; llmFeedback: string | null; xray: string | null }) {
  return {
    score: parse<ScorePayload>(row.scorePayload),
    feedback: parse<FeedbackRecord | null>(row.llmFeedback),
    xray: parse<ReturnType<typeof buildXray> | null>(row.xray),
  };
}

export type { Article, Claim };
