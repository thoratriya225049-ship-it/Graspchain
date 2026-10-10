import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth";
import type { Ctx } from "../context";
import { parse } from "../db";
import { notFound } from "../errors";
import { assertCanSee, currentReceipt, getAttempt, hiddenFor, profileOf, resultPayload, xrayOf } from "../queries";
import { getReceiptRow, verifyServerCopy } from "../trust/receipts";

const IdParams = z.object({ id: z.string().uuid() });
const StudentParams = z.object({ studentId: z.union([z.literal("me"), z.string().uuid()]) });

export const resultRoutes = (ctx: Ctx) => async (app: FastifyInstance) => {
  app.get("/result/:id", async (req) => {
    const u = requireUser(req);
    const { id } = IdParams.parse(req.params);
    return resultPayload(ctx, id, u);
  });

  app.get("/result/:id/xray", async (req) => {
    const u = requireUser(req);
    const { id } = IdParams.parse(req.params);
    return xrayOf(ctx, id, u);
  });

  /** The student's copy of the current receipt, as a download (APP_FLOW §2.10). */
  app.get("/result/:id/receipt", async (req, reply) => {
    const u = requireUser(req);
    const { id } = IdParams.parse(req.params);
    const a = getAttempt(ctx, id);
    assertCanSee(u, a);
    const rc = currentReceipt(ctx, id);
    if (!rc) throw notFound("Receipt");
    if (hiddenFor(ctx, u)) throw notFound("Receipt");
    const original = getReceiptRow(ctx.db, rc.current.assessmentId)!;
    // A tampered server copy is never handed out as the student's receipt.
    const body = original.originalJson ?? original.canonicalJson;
    reply.header("content-type", "application/json; charset=utf-8");
    reply.header("content-disposition", `attachment; filename="graspchain-${rc.current.assessmentId}.json"`);
    return JSON.stringify(parse(body), null, 2);
  });

  /**
   * Public: the server copy of a receipt by assessment id (used by the QR → independent verifier
   * link). Receipts carry no PII: only salted hashes, labels and the score.
   */
  app.get("/receipts/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const row = getReceiptRow(ctx.db, id);
    if (!row) throw notFound("Receipt");
    reply.header("access-control-allow-origin", "*");
    reply.header("content-type", "application/json; charset=utf-8");
    return row.canonicalJson;
  });

  /** S9: V1–V4 against the chain for the server copy (public, no PII). */
  app.get("/verify/:id", async (req) => {
    const { id } = IdParams.parse(req.params);
    return verifyServerCopy(ctx.db, ctx.chain, ctx.cfg.explorerUrl, id);
  });

  app.get("/profile/:studentId", async (req) => {
    const u = requireUser(req);
    const { studentId } = StudentParams.parse(req.params);
    return profileOf(ctx, studentId === "me" ? u.id : studentId, u);
  });
};
