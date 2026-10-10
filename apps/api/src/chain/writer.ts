import type { FastifyBaseLogger } from "fastify";
import { nowIso, type DB } from "../db";
import { ChainError, type ChainPort, type OutboxPayload } from "./client";

interface OutboxRow {
  id: number;
  assessmentId: string;
  kind: "record" | "supersede";
  payload: string;
  status: string;
  attempts: number;
}

const MAX_ATTEMPTS = 10;

/**
 * Chain writer (SYSTEM_DESIGN §4.7): one worker over `chain_outbox`, oldest first. Idempotent per
 * assessment id (checks `records(id)` before sending), managed nonce, fee cap, exponential
 * backoff, at most 10 attempts. Results never wait for this worker.
 */
export class ChainWriter {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private stopped = false;
  private lastBlock: number | null = null;
  lastError: string | null = null;

  constructor(
    private db: DB,
    private chain: ChainPort,
    private log: FastifyBaseLogger,
    private intervalMs = 2000,
  ) {}

  start() {
    if (this.timer) return;
    this.stopped = false;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    void this.reconcileLocal().then(() => this.tick());
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    while (this.busy) await new Promise((r) => setTimeout(r, 50));
  }

  backlog(): { queued: number; sent: number; retry: number; failed: number; mined: number } {
    const rows = this.db.prepare("SELECT status, COUNT(*) n FROM chain_outbox GROUP BY status").all() as { status: string; n: number }[];
    const out = { queued: 0, sent: 0, retry: 0, failed: 0, mined: 0 } as Record<string, number>;
    for (const r of rows) out[r.status] = r.n;
    return out as ReturnType<ChainWriter["backlog"]>;
  }

  /**
   * Local chain only (31337): a restarted Hardhat node forgets every record. Re-queue receipts
   * marked mined whose record no longer exists, so the local registry matches the database.
   */
  async reconcileLocal() {
    if (this.chain.chainId !== 31337 || !this.chain.registry) return;
    try {
      const st = await this.chain.status();
      if (!st.reachable || !st.registryDeployed) return;
      if (this.lastBlock !== null && st.blockNumber !== null && st.blockNumber >= this.lastBlock) {
        this.lastBlock = st.blockNumber;
        return;
      }
      this.lastBlock = st.blockNumber;
      const mined = this.db.prepare("SELECT assessmentId FROM receipts WHERE chainStatus = 'mined' AND chainId = 31337").all() as { assessmentId: string }[];
      let requeued = 0;
      for (const r of mined) {
        if (await this.chain.isRecorded(r.assessmentId)) continue;
        this.db.transaction(() => {
          this.db
            .prepare("UPDATE receipts SET chainStatus='queued', ethTx=NULL, blockNumber=NULL, gasUsed=NULL, minedAt=NULL WHERE assessmentId=?")
            .run(r.assessmentId);
          this.db
            .prepare("UPDATE chain_outbox SET status='queued', attempts=0, nextAttemptAt=0, lastError=?, txHash=NULL, updatedAt=? WHERE assessmentId=?")
            .run("Re-committing: the local Hardhat chain was reset", nowIso(), r.assessmentId);
        })();
        requeued++;
      }
      if (requeued) this.log.warn({ requeued }, "local chain was reset; re-queued commitments");
    } catch (e) {
      this.log.debug({ err: e }, "reconcile skipped");
    }
  }

