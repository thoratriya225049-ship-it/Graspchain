import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { QueueJoinBody, SessionCreateBody, SubmitBody, encodeSse, type EvalEvent } from "@graspchain/shared";
import { requireConsent, requireUser } from "../auth";
import type { Ctx } from "../context";
import { AppError, notFound } from "../errors";
import { articleSummaries, profileOf, snapshotEvents } from "../queries";

const IdParams = z.object({ id: z.string().uuid() });

export const learningRoutes = (ctx: Ctx) => async (app: FastifyInstance) => {
  // ── S2: article picker (never the text) ──
  app.get("/articles", async (req) => {
    const u = requireUser(req);
    const articles = articleSummaries(ctx, u.role === "student" ? u.id : null);
    const recommended = u.role === "student" ? profileOf(ctx, u.id, u).recommendation : null;
    return { articles, recommended };
  });

  // ── S3: FairGate ──
  app.post("/queue/join", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const u = requireUser(req, ["student"]);
    requireConsent(u);
    const { articleId } = QueueJoinBody.parse(req.body);
    if (!ctx.articles.has(articleId)) throw notFound("Article");
    return ctx.fairgate.view(ctx.fairgate.join(u.id, articleId));
  });

  app.get("/queue/:id", async (req) => {
    const u = requireUser(req, ["student"]);
    const { id } = IdParams.parse(req.params);
    ctx.fairgate.tick();
    const t = ctx.fairgate.get(id);
    if (!t || t.studentId !== u.id) throw notFound("Ticket");
    return ctx.fairgate.view(t);
  });

  app.post("/queue/:id/leave", async (req) => {
    const u = requireUser(req, ["student"]);
    const { id } = IdParams.parse(req.params);
    ctx.fairgate.leave(id, u.id);
    return { ok: true };
  });

  // ── S4/S5: session ──
  app.post("/session", async (req) => {
    const u = requireUser(req, ["student"]);
    requireConsent(u);
    const body = SessionCreateBody.parse(req.body);
    const s = ctx.sessions.create(u.id, body.articleId, body.admissionToken);
    return ctx.sessions.view(s);
  });

  app.get("/session/:id", async (req) => {
    const u = requireUser(req, ["student"]);
    const { id } = IdParams.parse(req.params);
    return ctx.sessions.view(ctx.sessions.load(id, u.id));
  });

  app.get("/session/:id/article", async (req, reply) => {
    const u = requireUser(req, ["student"]);
    const { id } = IdParams.parse(req.params);
    reply.header("cache-control", "no-store, max-age=0");
    return ctx.sessions.article(id, u.id);
  });

  app.post("/session/:id/render-ack", async (req) => {
    const u = requireUser(req, ["student"]);
    const { id } = IdParams.parse(req.params);
    return ctx.sessions.renderAck(id, u.id);
  });

  app.post("/session/:id/heartbeat", async (req) => {
    const u = requireUser(req, ["student"]);
    const { id } = IdParams.parse(req.params);
    return ctx.sessions.heartbeat(id, u.id);
  });

  app.post("/session/:id/finish-reading", async (req) => {
    const u = requireUser(req, ["student"]);
    const { id } = IdParams.parse(req.params);
    return ctx.sessions.finishReading(id, u.id);
  });

  /** Demo deployments only: prepared answers (clear, misconception, injection) for the live demo script. */
  app.get("/session/:id/samples", async (req) => {
    const u = requireUser(req, ["student"]);
    const { id } = IdParams.parse(req.params);
    if (!ctx.cfg.ADMIN_DEMO_TOOLS) throw new AppError(404, "NOT_FOUND", "Sample answers are only available on demo deployments.");
    const s = ctx.sessions.load(id, u.id);
    if (s.state !== "WRITING") throw new AppError(409, "BAD_STATE", "Sample answers are available while writing.");
    return { samples: ctx.articles.get(s.articleId)!.samples };
  });

  app.post("/session/:id/submit", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const u = requireUser(req, ["student"]);
    requireConsent(u);
    const { id } = IdParams.parse(req.params);
    const body = SubmitBody.parse(req.body);
    const { attemptId, existing } = ctx.sessions.submit(id, u.id, body);
    if (!(req.headers.accept ?? "").includes("text/event-stream")) return { attemptId, existing };
    return streamAttempt(ctx, req, reply, attemptId);
  });

  /** Re-attach to an attempt's stream (refresh during evaluation). */
  app.get("/result/:id/stream", async (req, reply) => {
    requireUser(req);
    const { id } = IdParams.parse(req.params);
    return streamAttempt(ctx, req, reply, id);
  });
};

/** SSE: `score` → `feedback` (partials, then final) → `xray` → `record` → `done` (SYSTEM_DESIGN §6). */
async function streamAttempt(ctx: Ctx, req: FastifyRequest, reply: FastifyReply, attemptId: string) {
  const u = requireUser(req);
  const owner = ctx.db.prepare("SELECT studentId FROM attempts WHERE id = ?").get(attemptId) as { studentId: string } | undefined;
  if (!owner || (u.role === "student" && owner.studentId !== u.id)) throw new AppError(404, "NOT_FOUND", "Attempt not found.");

  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
    "x-request-id": req.id,
  });
  let closed = false;
  const write = (e: EvalEvent) => {
    if (closed) return;
    res.write(encodeSse(e));
    if (e.type === "done" || e.type === "error") end();
  };
  const ping = setInterval(() => !closed && res.write(": ping\n\n"), 15_000);
  let unsubscribe = () => {};
  const end = () => {
    if (closed) return;
    closed = true;
    clearInterval(ping);
    unsubscribe();
    res.end();
  };
  // The response closing means the client went away (the request emits "close" as soon as its body is read).
  res.on("close", end);

  write({ type: "accepted", data: { attemptId, attemptNo: 0 } });
  const sub = ctx.hub.subscribe(attemptId, write);
  if (sub && (!sub.finished || sub.replay.length)) {
    unsubscribe = sub.unsubscribe;
    for (const e of sub.replay) write(e);
    if (sub.finished) end();
    return;
  }
  // Not running in this process (finished earlier, or interrupted): replay from the database.
  for (const e of snapshotEvents(ctx, attemptId, u)) write(e);
  if (!closed) {
    // Still evaluating in another run (e.g. the startup sweep): poll briefly until it settles.
    const iv = setInterval(() => {
      const again = ctx.hub.subscribe(attemptId, write);
      if (again) {
        clearInterval(iv);
        unsubscribe = again.unsubscribe;
        for (const e of again.replay) write(e);
      }
    }, 1000);
    const prevEnd = unsubscribe;
    unsubscribe = () => {
      clearInterval(iv);
      prevEnd();
    };
  }
}
