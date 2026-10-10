import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { ConsentBody, LoginBody, RegisterBody } from "@graspchain/shared";
import { clearSessionCookie, hashPassword, requireUser, setSessionCookie, verifyPassword } from "../auth";
import type { Ctx } from "../context";
import { nowIso } from "../db";
import { AppError } from "../errors";
import { audit } from "../settings";

export const authRoutes = (ctx: Ctx) => async (app: FastifyInstance) => {
  app.post("/auth/register", { config: { rateLimit: { max: 15, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { code, password, label, role } = RegisterBody.parse(req.body);
    const trimmedCode = code.trim();
    const existing = ctx.db.prepare("SELECT id FROM students WHERE studentCode = ? COLLATE NOCASE").get(trimmedCode) as { id: string } | undefined;
    if (existing) {
      throw new AppError(409, "ID_ALREADY_EXISTS", "This ID is already registered. Please choose another or sign in.");
    }

    const id = crypto.randomUUID();
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordSalt = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password, passwordSalt);
    const userLabel = label?.trim() || trimmedCode;
    const consentAt = nowIso();

    ctx.db
      .prepare(
        "INSERT INTO students (id, studentCode, salt, role, label, consentAt, withdrawnAt, createdAt, passwordHash, passwordSalt) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)",
      )
      .run(id, trimmedCode, salt, role, userLabel, consentAt, nowIso(), passwordHash, passwordSalt);

    setSessionCookie(reply, ctx, id);
    audit(ctx.db, trimmedCode, "auth.register", id);

    const user = {
      id,
      code: trimmedCode,
      role,
      label: userLabel,
      consentAt,
      withdrawnAt: null,
      needsConsent: false,
    };
    return { user };
  });

  app.post("/auth/login", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { code, password } = LoginBody.parse(req.body);
    const row = ctx.db
      .prepare(
        "SELECT id, studentCode code, role, label, consentAt, withdrawnAt, passwordHash, passwordSalt FROM students WHERE studentCode = ? COLLATE NOCASE",
      )
      .get(code.trim()) as
      | {
          id: string;
          code: string;
          role: string;
          label: string;
          consentAt: string | null;
          withdrawnAt: string | null;
          passwordHash: string | null;
          passwordSalt: string | null;
        }
      | undefined;
    if (!row) throw new AppError(401, "CODE_NOT_FOUND", "Account not found. Ask your instructor or create a new ID.");

    if (row.passwordHash && row.passwordSalt) {
      if (!password) {
        throw new AppError(400, "PASSWORD_REQUIRED", "Password is required for this account.");
      }
      if (!verifyPassword(password, row.passwordSalt, row.passwordHash)) {
        throw new AppError(401, "INVALID_PASSWORD", "Incorrect password.");
      }
    }

    setSessionCookie(reply, ctx, row.id);
    audit(ctx.db, row.code, "auth.login", row.id);
    return {
      user: {
        id: row.id,
        code: row.code,
        role: row.role,
        label: row.label,
        consentAt: row.consentAt,
        withdrawnAt: row.withdrawnAt,
        needsConsent: row.role === "student" && (!row.consentAt || !!row.withdrawnAt),
      },
    };
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
