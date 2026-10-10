import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ReviewBody, sha256Hex, type Flags, type FusionResult, type Receipt, type ScorePayload } from "@graspchain/shared";
import { requireUser } from "../auth";
import type { Ctx } from "../context";
import { nowIso, parse } from "../db";
import { AppError, conflict, notFound } from "../errors";
import { attemptsOf, currentReceipt, getAttempt, resultPayload } from "../queries";
import { audit } from "../settings";
import { commitReceipt, getReceiptRow } from "../trust/receipts";

const IdParams = z.object({ id: z.string().uuid() });

export const teacherRoutes = (ctx: Ctx) => async (app: FastifyInstance) => {
  /** S11 review queue: low-confidence or injection-flagged attempts not yet reviewed, plus search by roster code. */
  app.get("/teacher/queue", async (req) => {
    requireUser(req, ["teacher", "admin"]);
    const q = z.object({ search: z.string().trim().max(32).optional() }).parse(req.query);
    const rows = ctx.db
      .prepare(
        `SELECT a.id, a.studentId, a.articleId, a.attemptNo, a.createdAt, a.status, s.studentCode, e.finalScore, e.lowConfidence, e.flags, e.scorePayload
         FROM attempts a JOIN students s ON s.id = a.studentId LEFT JOIN evaluations e ON e.attemptId = a.id
         WHERE a.status IN ('done','delayed','failed') ORDER BY a.createdAt DESC`,
      )
      .all() as {
      id: string;
      studentId: string;
      articleId: string;
      attemptNo: number;
      createdAt: string;
      status: string;
      studentCode: string;
      finalScore: number | null;
      lowConfidence: number | null;
      flags: string | null;
      scorePayload: string | null;
    }[];
    const items = rows.map((r) => {
      const flags = r.flags ? parse<Flags>(r.flags) : null;
      const score = r.scorePayload ? parse<ScorePayload>(r.scorePayload) : null;
      const rc = r.status === "done" ? currentReceipt(ctx, r.id) : null;
      const reviewed = !!rc && rc.current.assessmentId !== rc.original.assessmentId;
      const reasons: string[] = [];
      if (r.lowConfidence) reasons.push(`Judge uncertain on ${score?.uncertainItems.join(", ") || "some items"}`);
      if (flags?.injectionSuspected) reasons.push("Contains text addressed to the grader");
      if (flags?.gibberishSuspected) reasons.push("Looks like keyword stuffing or off-topic text");
      if (r.status === "delayed") reasons.push("Evaluation delayed");
      if (r.status === "failed") reasons.push("Evaluation failed");
      return {
        attemptId: r.id,
        studentCode: r.studentCode,
        articleId: r.articleId,
        articleTitle: ctx.articles.get(r.articleId)?.title ?? r.articleId,
        attemptNo: r.attemptNo,
        createdAt: r.createdAt,
        status: r.status,
        systemScore: r.finalScore,
        currentScore: rc?.receipt.assessment.finalScore ?? r.finalScore,
        assessmentId: rc?.current.assessmentId ?? null,
        reviewed,
        reasons,
      };
    });
    const search = q.search?.toUpperCase();
    return {
      queue: items.filter((i) => i.reasons.length && !i.reviewed),
      reviewed: items.filter((i) => i.reviewed).slice(0, 20),
      search: search ? items.filter((i) => i.studentCode.toUpperCase().includes(search)) : null,
    };
  });

  /** Item view: answer, claims with labels, key points, Jev confidence per item, score, feedback, flags. */
  app.get("/teacher/attempts/:id", async (req) => {
    const u = requireUser(req, ["teacher", "admin"]);
    const { id } = IdParams.parse(req.params);
    const a = getAttempt(ctx, id);
    const ev = ctx.db.prepare("SELECT * FROM evaluations WHERE attemptId = ?").get(id) as Record<string, string | number | null> | undefined;
    const student = ctx.db.prepare("SELECT studentCode FROM students WHERE id = ?").get(a.studentId) as { studentCode: string };
    const claims = ctx.db.prepare('SELECT claimId, text, start, "end", source FROM claims WHERE attemptId = ? ORDER BY start').all(id);
    const article = ctx.articles.get(a.articleId)!;
    const reviews = ctx.db
      .prepare("SELECT r.*, s.studentCode reviewer FROM reviews r JOIN students s ON s.id = r.reviewerId WHERE r.attemptId = ? ORDER BY r.createdAt")
      .all(id);
    return {
      ...resultPayload(ctx, id, { ...u, role: "teacher" }),
      studentCode: student.studentCode,
      article: {
        id: article.id,
        title: article.title,
        sentences: article.sentences,
        keyPoints: article.keyPoints.map((k) => ({ id: k.id, concept: k.concept, statement: k.statement, weight: k.weight, sentenceIdx: k.sentenceIdx })),
      },
      claims,
      fused: ev ? parse<FusionResult>(ev.fused as string) : null,
      judge: ev
        ? {
            kind: ev.judgeKind,
            model: ev.jevModel,
            cached: !!ev.judgeCached,
            segmentation: ev.segmentation,
            reask: ev.jevReask ? parse(ev.jevReask as string) : null,
            claimStats: parse(ev.claimStats as string),
            latency: { segMs: ev.latencySegMs, jevMs: ev.latencyJevMs, llmMs: ev.latencyLlmMs, tScoreMs: ev.tScoreMs, tFeedbackMs: ev.tFeedbackMs },
            tokens: { jevInput: ev.jevInputTokens, llm: ev.llmTokens, costEst: ev.costEst },
          }
        : null,
      reviews,
    };
  });

  /** Override = a new superseding receipt with a reason (PRD §9.4.6). The old record is never edited. */
  app.post("/teacher/review/:id", async (req) => {
    const u = requireUser(req, ["teacher", "admin"]);
    const { id: oldId } = IdParams.parse(req.params);
    const body = ReviewBody.parse(req.body);
    const old = getReceiptRow(ctx.db, oldId);
    if (!old) throw notFound("Assessment");
    if (old.supersededBy) throw conflict("ALREADY_SUPERSEDED", "This record was already corrected; review the newest version.");
    const base = parse<Receipt>(old.originalJson ?? old.canonicalJson);
    const newScore = Math.round(body.newScore * 10) / 10;
    if (newScore === base.assessment.finalScore) throw new AppError(400, "SAME_SCORE", "The new score equals the current score.");
    const reviewer = ctx.db.prepare("SELECT studentCode, salt FROM students WHERE id = ?").get(u.id) as { studentCode: string; salt: string };
    const at = nowIso();
    const receipt: Receipt = structuredClone(base);
    receipt.assessmentId = crypto.randomUUID();
    receipt.supersedes = oldId;
    receipt.assessment.finalScore = newScore;
    receipt.assessment.review = {
      reviewerRef: await sha256Hex(reviewer.studentCode + reviewer.salt),
      reason: body.reason,
      at,
      previousScore: base.assessment.finalScore,
    };
    receipt.createdAt = at;
    const { recordHash } = await commitReceipt(ctx.db, old.attemptId, receipt, ctx.cfg.CHAIN_ID);
    ctx.db
      .prepare(
        "INSERT INTO reviews (id, assessmentId, oldAssessmentId, attemptId, reviewerId, reason, previousScore, newScore, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(crypto.randomUUID(), receipt.assessmentId, oldId, old.attemptId, u.id, body.reason, base.assessment.finalScore, newScore, at);
    audit(ctx.db, u.code, "teacher.review", receipt.assessmentId, { oldId, previousScore: base.assessment.finalScore, newScore });
    return { assessmentId: receipt.assessmentId, supersedes: oldId, recordHash, chainStatus: "queued", previousScore: base.assessment.finalScore, newScore };
  });

  /** All attempts of one student (teacher search drill-down). */
  app.get("/teacher/students/:code", async (req) => {
    requireUser(req, ["teacher", "admin"]);
    const { code } = z.object({ code: z.string().max(32) }).parse(req.params);
    const st = ctx.db.prepare("SELECT id, studentCode code, label FROM students WHERE studentCode = ? COLLATE NOCASE").get(code) as
      { id: string; code: string; label: string } | undefined;
    if (!st) throw notFound("Student");
    return { student: st, attempts: attemptsOf(ctx, st.id) };
  });
};
