import type { FastifyInstance } from "fastify";
import { ModeBody, TamperBody, canonicalReceiptJson, type Receipt } from "@graspchain/shared";
import { requireAdmin } from "../auth";
import type { Ctx } from "../context";
import { nowIso, parse } from "../db";
import { conflict, notFound } from "../errors";
import { audit } from "../settings";
import { getReceiptRow } from "../trust/receipts";
import { publicConfig } from "./health";

/** One-field mutations of the SERVER copy (PRD §9.4.8). The chain and the student's file are untouched. */
const TAMPER: Record<string, { label: string; mutate: (r: Receipt) => void }> = {
  finalScore: {
    label: "Final score ±1.5",
    mutate: (r) =>
      (r.assessment.finalScore = Math.round((r.assessment.finalScore <= 8.5 ? r.assessment.finalScore + 1.5 : r.assessment.finalScore - 1.5) * 10) / 10),
  },
  answerHash: { label: "Answer hash (one character)", mutate: (r) => (r.answerHash = (r.answerHash[0] === "a" ? "b" : "a") + r.answerHash.slice(1)) },
  createdAt: { label: "Created at −1 day", mutate: (r) => (r.createdAt = new Date(new Date(r.createdAt).getTime() - 86_400_000).toISOString()) },
  "models.jev": { label: "Judge model id", mutate: (r) => (r.assessment.models.jev = r.assessment.models.jev + "-patched") },
  rubricVersion: { label: "Rubric version +1", mutate: (r) => (r.assessment.rubricVersion += 1) },
  studentRef: { label: "Student reference", mutate: (r) => (r.studentRef = (r.studentRef[0] === "a" ? "b" : "a") + r.studentRef.slice(1)) },
  readSecondsGranted: { label: "Reading time granted +30 s", mutate: (r) => (r.fairness.readSecondsGranted += 30) },
};

export const adminRoutes = (ctx: Ctx) => async (app: FastifyInstance) => {
  app.get("/admin/status", async (req) => {
    requireAdmin(req, ctx, { demoTool: false });
    const jev = ctx.usage.today("jev");
    const llm = ctx.llm ? ctx.usage.today(ctx.llm.provider) : null;
    const calls = ctx.db.prepare("SELECT COALESCE(SUM(calls),0) c, COALESCE(SUM(cacheHits),0) h FROM api_usage").get() as { c: number; h: number };
    const tickets = ctx.db.prepare("SELECT state, COUNT(*) n FROM queue_tickets WHERE state IN ('waiting','admitted','used') GROUP BY state").all() as {
      state: string;
      n: number;
    }[];
    const attempts = ctx.db.prepare("SELECT status, COUNT(*) n FROM attempts GROUP BY status").all() as { status: string; n: number }[];
    const latency = ctx.db.prepare("SELECT tScoreMs FROM evaluations WHERE tScoreMs IS NOT NULL ORDER BY createdAt DESC LIMIT 200").all() as {
      tScoreMs: number;
    }[];
    const sorted = latency.map((l) => l.tScoreMs).sort((a, b) => a - b);
    const q = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null);
    return {
      config: publicConfig(ctx),
      settings: ctx.settings.get(),
      jev: { tokensToday: jev.inputTokens, cap: ctx.cfg.JEV_DAILY_TOKEN_CAP, callsToday: jev.calls, cacheHitsToday: jev.cacheHits },
      llm: llm ? { provider: ctx.llm!.provider, tokensToday: llm.inputTokens + llm.outputTokens, callsToday: llm.calls, cacheHitsToday: llm.cacheHits } : null,
      cacheHitRate: calls.c + calls.h ? calls.h / (calls.c + calls.h) : null,
      outbox: ctx.writer.backlog(),
      writerLastError: ctx.writer.lastError,
      queue: Object.fromEntries(tickets.map((t) => [t.state, t.n])),
      attempts: Object.fromEntries(attempts.map((a) => [a.status, a.n])),
      latency: { p50ScoreMs: q(0.5), p95ScoreMs: q(0.95), n: sorted.length },
      chain: await ctx.chain.status(),
    };
  });

  app.post("/admin/mode", async (req) => {
    const u = requireAdmin(req, ctx, { demoTool: true });
    const patch = ModeBody.parse(req.body);
    const settings = ctx.settings.set(patch);
    audit(ctx.db, u.code, "admin.mode", null, patch);
    return { settings };
  });

  app.get("/admin/receipts", async (req) => {
    requireAdmin(req, ctx, { demoTool: false });
    const rows = ctx.db
      .prepare(
        `SELECT r.assessmentId, r.attemptId, r.supersedes, r.supersededBy, r.chainStatus, r.tamperedField, r.createdAt, r.canonicalJson, s.studentCode
         FROM receipts r JOIN attempts a ON a.id = r.attemptId JOIN students s ON s.id = a.studentId ORDER BY r.createdAt DESC LIMIT 40`,
      )
      .all() as {
      assessmentId: string;
      attemptId: string;
      supersedes: string | null;
      supersededBy: string | null;
      chainStatus: string;
      tamperedField: string | null;
      createdAt: string;
      canonicalJson: string;
      studentCode: string;
    }[];
    return {
      fields: Object.entries(TAMPER).map(([id, t]) => ({ id, label: t.label })),
      receipts: rows.map(({ canonicalJson, ...r }) => {
        const rc = parse<Receipt>(canonicalJson);
        return { ...r, articleId: rc.articleId, finalScore: rc.assessment.finalScore };
      }),
    };
  });

  app.post("/admin/tamper", async (req) => {
    const u = requireAdmin(req, ctx, { demoTool: true });
    const { assessmentId, field } = TamperBody.parse(req.body);
    const row = getReceiptRow(ctx.db, assessmentId);
    if (!row) throw notFound("Assessment");
    if (row.tamperedField) throw conflict("ALREADY_TAMPERED", `Already tampered (${row.tamperedField}). Restore it first.`);
    const receipt = parse<Receipt>(row.canonicalJson);
    TAMPER[field].mutate(receipt);
    ctx.db
      .prepare("UPDATE receipts SET canonicalJson = ?, originalJson = ?, tamperedField = ?, tamperedAt = ? WHERE assessmentId = ?")
      .run(canonicalReceiptJson(receipt), row.canonicalJson, field, nowIso(), assessmentId);
    audit(ctx.db, u.code, "admin.tamper", assessmentId, { field });
    return { ok: true, assessmentId, field, label: TAMPER[field].label };
  });

  app.post("/admin/restore", async (req) => {
    const u = requireAdmin(req, ctx, { demoTool: true });
    const { assessmentId } = TamperBody.pick({ assessmentId: true }).parse(req.body);
    const row = getReceiptRow(ctx.db, assessmentId);
    if (!row) throw notFound("Assessment");
    if (!row.originalJson) throw conflict("NOT_TAMPERED", "This receipt was not tampered.");
    ctx.db
      .prepare("UPDATE receipts SET canonicalJson = originalJson, originalJson = NULL, tamperedField = NULL, tamperedAt = NULL WHERE assessmentId = ?")
      .run(assessmentId);
    audit(ctx.db, u.code, "admin.restore", assessmentId);
    return { ok: true };
  });

  app.get("/admin/audit", async (req) => {
    requireAdmin(req, ctx, { demoTool: false });
    return { entries: ctx.db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT 100").all() };
  });
};
