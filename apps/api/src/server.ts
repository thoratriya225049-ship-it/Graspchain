import crypto from "node:crypto";
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { loadUser } from "./auth";
import type { Ctx } from "./context";
import { AppError } from "./errors";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { healthRoutes } from "./routes/health";
import { learningRoutes } from "./routes/learning";
import { researchRoutes } from "./routes/research";
import { resultRoutes } from "./routes/results";
import { teacherRoutes } from "./routes/teacher";

/** Build the Fastify app around a context. `index.ts` listens; tests use `app.inject`. */
export async function buildApp(ctx: Ctx, opts: { loggerInstance?: FastifyBaseLogger } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    ...(opts.loggerInstance ? { loggerInstance: opts.loggerInstance } : { logger: false }),
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 64 * 1024,
    trustProxy: true,
  });

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "same-site" } });
  await app.register(cors, { origin: [ctx.cfg.WEB_ORIGIN], credentials: true });
  await app.register(cookie, { secret: ctx.cfg.COOKIE_SECRET });
  await app.register(rateLimit, { global: false });

  // An empty body with a JSON content type (common for action POSTs) means `{}`, not a 400.
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    const text = typeof body === "string" ? body : body.toString("utf8");
    if (!text.trim()) return done(null, {});
    try {
      done(null, JSON.parse(text));
    } catch {
      done(new AppError(400, "INVALID_JSON", "The request body is not valid JSON."), undefined);
    }
  });

  // Plain HTML form posts (e.g. CSV export buttons). SameSite=Lax cookies keep these same-site only.
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(typeof body === "string" ? body : body.toString("utf8"))));
  });

  app.decorateRequest("user", null);
  app.addHook("onRequest", loadUser(ctx));
  app.addHook("onSend", async (req, reply) => {
    reply.header("x-request-id", req.id);
    if (req.url.startsWith("/api/")) reply.header("cache-control", "no-store");
  });

  app.setErrorHandler((err, req, reply) => {
    const e = err as Error & { statusCode?: number; validation?: unknown };
    if (e instanceof AppError) return reply.status(e.status).send({ code: e.code, message: e.message, details: e.details, requestId: req.id });
    if (e instanceof ZodError) {
      const first = e.issues[0];
      return reply
        .status(400)
        .send({ code: "INVALID_BODY", message: `${first?.path.join(".") || "body"}: ${first?.message}`, details: e.issues, requestId: req.id });
    }
    if (e.statusCode === 429)
      return reply.status(429).send({ code: "RATE_LIMITED", message: "Too many requests; wait a minute and try again.", requestId: req.id });
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ code: "BAD_REQUEST", message: e.message, requestId: req.id });
    req.log.error({ err: e }, "unhandled error");
    return reply.status(500).send({ code: "INTERNAL", message: "Something went wrong on our side.", requestId: req.id });
  });
  app.setNotFoundHandler((req, reply) => reply.status(404).send({ code: "NOT_FOUND", message: `No route ${req.method} ${req.url}`, requestId: req.id }));

  await app.register(healthRoutes(ctx));
  await app.register(authRoutes(ctx), { prefix: "/api" });
  await app.register(learningRoutes(ctx), { prefix: "/api" });
  await app.register(resultRoutes(ctx), { prefix: "/api" });
  await app.register(teacherRoutes(ctx), { prefix: "/api" });
  await app.register(researchRoutes(ctx), { prefix: "/api" });
  await app.register(adminRoutes(ctx), { prefix: "/api" });
  return app;
}
