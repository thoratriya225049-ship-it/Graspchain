import crypto from "node:crypto";
import { MAX_WORDS, MIN_WORDS, computeDeadline, wordCount, type ClockMode, type FairMode, type SessionState, type SubmitInput } from "@graspchain/shared";
import type { Ctx } from "../context";
import { defaultReadSeconds } from "../content";
import { nowIso } from "../db";
import { AppError, notFound } from "../errors";

export interface SessionRow {
  id: string;
  studentId: string;
  articleId: string;
  state: SessionState;
  readSeconds: number;
  sentAt: number | null;
  ackAt: number | null;
  readDeadline: number | null;
  clockMode: ClockMode;
  latencyCompMs: number;
  measuredDelayMs: number | null;
  admissionMode: FairMode;
  ticketId: string | null;
  windowId: string | null;
  pasteCount: number;
  blurCount: number;
  copyCount: number;
  articleFetches: number;
  hiddenAt: number | null;
  lastSeenAt: number | null;
  createdAt: number;
  updatedAt: number;
}

const CREATED_TTL_MS = 10 * 60_000;

/**
 * Session state machine (SYSTEM_DESIGN §4.1):
 * CREATED ─(GET article)→ READING ─(finish | deadline)→ WRITING ─(submit)→ EVALUATING → DONE; ttl → EXPIRED.
 * Every transition is a guarded UPDATE … WHERE state = ? (optimistic concurrency). The article is
 * served only while READING and before the server's deadline; afterwards 403 ARTICLE_HIDDEN forever.
 */
export class SessionService {
  private timer: NodeJS.Timeout | null = null;
  constructor(private ctx: Ctx) {}

