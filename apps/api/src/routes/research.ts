import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { RatingBody, SimBody, bootstrapCI, mae, pearsonR, qwk, simulateMany, spearman, withinOne, type Receipt } from "@graspchain/shared";
import { requireUser } from "../auth";
import type { Ctx } from "../context";
import { nowIso, parse } from "../db";
import { notFound } from "../errors";
import { audit } from "../settings";

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Research data: first attempts of consenting, non-withdrawn students (benchmarks use first attempts only). */
function researchRows(ctx: Ctx, opts: { includeSeeded: boolean }) {
  return ctx.db
    .prepare(
      `SELECT a.id attemptId, a.articleId, a.attemptNo, a.answerText, a.wordCount, a.createdAt, a.seeded, a.studentId, e.finalScore, e.judgeKind, e.jevModel
       FROM attempts a JOIN students s ON s.id = a.studentId LEFT JOIN evaluations e ON e.attemptId = a.id
       WHERE a.status = 'done' AND a.attemptNo = 1 AND s.role = 'student' AND s.consentAt IS NOT NULL AND s.withdrawnAt IS NULL ${opts.includeSeeded ? "" : "AND a.seeded = 0"}
       ORDER BY a.createdAt`,
    )
    .all() as {
    attemptId: string;
    articleId: string;
    attemptNo: number;
    answerText: string;
    wordCount: number;
    createdAt: string;
    seeded: number;
    studentId: string;
    finalScore: number | null;
    judgeKind: string | null;
    jevModel: string | null;
  }[];
}

