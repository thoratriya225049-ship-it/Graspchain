import {
  IntegrityReportBody,
  articleText,
  assessIntegrity,
  fiveGramOverlap,
  longestSharedRun,
  words,
  type DetailValue,
  type IntegrityAssessment,
  type IntegrityEvent,
  type IntegrityEventType,
  type IntegrityPhase,
  type SessionState,
} from "@graspchain/shared";
import type { Ctx } from "../context";
import { parse } from "../db";
import { AppError } from "../errors";
import type { SessionRow } from "../session/service";

/** Client events accepted per session; beyond this, reports are refused and the flood is recorded once. */
export const MAX_CLIENT_EVENTS = 400;
/** A new page instance arriving after this long without contact means time away was unmonitored. */
const REENTRY_GAP_MS = 10_000;
/** The page reports every 20 s (hidden tabs may be throttled to once a minute). */
const SAME_CLIENT_GAP_MS = 75_000;
/** A second instance must be established this long before an older one reporting counts as two tabs. */
const MULTI_TAB_SETTLE_MS = 3_000;
const PASTE_ARTICLE_OVERLAP = 0.3;
const PASTE_ARTICLE_RUN = 8;
const PASTE_LARGE_WORDS = 25;

interface ClientRow {
  sessionId: string;
  clientId: string;
  firstSeenAt: number;
  lastSeenAt: number;
  lastSeqReported: number;
  lastVisibility: string;
}

interface EventRow {
  id: number;
  sessionId: string;
  clientId: string | null;
  seq: number | null;
  type: IntegrityEventType;
  source: "client" | "server";
  phase: IntegrityPhase;
  at: number;
  clientAt: number | null;
  detail: string;
}

const ACTIVE: SessionState[] = ["CREATED", "READING", "WRITING"];
const phaseOf = (state: SessionState): IntegrityPhase => (state === "CREATED" || state === "READING" ? "reading" : state === "WRITING" ? "writing" : "other");
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Integrity monitoring, server side. The browser monitor reports what only a browser can see
 * (focus, visibility, clipboard, keys); the server records what it can see itself (article
 * requests after close, page instances, gaps, malformed or missing reports) — those cannot be
 * hidden by a modified client. Severity is never taken from the client: the shared, published
 * rules in @graspchain/shared/integrity decide it from the stored facts.
 */
export class IntegrityService {
  constructor(private ctx: Ctx) {}

  /** Record a server-observed event. */
  record(sessionId: string, type: IntegrityEventType, detail: Record<string, DetailValue> = {}, phase?: IntegrityPhase) {
    const s = this.ctx.db.prepare("SELECT state FROM sessions WHERE id = ?").get(sessionId) as { state: SessionState } | undefined;
    if (!s) return;
    this.ctx.db
      .prepare(
        "INSERT INTO integrity_events (sessionId, clientId, seq, type, source, phase, at, clientAt, detail) VALUES (?, NULL, NULL, ?, 'server', ?, ?, NULL, ?)",
      )
      .run(sessionId, type, phase ?? phaseOf(s.state), this.ctx.now(), JSON.stringify(detail));
  }

  private countServer(sessionId: string, type: IntegrityEventType, reason?: string): number {
    const rows = this.ctx.db.prepare("SELECT detail FROM integrity_events WHERE sessionId = ? AND type = ? AND source = 'server'").all(sessionId, type) as {
      detail: string;
    }[];
    return reason ? rows.filter((r) => parse<Record<string, unknown>>(r.detail).reason === reason).length : rows.length;
  }