  async tick() {
    if (this.busy || this.stopped) return;
    this.busy = true;
    let row: OutboxRow | undefined;
    try {
      await this.reconcileLocal();
      row = this.db
        .prepare(
          "SELECT id, assessmentId, kind, payload, status, attempts FROM chain_outbox WHERE status IN ('queued','retry','sent') AND nextAttemptAt <= ? ORDER BY id LIMIT 1",
        )
        .get(Date.now()) as OutboxRow | undefined;
      if (!row) return;
      const current = row;
      if (!this.chain.canWrite) {
        this.note(row, "Chain writer disabled: set DEPLOYER_PRIVATE_KEY and a registry address (see README).", 30_000, false);
        return;
      }
      const p = JSON.parse(row.payload) as OutboxPayload;
      if (await this.chain.isRecorded(p.id).catch(() => false)) {
        this.markMined(row, null);
        return;
      }
      const res = await this.chain.submit(row.kind, p, (txHash, nonce) => {
        this.db.prepare("UPDATE chain_outbox SET status='sent', txHash=?, nonce=?, updatedAt=? WHERE id=?").run(txHash, nonce, nowIso(), current.id);
        this.db.prepare("UPDATE receipts SET chainStatus='sent', ethTx=? WHERE assessmentId=?").run(txHash, current.assessmentId);
      });
      this.markMined(row, res);
      this.lastError = null;
      this.log.info({ assessmentId: row.assessmentId, kind: row.kind, tx: res.txHash, gasUsed: res.gasUsed, block: res.blockNumber }, "chain.mined");
    } catch (e) {
      if (row) this.handleError(row, e);
    } finally {
      this.busy = false;
    }
  }

  private handleError(row: OutboxRow, e: unknown) {
    const m = e instanceof Error ? e.message : String(e);
    this.lastError = m;
    if (e instanceof ChainError && (e.code === "FEE_CAP" || e.code === "UNREACHABLE")) {
      // Not the transaction's fault: keep it queued and try again later without spending an attempt.
      this.note(row, e.code === "FEE_CAP" ? `Pending: ${m}` : `Chain unreachable, will retry: ${m}`, e.code === "FEE_CAP" ? 15_000 : 5_000, false);
      return;
    }
    const attempts = row.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      this.db.transaction(() => {
        this.db.prepare("UPDATE chain_outbox SET status='failed', attempts=?, lastError=?, updatedAt=? WHERE id=?").run(attempts, m, nowIso(), row.id);
        this.db.prepare("UPDATE receipts SET chainStatus='failed' WHERE assessmentId=?").run(row.assessmentId);
      })();
      this.log.error({ assessmentId: row.assessmentId, err: m }, "chain.failed");
      return;
    }
    const backoff = Math.min(60_000, 1000 * 2 ** attempts);
    this.db
      .prepare("UPDATE chain_outbox SET status='retry', attempts=?, lastError=?, nextAttemptAt=?, updatedAt=? WHERE id=?")
      .run(attempts, m, Date.now() + backoff, nowIso(), row.id);
    this.log.warn({ assessmentId: row.assessmentId, attempts, err: m }, "chain.retry");
  }

  private note(row: OutboxRow, message: string, delayMs: number, countAttempt: boolean) {
    this.db
      .prepare(
        "UPDATE chain_outbox SET lastError=?, nextAttemptAt=?, attempts=attempts+?, status=CASE WHEN status='sent' THEN 'retry' ELSE status END, updatedAt=? WHERE id=?",
      )
      .run(message, Date.now() + delayMs, countAttempt ? 1 : 0, nowIso(), row.id);
  }

  private markMined(row: OutboxRow, res: { txHash: string; blockNumber: number; gasUsed: number } | null) {
    this.db.transaction(() => {
      this.db
        .prepare("UPDATE chain_outbox SET status='mined', lastError=NULL, txHash=COALESCE(?, txHash), updatedAt=? WHERE id=?")
        .run(res?.txHash ?? null, nowIso(), row.id);
      this.db
        .prepare(
          "UPDATE receipts SET chainStatus='mined', ethTx=COALESCE(?, ethTx), blockNumber=COALESCE(?, blockNumber), gasUsed=COALESCE(?, gasUsed), minedAt=? WHERE assessmentId=?",
        )
        .run(res?.txHash ?? null, res?.blockNumber ?? null, res?.gasUsed ?? null, nowIso(), row.assessmentId);
    })();
  }
}
