import {
  articleText,
  recommend,
  retryDelta,
  wordCount,
  type ArticleSummary,
  type Dimensions,
  type EvalEvent,
  type FeedbackRecord,
  type Receipt,
  type ResultPayload,
  type ScorePayload,
  type XRay,
} from "@graspchain/shared";
import type { User } from "./auth";
import type { Ctx } from "./context";
import { defaultReadSeconds } from "./content";
import { parse } from "./db";
import { AppError, notFound } from "./errors";
import type { AttemptRow } from "./evaluator/pipeline";
import { lineage } from "./trust/receipts";

interface EvalRow {
  scorePayload: string;
  llmFeedback: string | null;
  xray: string | null;
  finalScore: number;
  dimensions: string;
  band: string;
  lowConfidence: number;
  flags: string;
  jevModel: string;
  judgeKind: string;
  segmentation: string;
  feedbackSource: string | null;
}

export function getAttempt(ctx: Ctx, id: string): AttemptRow {
  const a = ctx.db.prepare("SELECT * FROM attempts WHERE id = ?").get(id) as AttemptRow | undefined;
  if (!a) throw notFound("Attempt");
  return a;
}

export function assertCanSee(u: User, a: { studentId: string }) {
  if (u.role === "student" && a.studentId !== u.id) throw new AppError(404, "NOT_FOUND", "Attempt not found.");
}

const evalOf = (ctx: Ctx, attemptId: string) => (ctx.db.prepare("SELECT * FROM evaluations WHERE attemptId = ?").get(attemptId) as EvalRow | undefined) ?? null;

/** The current receipt of an attempt: the newest version in its lineage. */
export function currentReceipt(ctx: Ctx, attemptId: string) {
  const rows = ctx.db
    .prepare(
      "SELECT assessmentId, supersedes, supersededBy, canonicalJson, recordHash, chainStatus, ethTx, blockNumber FROM receipts WHERE attemptId = ? ORDER BY createdAt, rowid",
    )
    .all(attemptId) as {
    assessmentId: string;
    supersedes: string | null;
    supersededBy: string | null;
    canonicalJson: string;
    recordHash: string;
    chainStatus: string;
    ethTx: string | null;
    blockNumber: number | null;
  }[];
  if (!rows.length) return null;
  const original = rows.find((r) => !r.supersedes) ?? rows[0];
  const current = rows.find((r) => !r.supersededBy) ?? rows[rows.length - 1];
  return { original, current, receipt: parse<Receipt>(current.canonicalJson), originalReceipt: parse<Receipt>(original.canonicalJson) };
}

export function hiddenFor(ctx: Ctx, u: User) {
  return u.role === "student" && ctx.settings.get().researchMode;
}

/** GET /api/result/:attemptId — polling fallback and page loads (APP_FLOW §2.7). */
export function resultPayload(ctx: Ctx, attemptId: string, u: User) {
  const a = getAttempt(ctx, attemptId);
  assertCanSee(u, a);
  const ev = evalOf(ctx, attemptId);
  const rc = currentReceipt(ctx, attemptId);
  const hidden = hiddenFor(ctx, u);
  const article = ctx.articles.get(a.articleId)!;
  const session = ctx.db
    .prepare("SELECT clockMode, admissionMode, windowId, readSeconds, latencyCompMs, measuredDelayMs FROM sessions WHERE id = ?")
    .get(a.sessionId) as {
    clockMode: string;
    admissionMode: string;
    windowId: string | null;
    readSeconds: number;
    latencyCompMs: number;
    measuredDelayMs: number | null;
  };
  let score = ev ? parse<ScorePayload>(ev.scorePayload) : null;
  const review = rc && rc.current.assessmentId !== rc.original.assessmentId ? rc.receipt.assessment.review : null;
  if (score && rc && review) score = { ...score, finalScore: rc.receipt.assessment.finalScore };
  const prev = ctx.db
    .prepare("SELECT id FROM attempts WHERE studentId = ? AND articleId = ? AND attemptNo = ? AND status = 'done'")
    .get(a.studentId, a.articleId, a.attemptNo - 1) as { id: string } | undefined;
  const prevEval = prev ? evalOf(ctx, prev.id) : null;
  const prevScore = prev ? (currentReceipt(ctx, prev.id)?.receipt.assessment.finalScore ?? prevEval?.finalScore ?? null) : null;

  const payload: ResultPayload & Record<string, unknown> = {
    attemptId,
    status: a.status,
    researchHidden: hidden,
    score: hidden ? null : score,
    feedback: hidden || !ev ? null : parse<FeedbackRecord | null>(ev.llmFeedback),
    xrayReady: !hidden && !!ev?.xray && a.status === "done",
    record: rc
      ? {
          assessmentId: rc.current.assessmentId,
          recordHash: rc.current.recordHash,
          chainStatus: rc.current.chainStatus,
          ethTx: rc.current.ethTx,
          blockNumber: rc.current.blockNumber,
        }
      : null,
    error: a.error ? parse<{ code: string; message: string }>(a.error) : null,
    attempt: {
      id: a.id,
      attemptNo: a.attemptNo,
      articleId: a.articleId,
      articleTitle: article.title,
      createdAt: a.createdAt,
      wordCount: a.wordCount,
      answer: a.answerText,
      seeded: !!a.seeded,
      sessionId: a.sessionId,
    },
    fairness: {
      admissionMode: session.admissionMode,
      windowId: session.windowId,
      clockMode: session.clockMode,
      readSecondsGranted: Math.round(session.readSeconds + session.latencyCompMs / 1000),
      latencyCompMs: session.latencyCompMs,
      measuredDelayMs: session.measuredDelayMs,
    },
    review: review && !hidden ? { ...review, newScore: rc!.receipt.assessment.finalScore } : null,
    delta:
      !hidden && score && prevEval && prevScore !== null
        ? {
            previousAttemptId: prev!.id,
            ...retryDelta(
              { finalScore: prevScore, dimensions: parse<Dimensions>(prevEval.dimensions) },
              { finalScore: score.finalScore, dimensions: score.dimensions },
            )!,
          }
        : null,
    lineage: rc ? lineage(ctx.db, attemptId).map((l) => (hidden ? { ...l, finalScore: null, review: null } : l)) : [],
    originalAssessmentId: rc?.original.assessmentId ?? null,
  };
  return payload;
}