  /**
   * POST /api/session/:id/integrity — the monitor's report, which is also the heartbeat.
   * Validation failures are themselves recorded: our page never sends a malformed report.
   */
  ingest(s: SessionRow, raw: unknown): { received: number[]; state: SessionState } {
    const { db } = this.ctx;
    const now = this.ctx.now();
    const parsed = IntegrityReportBody.safeParse(raw);
    if (!parsed.success) {
      if (this.countServer(s.id, "SESSION_TAMPERING", "malformed_report") < 5)
        this.record(s.id, "SESSION_TAMPERING", { reason: "malformed_report", issue: parsed.error.issues[0]?.message.slice(0, 120) ?? "invalid" });
      throw new AppError(400, "BAD_INTEGRITY_REPORT", "Malformed integrity report.");
    }
    const body = parsed.data;
    const active = ACTIVE.includes(s.state);
    const tx = db.transaction(() => {
      const client = db.prepare("SELECT * FROM integrity_clients WHERE sessionId = ? AND clientId = ?").get(s.id, body.clientId) as ClientRow | undefined;
      const others = db.prepare("SELECT * FROM integrity_clients WHERE sessionId = ? AND clientId != ?").all(s.id, body.clientId) as ClientRow[];

      if (active) {
        // Time with no contact: a new page instance after the student left, or one instance going quiet.
        if (!client && others.length) {
          const lastContact = Math.max(...others.map((o) => o.lastSeenAt));
          const gap = now - lastContact;
          if (gap > REENTRY_GAP_MS) this.record(s.id, "UNMONITORED_GAP", { gapMs: gap, kind: "reentry" });
        } else if (client && now - client.lastSeenAt > SAME_CLIENT_GAP_MS && client.lastVisibility !== "hidden") {
          // A hidden tab is covered by its TAB_SWITCH event; only a visible page going silent is a gap.
          this.record(s.id, "UNMONITORED_GAP", { gapMs: now - client.lastSeenAt, kind: "silent" });
        }
        // Two tabs: an older instance still reporting after a newer one has established itself.
        const firstSeen = client?.firstSeenAt ?? now;
        const newer = others.filter((o) => o.firstSeenAt > firstSeen && now - o.firstSeenAt > MULTI_TAB_SETTLE_MS);
        if (newer.length && this.countServer(s.id, "MULTIPLE_TAB") === 0) this.record(s.id, "MULTIPLE_TAB", { instances: others.length + 1 });
      }

      if (client)
        db.prepare(
          "UPDATE integrity_clients SET lastSeenAt = ?, lastSeqReported = MAX(lastSeqReported, ?), lastVisibility = ? WHERE sessionId = ? AND clientId = ?",
        ).run(now, body.lastSeq, body.visibility, s.id, body.clientId);
      else
        db.prepare(
          "INSERT INTO integrity_clients (sessionId, clientId, firstSeenAt, lastSeenAt, lastSeqReported, lastVisibility) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(s.id, body.clientId, now, now, body.lastSeq, body.visibility);

      const stored = (db.prepare("SELECT COUNT(*) n FROM integrity_events WHERE sessionId = ? AND source = 'client'").get(s.id) as { n: number }).n;
      const ins = db.prepare(
        "INSERT OR IGNORE INTO integrity_events (sessionId, clientId, seq, type, source, phase, at, clientAt, detail) VALUES (?, ?, ?, ?, 'client', ?, ?, ?, ?)",
      );
      const received: number[] = [];
      let room = MAX_CLIENT_EVENTS - stored;
      for (const e of body.events) {
        if (room <= 0) {
          if (this.countServer(s.id, "SESSION_TAMPERING", "event_flood") === 0) this.record(s.id, "SESSION_TAMPERING", { reason: "event_flood" });
          break;
        }
        const { type, detail } = this.analyse(s, e.type, e.detail);
        // The server's state bounds the phase: while READING nothing can be "writing"; while WRITING a
        // "reading" event is a late flush from before the close; after submission everything is "other".
        const phase: IntegrityPhase = s.state === "CREATED" || s.state === "READING" ? "reading" : s.state === "WRITING" ? e.phase : "other";
        const r = ins.run(s.id, body.clientId, e.seq, type, phase, now, Math.round(e.clientAt), JSON.stringify(detail));
        if (r.changes) room--;
        received.push(e.seq);
      }
      if (active) db.prepare("UPDATE sessions SET lastSeenAt = ? WHERE id = ?").run(now, s.id);
      return received;
    });
    return { received: tx(), state: s.state };
  }

  /** Server-side analysis of client facts; e.g. a paste attempt is compared with the article here. */
  private analyse(
    s: SessionRow,
    type: IntegrityEventType,
    raw: Record<string, DetailValue>,
  ): { type: IntegrityEventType; detail: Record<string, DetailValue> } {
    const detail: Record<string, DetailValue> = {};
    for (const [k, v] of Object.entries(raw))
      detail[k] = typeof v === "number" ? clamp(Math.round(v), -86_400_000, 86_400_000) : typeof v === "string" ? v.slice(0, 120) : v;
    if (type !== "PASTE_ATTEMPT") return { type, detail };
    // The pasted text is compared with the article and then discarded: only the measurements are kept.
    const sample = typeof raw.sample === "string" ? raw.sample : "";
    delete detail.sample;
    const source = articleText(this.ctx.articles.get(s.articleId)!);
    const n = words(sample).length;
    const overlap = fiveGramOverlap(sample, source);
    const run = longestSharedRun(sample, source);
    const matchesArticle = (n >= 5 && overlap >= PASTE_ARTICLE_OVERLAP) || run >= PASTE_ARTICLE_RUN;
    Object.assign(detail, { words: n, chars: sample.length, articleOverlap: Math.round(overlap * 100) / 100, longestArticleRun: run, matchesArticle });
    return { type: matchesArticle || n >= PASTE_LARGE_WORDS ? "SUSPICIOUS_PASTE" : "PASTE_ATTEMPT", detail };
  }

  events(sessionId: string, until?: number | null): IntegrityEvent[] {
    const rows = this.ctx.db.prepare("SELECT * FROM integrity_events WHERE sessionId = ? ORDER BY at, id").all(sessionId) as EventRow[];
    return rows
      .filter((r) => until == null || r.at <= until)
      .map((r) => ({
        id: r.id,
        type: r.type,
        source: r.source,
        phase: r.phase,
        at: r.at,
        clientAt: r.clientAt,
        clientId: r.clientId,
        seq: r.seq,
        detail: parse<Record<string, DetailValue>>(r.detail),
      }));
  }

  /** The integrity assessment for an attempt, from stored facts only (deterministic, re-runnable). */
  assess(i: { sessionId: string; seeded: boolean; wordCount: number; answerOverlap5: number }): { assessment: IntegrityAssessment; events: IntegrityEvent[] } {
    const s = this.ctx.db.prepare("SELECT hiddenAt, submittedAt FROM sessions WHERE id = ?").get(i.sessionId) as {
      hiddenAt: number | null;
      submittedAt: number | null;
    };
    const events = this.events(i.sessionId, s.submittedAt);
    const clients = (this.ctx.db.prepare("SELECT clientId, lastSeqReported FROM integrity_clients WHERE sessionId = ?").all(i.sessionId) as ClientRow[]).map(
      (c) => ({
        clientId: c.clientId,
        lastSeqReported: c.lastSeqReported,
        receivedSeqs: (
          this.ctx.db.prepare("SELECT seq FROM integrity_events WHERE sessionId = ? AND clientId = ? AND seq IS NOT NULL").all(i.sessionId, c.clientId) as {
            seq: number;
          }[]
        ).map((r) => r.seq),
      }),
    );
    const writingMs = s.hiddenAt !== null && s.submittedAt !== null ? Math.max(0, s.submittedAt - s.hiddenAt) : null;
    const assessment = assessIntegrity({ events, seeded: i.seeded, wordCount: i.wordCount, writingMs, answerOverlap5: i.answerOverlap5, clients });
    return { assessment, events };
  }
}
