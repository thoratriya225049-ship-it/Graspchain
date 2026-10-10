import type { FastifyInstance } from "fastify";
import { ConsentBody, LoginBody } from "@graspchain/shared";
import { clearSessionCookie, requireUser, setSessionCookie } from "../auth";
import type { Ctx } from "../context";
import { nowIso } from "../db";
import { AppError } from "../errors";
import { audit } from "../settings";

export const authRoutes = (ctx: Ctx) => async (app: FastifyInstance) => {
  app.post("/auth/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { code } = LoginBody.parse(req.body);
    const row = ctx.db
      .prepare("SELECT id, studentCode code, role, label, consentAt, withdrawnAt FROM students WHERE studentCode = ? COLLATE NOCASE")
      .get(code.trim()) as { id: string; code: string; role: string; label: string; consentAt: string | null; withdrawnAt: string | null } | undefined;
    if (!row) throw new AppError(401, "CODE_NOT_FOUND", "Code not found. Ask your instructor.");
    setSessionCookie(reply, ctx, row.id);
    audit(ctx.db, row.code, "auth.login", row.id);
    return { user: { ...row, needsConsent: row.role === "student" && (!row.consentAt || !!row.withdrawnAt) } };
  });

  app.post("/auth/logout", async (_req, reply) => {
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/auth/me", async (req) => {
    const u = requireUser(req);
    return { user: { ...u, needsConsent: u.role === "student" && (!u.consentAt || !!u.withdrawnAt) } };
  });

  /** Consent (APP_FLOW §2.2): accept, or withdraw (excluded from research exports from then on). */
  app.post("/auth/consent", async (req) => {
    const u = requireUser(req);
    const { accept } = ConsentBody.parse(req.body);
    if (accept) ctx.db.prepare("UPDATE students SET consentAt = ?, withdrawnAt = NULL WHERE id = ?").run(nowIso(), u.id);
    else ctx.db.prepare("UPDATE students SET withdrawnAt = ? WHERE id = ?").run(nowIso(), u.id);
    audit(ctx.db, u.code, accept ? "consent.accept" : "consent.withdraw", u.id);
    return { ok: true, consent: accept };
  });
};
