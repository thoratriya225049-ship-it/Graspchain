import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Role } from "@graspchain/shared";
import type { Ctx } from "./context";
import { AppError } from "./errors";

export const COOKIE = "gc_session";
export const MAX_AGE_S = 12 * 60 * 60;

export interface User {
  id: string;
  code: string;
  role: Role;
  label: string;
  consentAt: string | null;
  withdrawnAt: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    user: User | null;
  }
}

export function setSessionCookie(reply: FastifyReply, ctx: Ctx, userId: string) {
  reply.setCookie(COOKIE, `${userId}.${ctx.now() + MAX_AGE_S * 1000}`, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: ctx.cfg.NODE_ENV === "production",
    signed: true,
    maxAge: MAX_AGE_S,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(COOKIE, { path: "/" });
}

/** onRequest hook: resolve the signed cookie to a user (or null). */
export function loadUser(ctx: Ctx) {
  return async (req: FastifyRequest) => {
    req.user = null;
    const raw = req.cookies[COOKIE];
    if (!raw) return;
    const un = req.unsignCookie(raw);
    if (!un.valid || !un.value) return;
    const [id, exp] = un.value.split(".");
    if (!id || !(Number(exp) > ctx.now())) return;
    const row = ctx.db.prepare("SELECT id, studentCode code, role, label, consentAt, withdrawnAt FROM students WHERE id = ?").get(id) as User | undefined;
    req.user = row ?? null;
  };
}

export function requireUser(req: FastifyRequest, roles?: Role[]): User {
  if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
  if (roles && !roles.includes(req.user.role)) throw new AppError(403, "FORBIDDEN", "Your role cannot do this.");
  return req.user;
}

export function requireConsent(u: User) {
  if (u.role === "student" && (!u.consentAt || u.withdrawnAt)) {
    throw new AppError(403, "CONSENT_REQUIRED", "Review and accept the consent notice before starting.");
  }
}

/** Admin routes need the admin role, the ADMIN_SECRET header and ADMIN_DEMO_TOOLS=1 (SYSTEM_DESIGN §7). */
export function requireAdmin(req: FastifyRequest, ctx: Ctx, opts: { demoTool: boolean }): User {
  const u = requireUser(req, ["admin"]);
  const given = String(req.headers["x-admin-secret"] ?? "");
  const want = ctx.cfg.ADMIN_SECRET;
  const ok = given.length === want.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(want));
  if (!ok) throw new AppError(403, "ADMIN_SECRET", "Enter the admin secret to use admin tools.");
  if (opts.demoTool && !ctx.cfg.ADMIN_DEMO_TOOLS) throw new AppError(403, "DEMO_TOOLS_DISABLED", "Demo tools are disabled (ADMIN_DEMO_TOOLS=0).");
  return u;
}
