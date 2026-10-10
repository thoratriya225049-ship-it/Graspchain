import crypto from "node:crypto";
import { canonicalize, rngFromHex, shuffle, type FairMode } from "@graspchain/shared";
import type { Ctx } from "../context";
import { AppError } from "../errors";

export interface TicketRow {
  id: string;
  studentId: string | null;
  articleId: string | null;
  virtual: number;
  joinedAt: number;
  windowId: string | null;
  position: number | null;
  state: "waiting" | "admitted" | "used" | "done" | "expired";
  admittedAt: number | null;
  tokenExpiresAt: number | null;
  usedAt: number | null;
  serviceEndsAt: number | null;
  mode: FairMode;
}

/** Demo-only simulated load (labelled in the UI): virtual clients that hold a slot briefly. */
export const VIRTUAL_COHORT = 9;
export const VIRTUAL_SERVICE_MS = 6000;

/**
 * FairGate (PRD §9.5, SYSTEM_DESIGN §4.2). Tickets joining within the same window are ordered by a
 * seeded shuffle when the window closes (seed = HMAC(QUEUE_SECRET, windowId)); windows are served
 * in order; at most CONCURRENCY sessions hold a slot; admission needs an HMAC token valid for
 * TOKEN_TTL_S. `fifo` mode orders by server arrival time (the baseline). No priority field exists.
 */
export class FairGate {
  private timer: NodeJS.Timeout | null = null;
  /** Start of the current queue "opening" (first join into an empty queue): the burst window starts here. */
  private openedAt: number | null = null;

  constructor(private ctx: Ctx) {}

