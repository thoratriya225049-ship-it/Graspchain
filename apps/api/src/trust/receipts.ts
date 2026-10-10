import crypto from "node:crypto";
import {
  RECEIPT_SCHEMA,
  canonicalReceiptJson,
  canonicalize,
  hashReceipt,
  runChecks,
  scoreX10,
  sha256Hex,
  type Feedback,
  type Receipt,
  type ReceiptIntegrity,
  type ScorePayload,
} from "@graspchain/shared";
import { nowIso, parse, type DB } from "../db";
import type { ChainPort, OutboxPayload } from "../chain/client";
import { notFound } from "../errors";

export interface ReceiptInput {
  assessmentId?: string;
  studentRef: string;
  articleId: string;
  articleHash: string;
  answerHash: string;
  attemptNo: number;
  rubricVersion: number;
  promptHash: string;
  models: { jev: string; llm: string };
  score: ScorePayload;
  evidence?: Receipt["assessment"]["evidence"];
  integrity?: ReceiptIntegrity;
  feedback: Feedback;
  fairness: Receipt["fairness"];
  createdAt: string;
}

/** Build the `graspchain.receipt/1` document (PRD §9.4.2). Floats are rounded when hashed. */
export async function buildReceipt(i: ReceiptInput): Promise<Receipt> {
  return {
    schema: RECEIPT_SCHEMA,
    assessmentId: i.assessmentId ?? crypto.randomUUID(),
    supersedes: null,
    studentRef: i.studentRef,
    articleId: i.articleId,
    articleHash: i.articleHash,
    answerHash: i.answerHash,
    attemptNo: i.attemptNo,
    assessment: {
      rubricVersion: i.rubricVersion,
      promptHash: i.promptHash,
      models: i.models,
      segmentation: i.score.segmentation,
      labels: i.score.labels,
      claimSummary: i.score.claimSummary,
      dimensions: i.score.dimensions,
      finalScore: i.score.finalScore,
      lowConfidence: i.score.lowConfidence,
      flags: { injectionSuspected: i.score.flags.injectionSuspected, pasteCount: i.score.flags.pasteCount, blurCount: i.score.flags.blurCount },
      feedbackHash: await sha256Hex(canonicalize(i.feedback)),
      review: null,
      ...(i.evidence ? { evidence: i.evidence } : {}),
      ...(i.integrity ? { integrity: i.integrity } : {}),
    },
    fairness: i.fairness,
    createdAt: i.createdAt,
  };
}

const payloadOf = (r: Receipt, recordHash: string): OutboxPayload => ({
  id: r.assessmentId,
  recordHash,
  studentRef: r.studentRef,
  scoreX10: scoreX10(r.assessment.finalScore),
  rubricVersion: r.assessment.rubricVersion,
  oldId: r.supersedes,
});

/** Insert the receipt and its outbox row in one transaction (SYSTEM_DESIGN §4.6). Never waits for the chain. */
export async function commitReceipt(db: DB, attemptId: string, receipt: Receipt, chainId: number): Promise<{ recordHash: string }> {
  const recordHash = await hashReceipt(receipt);
  const now = nowIso();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO receipts (assessmentId, attemptId, supersedes, canonicalJson, recordHash, chainStatus, chainId, createdAt)
       VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)`,
    ).run(receipt.assessmentId, attemptId, receipt.supersedes, canonicalReceiptJson(receipt), recordHash, chainId, now);
    db.prepare(
      `INSERT INTO chain_outbox (assessmentId, kind, oldId, payload, status, attempts, nextAttemptAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'queued', 0, 0, ?, ?)`,
    ).run(receipt.assessmentId, receipt.supersedes ? "supersede" : "record", receipt.supersedes, JSON.stringify(payloadOf(receipt, recordHash)), now, now);
    if (receipt.supersedes) db.prepare("UPDATE receipts SET supersededBy = ? WHERE assessmentId = ?").run(receipt.assessmentId, receipt.supersedes);
  })();
  return { recordHash };
}

export interface ReceiptRow {
  assessmentId: string;
  attemptId: string;
  supersedes: string | null;
  supersededBy: string | null;
  canonicalJson: string;
  recordHash: string;
  ethTx: string | null;
  gasUsed: number | null;
  blockNumber: number | null;
  minedAt: string | null;
  chainId: number | null;
  chainStatus: string;
  tamperedField: string | null;
  tamperedAt: string | null;
  originalJson: string | null;
  createdAt: string;
}

export function getReceiptRow(db: DB, assessmentId: string): ReceiptRow | null {
  return (db.prepare("SELECT * FROM receipts WHERE assessmentId = ?").get(assessmentId) as ReceiptRow | undefined) ?? null;
}

/** The lineage of versions for an attempt, oldest first. */
export function lineage(db: DB, attemptId: string) {
  return (
    db
      .prepare(
        "SELECT assessmentId, supersedes, supersededBy, chainStatus, createdAt, canonicalJson FROM receipts WHERE attemptId = ? ORDER BY createdAt, rowid",
      )
      .all(attemptId) as Pick<ReceiptRow, "assessmentId" | "supersedes" | "supersededBy" | "chainStatus" | "createdAt" | "canonicalJson">[]
  ).map((r) => {
    const rc = parse<Receipt>(r.canonicalJson);
    return {
      assessmentId: r.assessmentId,
      supersedes: r.supersedes,
      supersededBy: r.supersededBy,
      chainStatus: r.chainStatus,
      createdAt: r.createdAt,
      finalScore: rc.assessment.finalScore,
      review: rc.assessment.review,
    };
  });
}

/** Server-copy verification (GET /api/verify/:id): recompute the hash of what we hold and ask the chain. */
export async function verifyServerCopy(db: DB, chain: ChainPort, explorerUrl: string | null, assessmentId: string) {
  const row = getReceiptRow(db, assessmentId);
  if (!row) throw notFound("Assessment");
  const receipt = parse<Receipt>(row.canonicalJson);
  const computedHash = await hashReceipt(receipt);
  const view = await chain.view(assessmentId, receipt.supersedes, computedHash);
  const ob = db.prepare("SELECT status, lastError FROM chain_outbox WHERE assessmentId = ? ORDER BY id DESC LIMIT 1").get(assessmentId) as
    { status: "queued" | "sent" | "retry" | "mined" | "failed"; lastError: string | null } | undefined;
  const result = runChecks(receipt, computedHash, view, ob ?? null);
  return {
    assessmentId,
    attemptId: row.attemptId,
    receipt,
    computedHash,
    storedHash: row.recordHash,
    chain: view,
    ...result,
    chainStatus: row.chainStatus,
    tx: row.ethTx
      ? {
          hash: row.ethTx,
          blockNumber: row.blockNumber,
          gasUsed: row.gasUsed,
          minedAt: row.minedAt,
          url: explorerUrl ? `${explorerUrl}/tx/${row.ethTx}` : null,
        }
      : null,
    registryUrl: explorerUrl && chain.registry ? `${explorerUrl}/address/${chain.registry}` : null,
    tampered: row.tamperedField ? { field: row.tamperedField, at: row.tamperedAt } : null,
    lineage: lineage(db, row.attemptId),
  };
}