export function xrayOf(ctx: Ctx, attemptId: string, u: User): XRay {
  const a = getAttempt(ctx, attemptId);
  assertCanSee(u, a);
  if (a.status !== "done") throw new AppError(409, "NOT_DONE", "The X-Ray is available once the evaluation is complete.");
  if (hiddenFor(ctx, u)) throw new AppError(403, "RESEARCH_MODE", "Results are hidden while research mode is on.");
  const ev = evalOf(ctx, attemptId);
  if (!ev?.xray) throw notFound("X-Ray");
  return parse<XRay>(ev.xray);
}

/** Events that reproduce a finished attempt for a late SSE subscriber. */
export function snapshotEvents(ctx: Ctx, attemptId: string, u: User): EvalEvent[] {
  const r = resultPayload(ctx, attemptId, u);
  const out: EvalEvent[] = [];
  if (r.status === "delayed" || r.status === "failed") {
    out.push({
      type: "error",
      data: { code: r.status === "failed" ? "EVALUATION_FAILED" : "EVALUATION_DELAYED", message: r.error?.message ?? "Evaluation is delayed." },
    });
    return out;
  }
  if (r.researchHidden)
    out.push({ type: "hidden", data: { attemptId, message: "Thanks — your answer is recorded. Scores are hidden while research mode is on." } });
  else if (r.score) out.push({ type: "score", data: r.score });
  if (r.feedback) out.push({ type: "feedback", data: { final: r.feedback } });
  if (r.xrayReady) out.push({ type: "xray", data: xrayOf(ctx, attemptId, u) });
  if (r.record) out.push({ type: "record", data: { assessmentId: r.record.assessmentId, recordHash: r.record.recordHash, chainStatus: r.record.chainStatus } });
  if (r.status === "done") out.push({ type: "done", data: { attemptId } });
  return out;
}

interface AttemptListRow {
  id: string;
  articleId: string;
  attemptNo: number;
  createdAt: string;
  status: string;
  seeded: number;
  finalScore: number | null;
  dimensions: string | null;
  band: string | null;
  lowConfidence: number | null;
}