export const researchRoutes = (ctx: Ctx) => async (app: FastifyInstance) => {
  /** Anonymized CSV for raters (APP_FLOW §5). System scores are hidden unless asked for. */
  app.post("/research/export", async (req, reply) => {
    const u = requireUser(req, ["teacher", "admin"]);
    const q = z.object({ includeScores: z.coerce.boolean().default(false), includeSeeded: z.coerce.boolean().default(false) }).parse(req.query);
    const rows = researchRows(ctx, q);
    const pseud = (id: string) => crypto.createHmac("sha256", ctx.cfg.QUEUE_SECRET).update(id).digest("hex").slice(0, 10);
    const header = ["attemptId", "participant", "articleId", "wordCount", "answer", ...(q.includeScores ? ["systemScore", "judge"] : []), "createdAt"];
    const lines = rows.map((r) =>
      [r.attemptId, pseud(r.studentId), r.articleId, r.wordCount, r.answerText, ...(q.includeScores ? [r.finalScore, r.jevModel] : []), r.createdAt]
        .map(csvCell)
        .join(","),
    );
    audit(ctx.db, u.code, "research.export", null, { rows: rows.length, includeScores: q.includeScores });
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", `attachment; filename="graspchain-research-${nowIso().slice(0, 10)}.csv"`);
    return [header.join(","), ...lines].join("\n") + "\n";
  });

  /** Blind rating queue: no system scores, own ratings excluded, stable shuffled order per rater. */
  app.get("/research/rating-queue", async (req) => {
    requireUser(req, ["teacher", "admin"]);
    const q = z.object({ rater: z.string().trim().min(1).max(40), includeSeeded: z.coerce.boolean().default(false) }).parse(req.query);
    const rated = new Set(
      (ctx.db.prepare("SELECT attemptId FROM human_ratings WHERE rater = ?").all(q.rater) as { attemptId: string }[]).map((r) => r.attemptId),
    );
    const rows = researchRows(ctx, q);
    const order = (id: string) =>
      crypto
        .createHash("sha256")
        .update(q.rater + id)
        .digest("hex");
    const pending = rows.filter((r) => !rated.has(r.attemptId)).sort((a, b) => order(a.attemptId).localeCompare(order(b.attemptId)));
    const next = pending[0];
    const article = next ? ctx.articles.get(next.articleId)! : null;
    return {
      total: rows.length,
      done: rows.length - pending.length,
      next: next
        ? {
            attemptId: next.attemptId,
            articleId: next.articleId,
            articleTitle: article!.title,
            articleSentences: article!.sentences,
            keyPoints: article!.keyPoints.map((k) => ({ id: k.id, statement: k.statement, weight: k.weight })),
            answer: next.answerText,
          }
        : null,
    };
  });

  app.post("/research/rating", async (req) => {
    const u = requireUser(req, ["teacher", "admin"]);
    const body = RatingBody.parse(req.body);
    const a = ctx.db.prepare("SELECT id FROM attempts WHERE id = ?").get(body.attemptId);
    if (!a) throw notFound("Attempt");
    ctx.db
      .prepare(
        `INSERT INTO human_ratings (id, attemptId, rater, raterType, score, createdAt) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(attemptId, rater) DO UPDATE SET score = excluded.score, raterType = excluded.raterType, createdAt = excluded.createdAt`,
      )
      .run(crypto.randomUUID(), body.attemptId, body.rater, body.raterType, body.score, nowIso());
    audit(ctx.db, u.code, "research.rating", body.attemptId, { rater: body.rater });
    return { ok: true };
  });

  /** E1/E2 from the ratings collected so far. Reports n and CIs; never claims more than the data supports. */
  app.get("/research/summary", async (req) => {
    requireUser(req, ["teacher", "admin"]);
    const ratings = ctx.db.prepare("SELECT attemptId, rater, raterType, score FROM human_ratings").all() as {
      attemptId: string;
      rater: string;
      raterType: string;
      score: number;
    }[];
    const raters = [...new Set(ratings.map((r) => r.rater))];
    const byAttempt = new Map<string, number[]>();
    for (const r of ratings) byAttempt.set(r.attemptId, [...(byAttempt.get(r.attemptId) ?? []), r.score]);

    let e1: Record<string, unknown> | null = null;
    if (raters.length >= 2) {
      const [r1, r2] = raters;
      const s1 = new Map(ratings.filter((r) => r.rater === r1).map((r) => [r.attemptId, r.score]));
      const pairs = ratings.filter((r) => r.rater === r2 && s1.has(r.attemptId)).map((r) => [s1.get(r.attemptId)!, r.score] as const);
      const a = pairs.map((p) => p[0]);
      const b = pairs.map((p) => p[1]);
      e1 = { raters: [r1, r2], n: pairs.length, spearman: spearman(a, b), qwk: qwk(a, b), mae: mae(a, b) };
    }

    const sys: number[] = [];
    const human: number[] = [];
    const judges = new Set<string>();
    for (const [attemptId, scores] of byAttempt) {
      const rc = ctx.db.prepare("SELECT canonicalJson FROM receipts WHERE attemptId = ? AND supersedes IS NULL").get(attemptId) as
        { canonicalJson: string } | undefined;
      if (!rc) continue;
      const receipt = parse<Receipt>(rc.canonicalJson);
      judges.add(receipt.assessment.models.jev);
      sys.push(receipt.assessment.finalScore);
      human.push(scores.reduce((s, x) => s + x, 0) / scores.length);
    }
    const n = sys.length;
    const localOnly = [...judges].every((j) => j.startsWith("local-"));
    return {
      ratings: ratings.length,
      raters: raters.map((r) => ({ rater: r, type: ratings.find((x) => x.rater === r)!.raterType, n: ratings.filter((x) => x.rater === r).length })),
      e1,
      e2: {
        system: "S3 (configured pipeline)",
        judges: [...judges],
        caveat:
          localOnly && n
            ? "Every rated answer was scored by the local demo judge, not Jev. These numbers describe the demo judge only and are not a research result."
            : null,
        n,
        spearman: spearman(sys, human),
        spearmanCI: bootstrapCI(sys, human, spearman),
        pearson: pearsonR(sys, human),
        mae: mae(sys, human),
        qwk: qwk(sys, human),
        withinOne: withinOne(sys, human),
      },
    };
  });

  /** E5a: FairGate simulation (synthetic clients; labelled as simulated). */
  app.post("/research/fairgate-sim", async (req) => {
    requireUser(req, ["teacher", "admin"]);
    const body = SimBody.parse(req.body ?? {});
    const runs = [
      { label: "FIFO", ...simulateMany({ mode: "fifo", windowMs: body.windowMs }, body.seeds) },
      ...[1000, 2000, 5000].map((w) => ({ label: `Fair W=${w / 1000}s`, ...simulateMany({ mode: "fair", windowMs: w }, body.seeds) })),
    ];
    const ins = ctx.db.prepare(
      "INSERT INTO fairness_runs (id, experiment, config, cohort, medianWait, p95Wait, admitRate, jain, readTimeLossS, createdAt) VALUES (?, 'E5a', ?, ?, ?, NULL, ?, ?, NULL, ?)",
    );
    ctx.db.transaction(() => {
      for (const r of runs) {
        ins.run(crypto.randomUUID(), JSON.stringify({ label: r.label, seeds: body.seeds }), "fast", r.fastMedian, r.fastAdmit, r.jain, nowIso());
        ins.run(crypto.randomUUID(), JSON.stringify({ label: r.label, seeds: body.seeds }), "normal", r.normalMedian, r.normalAdmit, r.jain, nowIso());
      }
    })();
    return { simulated: true, seeds: body.seeds, clients: { fast: 20, normal: 180 }, concurrency: 3, serviceMs: 2000, runs };
  });

  /** E5b inputs from real sessions: measured delivery delay vs. compensation, by clock mode. */
  app.get("/research/fairclock", async (req) => {
    requireUser(req, ["teacher", "admin"]);
    const rows = ctx.db
      .prepare(
        "SELECT clockMode, measuredDelayMs, latencyCompMs, readSeconds, createdAt FROM sessions WHERE measuredDelayMs IS NOT NULL ORDER BY createdAt DESC LIMIT 500",
      )
      .all() as { clockMode: string; measuredDelayMs: number; latencyCompMs: number; readSeconds: number; createdAt: number }[];
    return {
      capS: ctx.cfg.FAIRCLOCK_CAP_S,
      sessions: rows.map((r) => ({ ...r, readTimeLossS: Math.max(0, r.measuredDelayMs - r.latencyCompMs) / 1000 })),
    };
  });
};