  start() {
    this.timer = setInterval(() => this.tick(), 250);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private get W() {
    return this.ctx.cfg.WINDOW_MS;
  }
  private get B() {
    return this.ctx.cfg.BURST_WINDOW_MS;
  }

  /** Window that a join at time t falls into: a burst window at queue open, then fixed windows. */
  windowOf(t: number): { id: string; opensAt: number; closesAt: number } {
    const o = this.openedAt ?? t;
    if (t < o + this.B) return { id: `w-${o.toString(36)}-0`, opensAt: o, closesAt: o + this.B };
    const k = 1 + Math.floor((t - o - this.B) / this.W);
    const opensAt = o + this.B + (k - 1) * this.W;
    return { id: `w-${o.toString(36)}-${k}`, opensAt, closesAt: opensAt + this.W };
  }

  private active(): number {
    return (this.ctx.db.prepare("SELECT COUNT(*) n FROM queue_tickets WHERE state IN ('waiting','admitted','used')").get() as { n: number }).n;
  }

  join(studentId: string, articleId: string): TicketRow {
    const { db } = this.ctx;
    const now = this.ctx.now();
    this.tick();
    const open = db
      .prepare("SELECT * FROM queue_tickets WHERE studentId = ? AND state IN ('waiting','admitted') ORDER BY joinedAt DESC LIMIT 1")
      .get(studentId) as TicketRow | undefined;
    if (open) throw new AppError(409, "TICKET_OPEN", "You already have an open ticket.", { ticketId: open.id });

    const mode = this.ctx.settings.get().fairMode;
    if (this.active() === 0) this.openedAt = now;
    const ins = db.prepare("INSERT INTO queue_tickets (id, studentId, articleId, virtual, joinedAt, state, mode) VALUES (?, ?, ?, ?, ?, 'waiting', ?)");
    const id = crypto.randomUUID();
    db.transaction(() => {
      if (this.ctx.settings.get().demoLoad) {
        // Simulated classmates who joined in the same instant (some a few ms earlier on faster links).
        for (let i = 0; i < VIRTUAL_COHORT; i++) ins.run(crypto.randomUUID(), null, null, 1, now - 300 + i * 40, mode);
      }
      ins.run(id, studentId, articleId, 0, now, mode);
    })();
    this.tick();
    return this.get(id)!;
  }

  get(id: string): TicketRow | null {
    return (this.ctx.db.prepare("SELECT * FROM queue_tickets WHERE id = ?").get(id) as TicketRow | undefined) ?? null;
  }

  tick() {
    const { db } = this.ctx;
    const now = this.ctx.now();
    db.transaction(() => {
      db.prepare("UPDATE queue_tickets SET state='expired' WHERE state='admitted' AND virtual=0 AND tokenExpiresAt < ?").run(now);
      db.prepare("UPDATE queue_tickets SET state='done' WHERE state='admitted' AND virtual=1 AND serviceEndsAt <= ?").run(now);

      const pending = db.prepare("SELECT * FROM queue_tickets WHERE state='waiting' AND position IS NULL ORDER BY joinedAt, id").all() as TicketRow[];
      if (pending.length) {
        let next = ((db.prepare("SELECT MAX(position) m FROM queue_tickets").get() as { m: number | null }).m ?? 0) + 1;
        const setPos = db.prepare("UPDATE queue_tickets SET position=?, windowId=? WHERE id=?");
        const fifo = pending.filter((t) => t.mode === "fifo");
        for (const t of fifo) setPos.run(next++, null, t.id);
        const byWindow = new Map<string, { w: ReturnType<FairGate["windowOf"]>; tickets: TicketRow[] }>();
        for (const t of pending.filter((x) => x.mode === "fair")) {
          const w = this.windowOf(t.joinedAt);
          if (w.closesAt > now) continue;
          const entry = byWindow.get(w.id) ?? { w, tickets: [] };
          entry.tickets.push(t);
          byWindow.set(w.id, entry);
        }
        for (const { w, tickets } of [...byWindow.values()].sort((a, b) => a.w.opensAt - b.w.opensAt)) {
          const seed = crypto.createHmac("sha256", this.ctx.cfg.QUEUE_SECRET).update(w.id).digest("hex");
          const order = shuffle(
            [...tickets].sort((a, b) => a.id.localeCompare(b.id)),
            rngFromHex(seed),
          );
          for (const t of order) setPos.run(next++, w.id, t.id);
          const ticketOrder = order.map((t) => t.id);
          db.prepare("INSERT OR IGNORE INTO queue_windows (id, mode, opensAt, closesAt, seed, ticketOrder, hash) VALUES (?, 'fair', ?, ?, ?, ?, ?)").run(
            w.id,
            w.opensAt,
            w.closesAt,
            seed,
            JSON.stringify(ticketOrder),
            crypto
              .createHash("sha256")
              .update(canonicalize({ id: w.id, seed, order: ticketOrder }))
              .digest("hex"),
          );
        }
      }

      let inFlight = (db.prepare("SELECT COUNT(*) n FROM queue_tickets WHERE state IN ('admitted','used')").get() as { n: number }).n;
      const waiting = db.prepare("SELECT * FROM queue_tickets WHERE state='waiting' AND position IS NOT NULL ORDER BY position").all() as TicketRow[];
      const admit = db.prepare("UPDATE queue_tickets SET state='admitted', admittedAt=?, tokenExpiresAt=?, serviceEndsAt=? WHERE id=?");
      for (const t of waiting) {
        if (inFlight >= this.ctx.cfg.CONCURRENCY) break;
        admit.run(now, t.virtual ? null : now + this.ctx.cfg.TOKEN_TTL_S * 1000, t.virtual ? now + VIRTUAL_SERVICE_MS : null, t.id);
        inFlight++;
      }
    })();
    if (this.active() === 0) this.openedAt = null;
  }

  token(t: TicketRow): string | null {
    if (t.state !== "admitted" || t.virtual || !t.tokenExpiresAt) return null;
    const body = `${t.id}.${t.tokenExpiresAt}`;
    return `${body}.${crypto.createHmac("sha256", this.ctx.cfg.QUEUE_SECRET).update(body).digest("base64url")}`;
  }

  /** Validate and consume an admission token for this student. */
  consume(token: string | undefined, studentId: string): TicketRow {
    if (!token) throw new AppError(403, "ADMISSION_REQUIRED", "Join the queue first; starting needs an admission token.");
    const [id, exp, mac] = token.split(".");
    const expected = crypto.createHmac("sha256", this.ctx.cfg.QUEUE_SECRET).update(`${id}.${exp}`).digest("base64url");
    if (!mac || mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) {
      throw new AppError(403, "ADMISSION_INVALID", "This admission token is not valid.");
    }
    this.tick();
    const t = this.get(id);
    if (!t || t.studentId !== studentId) throw new AppError(403, "ADMISSION_INVALID", "This admission token belongs to someone else.");
    if (t.state === "expired" || Number(exp) < this.ctx.now()) throw new AppError(403, "ADMISSION_EXPIRED", "Your slot expired. Rejoin the queue.");
    if (t.state !== "admitted") throw new AppError(403, "ADMISSION_INVALID", `This ticket is ${t.state}.`);
    this.ctx.db.prepare("UPDATE queue_tickets SET state='used', usedAt=? WHERE id=?").run(this.ctx.now(), id);
    return this.get(id)!;
  }

  /** The session holding this slot has finished (DONE/EXPIRED): free it. */
  release(ticketId: string) {
    this.ctx.db.prepare("UPDATE queue_tickets SET state='done', serviceEndsAt=? WHERE id=? AND state IN ('used','admitted')").run(this.ctx.now(), ticketId);
    this.tick();
  }

  leave(ticketId: string, studentId: string) {
    this.ctx.db.prepare("UPDATE queue_tickets SET state='expired' WHERE id=? AND studentId=? AND state IN ('waiting','admitted')").run(ticketId, studentId);
    this.tick();
  }

  view(t: TicketRow) {
    const { db, cfg } = this.ctx;
    const now = this.ctx.now();
    const ahead =
      t.position === null
        ? null
        : (db.prepare("SELECT COUNT(*) n FROM queue_tickets WHERE state='waiting' AND position IS NOT NULL AND position < ?").get(t.position) as { n: number })
            .n;
    const inService = (db.prepare("SELECT COUNT(*) n FROM queue_tickets WHERE state IN ('admitted','used')").get() as { n: number }).n;
    const waitingTotal = (db.prepare("SELECT COUNT(*) n FROM queue_tickets WHERE state='waiting'").get() as { n: number }).n;
    const recent = db
      .prepare(
        "SELECT serviceEndsAt - COALESCE(usedAt, admittedAt) d FROM queue_tickets WHERE state='done' AND serviceEndsAt IS NOT NULL ORDER BY serviceEndsAt DESC LIMIT 20",
      )
      .all() as {
      d: number;
    }[];
    const avgServiceS = recent.length ? recent.reduce((s, r) => s + r.d, 0) / recent.length / 1000 : 60;
    const w = t.mode === "fair" ? this.windowOf(t.joinedAt) : null;
    return {
      ticketId: t.id,
      state: t.state,
      mode: t.mode,
      articleId: t.articleId,
      joinedAt: t.joinedAt,
      windowId: t.windowId ?? w?.id ?? null,
      windowClosesAt: w?.closesAt ?? null,
      position: t.position,
      ahead,
      inService,
      waitingTotal,
      concurrency: cfg.CONCURRENCY,
      estWaitSec: t.state === "waiting" ? Math.max(1, Math.ceil(((ahead ?? waitingTotal) + 1) / cfg.CONCURRENCY) * Math.round(avgServiceS)) : 0,
      admissionToken: this.token(t),
      tokenExpiresAt: t.state === "admitted" ? t.tokenExpiresAt : null,
      demoLoad: this.ctx.settings.get().demoLoad,
      serverNow: now,
    };
  }
}