export function attemptsOf(ctx: Ctx, studentId: string) {
  const rows = ctx.db
    .prepare(
      `SELECT a.id, a.articleId, a.attemptNo, a.createdAt, a.status, a.seeded, e.finalScore, e.dimensions, e.band, e.lowConfidence
       FROM attempts a LEFT JOIN evaluations e ON e.attemptId = a.id WHERE a.studentId = ? ORDER BY a.createdAt`,
    )
    .all(studentId) as AttemptListRow[];
  return rows.map((r) => {
    const rc = r.status === "done" ? currentReceipt(ctx, r.id) : null;
    const current = rc?.receipt.assessment.finalScore ?? r.finalScore;
    return {
      attemptId: r.id,
      articleId: r.articleId,
      articleTitle: ctx.articles.get(r.articleId)?.title ?? r.articleId,
      attemptNo: r.attemptNo,
      createdAt: r.createdAt,
      status: r.status,
      seeded: !!r.seeded,
      finalScore: current,
      originalScore: r.finalScore,
      reviewed: !!rc && rc.current.assessmentId !== rc.original.assessmentId,
      dimensions: r.dimensions ? parse<Dimensions>(r.dimensions) : null,
      band: r.band,
      lowConfidence: !!r.lowConfidence,
      chainStatus: rc?.current.chainStatus ?? null,
      assessmentId: rc?.current.assessmentId ?? null,
    };
  });
}

export function profileOf(ctx: Ctx, studentId: string, u: User) {
  if (u.role === "student" && u.id !== studentId) throw new AppError(404, "NOT_FOUND", "Profile not found.");
  const st = ctx.db.prepare("SELECT id, studentCode code, label, role FROM students WHERE id = ?").get(studentId) as
    { id: string; code: string; label: string; role: string } | undefined;
  if (!st) throw notFound("Profile");
  const hidden = hiddenFor(ctx, u);
  const all = attemptsOf(ctx, studentId);
  const done = all.filter((a) => a.status === "done" && a.dimensions && a.finalScore !== null);
  const arts = [...ctx.articles.values()];
  const rec = recommend(
    arts,
    done.map((a) => ({ articleId: a.articleId, finalScore: a.finalScore!, dimensions: a.dimensions!, createdAt: a.createdAt })),
  );
  const recArticle = ctx.articles.get(rec.articleId)!;
  const byArticle = new Map<string, typeof done>();
  for (const a of done) byArticle.set(a.articleId, [...(byArticle.get(a.articleId) ?? []), a]);
  const retries = [...byArticle.values()]
    .filter((xs) => xs.length > 1)
    .map((xs) => {
      const [prev, cur] = xs.slice(-2);
      return {
        articleId: cur.articleId,
        articleTitle: cur.articleTitle,
        from: prev.attemptId,
        to: cur.attemptId,
        ...retryDelta({ finalScore: prev.finalScore!, dimensions: prev.dimensions! }, { finalScore: cur.finalScore!, dimensions: cur.dimensions! })!,
      };
    });
  const scrub = <T extends { finalScore: number | null; originalScore: number | null; dimensions: Dimensions | null; band: string | null }>(a: T) =>
    hidden ? { ...a, finalScore: null, originalScore: null, dimensions: null, band: null } : a;
  return {
    student: { id: st.id, code: st.code, label: st.label },
    researchHidden: hidden,
    attempts: all.map(scrub),
    fingerprint: hidden
      ? []
      : done.map((a, i) => ({
          attemptId: a.attemptId,
          index: i + 1,
          articleId: a.articleId,
          createdAt: a.createdAt,
          finalScore: a.finalScore,
          ...a.dimensions!,
        })),
    retries: hidden ? [] : retries,
    stats: hidden
      ? null
      : {
          count: done.length,
          mean: done.length ? done.reduce((s, a) => s + a.finalScore!, 0) / done.length : null,
          best: done.length ? Math.max(...done.map((a) => a.finalScore!)) : null,
          last: done.length ? done[done.length - 1].finalScore : null,
        },
    recommendation: { ...rec, title: recArticle.title, difficulty: recArticle.difficulty, readSeconds: defaultReadSeconds(recArticle) },
  };
}

export function articleSummaries(ctx: Ctx, studentId: string | null): ArticleSummary[] {
  const s = ctx.settings.get();
  const hidden = s.researchMode;
  const atts = studentId ? attemptsOf(ctx, studentId) : [];
  return [...ctx.articles.values()].map((a) => {
    const mine = atts.filter((x) => x.articleId === a.id && x.status === "done" && x.finalScore !== null);
    return {
      id: a.id,
      title: a.title,
      dek: a.dek,
      topic: a.topic,
      difficulty: a.difficulty,
      skillTags: a.skillTags,
      wordCount: wordCount(articleText(a)),
      readSeconds: s.readSecondsOverride ?? defaultReadSeconds(a),
      keyPointCount: a.keyPoints.length,
      attemptsByMe: atts.filter((x) => x.articleId === a.id).length,
      bestScore: hidden || !mine.length ? null : Math.max(...mine.map((x) => x.finalScore!)),
      lastScore: hidden || !mine.length ? null : mine[mine.length - 1].finalScore,
    };
  });
}