  start() {
    this.timer = setInterval(() => this.sweep(), 5000);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private row(id: string): SessionRow | null {
    return (this.ctx.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined) ?? null;
  }

  /** Load a session owned by `studentId`, applying any deadline/TTL transition first. */
  load(id: string, studentId: string): SessionRow {
    const s = this.row(id);
    if (!s || s.studentId !== studentId) throw notFound("Session");
    return this.settle(s);
  }

  private transition(s: SessionRow, from: SessionState, to: SessionState, extra: Record<string, unknown> = {}): boolean {
    const sets = Object.keys(extra).map((k) => `${k} = @${k}`);
    const r = this.ctx.db
      .prepare(`UPDATE sessions SET state = @to, updatedAt = @now${sets.length ? ", " + sets.join(", ") : ""} WHERE id = @id AND state = @from`)
      .run({ ...extra, to, from, id: s.id, now: this.ctx.now() });
    return r.changes === 1;
  }

  /**
   * Deadline passed → WRITING; abandoned sessions → EXPIRED (and their FairGate slot is released).
   * Abandoned = never opened, past the writing window, or no client heartbeat for SESSION_IDLE_S
   * (a closed tab must not hold one of the CONCURRENCY slots).
   */
  settle(s: SessionRow): SessionRow {
    const now = this.ctx.now();
    const idle = now - (s.lastSeenAt ?? s.createdAt) > this.ctx.cfg.SESSION_IDLE_S * 1000;
    if (s.state === "READING" && s.readDeadline !== null && now >= s.readDeadline) {
      this.transition(s, "READING", "WRITING", { hiddenAt: s.readDeadline });
      s = this.row(s.id)!;
    }
    if (s.state === "CREATED" && now - s.createdAt > CREATED_TTL_MS) this.expire(s, "CREATED");
    else if ((s.state === "READING" || s.state === "WRITING") && idle) this.expire(s, s.state);
    else if (s.state === "WRITING" && s.readDeadline !== null && now > s.readDeadline + this.ctx.cfg.WRITE_TTL_MIN * 60_000) this.expire(s, "WRITING");
    return this.row(s.id)!;
  }

  /** The reading/writing page pings every 30 s. */
  heartbeat(id: string, studentId: string) {
    const s = this.load(id, studentId);
    if (s.state === "CREATED" || s.state === "READING" || s.state === "WRITING") this.touch(id);
    return this.view(this.row(id)!);
  }

  private touch(id: string) {
    this.ctx.db.prepare("UPDATE sessions SET lastSeenAt = ? WHERE id = ?").run(this.ctx.now(), id);
  }

  private expire(s: SessionRow, from: SessionState) {
    if (this.transition(s, from, "EXPIRED") && s.ticketId) this.ctx.fairgate.release(s.ticketId);
  }

  sweep() {
    const rows = this.ctx.db.prepare("SELECT * FROM sessions WHERE state IN ('CREATED','READING','WRITING')").all() as SessionRow[];
    for (const s of rows) this.settle(s);
  }

  create(studentId: string, articleId: string, admissionToken: string | undefined): SessionRow {
    const article = this.ctx.articles.get(articleId);
    if (!article) throw notFound("Article");
    const ticket = this.ctx.fairgate.consume(admissionToken, studentId);
    if (ticket.articleId && ticket.articleId !== articleId)
      throw new AppError(400, "ADMISSION_ARTICLE", "This admission token was issued for a different article.");
    const settings = this.ctx.settings.get();
    const now = this.ctx.now();
    const id = crypto.randomUUID();
    this.ctx.db
      .prepare(
        `INSERT INTO sessions (id, studentId, articleId, state, readSeconds, clockMode, admissionMode, ticketId, windowId, createdAt, updatedAt)
         VALUES (?, ?, ?, 'CREATED', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        studentId,
        articleId,
        settings.readSecondsOverride ?? defaultReadSeconds(article),
        settings.clockMode,
        ticket.mode,
        ticket.id,
        ticket.windowId,
        now,
        now,
      );
    this.touch(id);
    return this.row(id)!;
  }

  /** GET /session/:id/article. The first fetch records `sentAt` (FairClock step 1). */
  article(id: string, studentId: string) {
    let s = this.load(id, studentId);
    const now = this.ctx.now();
    if (s.state === "CREATED") {
      const { deadline } = computeDeadline(now, null, s.readSeconds, { capS: this.ctx.cfg.FAIRCLOCK_CAP_S, mode: s.clockMode });
      this.transition(s, "CREATED", "READING", { sentAt: now, readDeadline: deadline });
      s = this.row(id)!;
    }
    if (s.state !== "READING" || s.readDeadline === null || now >= s.readDeadline) {
      throw new AppError(403, "ARTICLE_HIDDEN", "The reading time is over; the article is no longer available.");
    }
    this.ctx.db.prepare("UPDATE sessions SET articleFetches = articleFetches + 1, lastSeenAt = ? WHERE id = ?").run(now, id);
    const a = this.ctx.articles.get(s.articleId)!;
    return {
      title: a.title,
      sentences: a.sentences,
      breaks: a.breaks,
      wordCount: wordCount(a.sentences.join(" ")),
      sentAt: s.sentAt!,
      readDeadline: s.readDeadline,
      readSeconds: s.readSeconds,
      clockMode: s.clockMode,
      serverNow: now,
    };
  }

  /** POST /session/:id/render-ack (FairClock steps 2–4). Only the first ack counts. */
  renderAck(id: string, studentId: string) {
    const s = this.load(id, studentId);
    if (s.state !== "READING") throw new AppError(409, "BAD_STATE", `Session is ${s.state}.`);
    if (s.ackAt === null) {
      const ackAt = this.ctx.now();
      const { deadline, latencyCompMs } = computeDeadline(s.sentAt!, ackAt, s.readSeconds, { capS: this.ctx.cfg.FAIRCLOCK_CAP_S, mode: s.clockMode });
      this.ctx.db
        .prepare(
          "UPDATE sessions SET ackAt = ?, readDeadline = ?, latencyCompMs = ?, measuredDelayMs = ?, updatedAt = ?, lastSeenAt = ? WHERE id = ? AND state = 'READING' AND ackAt IS NULL",
        )
        .run(ackAt, deadline, latencyCompMs, ackAt - s.sentAt!, ackAt, ackAt, id);
    }
    return this.view(this.row(id)!);
  }

  finishReading(id: string, studentId: string) {
    const s = this.load(id, studentId);
    this.touch(id);
    if (s.state === "READING") this.transition(s, "READING", "WRITING", { hiddenAt: this.ctx.now() });
    else if (s.state !== "WRITING") throw new AppError(409, "BAD_STATE", `Session is ${s.state}.`);
    return this.view(this.row(id)!);
  }

  /**
   * Accept an answer (idempotent). A replayed key — or any second submit for the same session,
   * e.g. from another tab — returns the existing attempt instead of creating a new one.
   */
  submit(id: string, studentId: string, body: SubmitInput): { attemptId: string; existing: boolean } {
    const { db } = this.ctx;
    const s = this.load(id, studentId);
    const prior = db.prepare("SELECT id FROM attempts WHERE sessionId = ? ORDER BY createdAt LIMIT 1").get(id) as { id: string } | undefined;
    if (prior) return { attemptId: prior.id, existing: true };
    if (s.state !== "WRITING")
      throw new AppError(
        409,
        s.state === "READING" ? "STILL_READING" : "BAD_STATE",
        s.state === "READING" ? "Finish reading first." : `Session is ${s.state}.`,
      );
    const words = wordCount(body.answer);
    if (words < MIN_WORDS || words > MAX_WORDS)
      throw new AppError(422, "WORD_COUNT", `Answers must be ${MIN_WORDS}–${MAX_WORDS} words (this one has ${words}).`);

    const attemptId = crypto.randomUUID();
    const now = nowIso();
    const ok = db.transaction(() => {
      if (!this.transition(s, "WRITING", "EVALUATING", { pasteCount: body.pasteCount, blurCount: body.blurCount, copyCount: body.copyCount })) return false;
      const attemptNo =
        (db.prepare("SELECT COUNT(*) n FROM attempts WHERE studentId = ? AND articleId = ?").get(studentId, s.articleId) as { n: number }).n + 1;
      db.prepare(
        `INSERT INTO attempts (id, sessionId, studentId, articleId, attemptNo, answerText, wordCount, idempotencyKey, recordSalt, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'evaluating', ?, ?)`,
      ).run(attemptId, id, studentId, s.articleId, attemptNo, body.answer, words, body.idempotencyKey, crypto.randomBytes(16).toString("hex"), now, now);
      return true;
    })();
    if (!ok) {
      const again = db.prepare("SELECT id FROM attempts WHERE sessionId = ?").get(id) as { id: string } | undefined;
      if (again) return { attemptId: again.id, existing: true };
      throw new AppError(409, "BAD_STATE", "The session changed while submitting; reload.");
    }
    this.ctx.evaluator.run(attemptId);
    return { attemptId, existing: false };
  }

  view(s: SessionRow) {
    const attempt = this.ctx.db.prepare("SELECT id FROM attempts WHERE sessionId = ?").get(s.id) as { id: string } | undefined;
    return {
      sessionId: s.id,
      articleId: s.articleId,
      state: s.state,
      readSeconds: s.readSeconds,
      readDeadline: s.readDeadline,
      sentAt: s.sentAt,
      ackAt: s.ackAt,
      clockMode: s.clockMode,
      latencyCompMs: s.latencyCompMs,
      measuredDelayMs: s.measuredDelayMs,
      admissionMode: s.admissionMode,
      windowId: s.windowId,
      attemptId: attempt?.id ?? null,
      serverNow: this.ctx.now(),
    };
  }
}
