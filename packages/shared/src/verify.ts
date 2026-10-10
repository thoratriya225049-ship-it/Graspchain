import { scoreX10 } from "./canonical";
import type { ChainView, Receipt, VerificationCheck, VerificationStatus } from "./types";

export interface OutboxHint {
  status: "queued" | "sent" | "retry" | "mined" | "failed";
  lastError: string | null;
}

const MEANING = {
  V1: "The receipt has not been altered since it was committed on-chain.",
  V2: "The score shown equals the score committed on-chain.",
  V3: "The entry and reading-time policy that applied is on record.",
  V4: "Corrections are new records linked to the original, never silent edits.",
};

/**
 * Pure verification logic (PRD §9.4.5). Our Verify page and the static verifier both call this
 * with a hash they computed themselves and facts they read from the chain themselves.
 */
export function runChecks(
  receipt: Receipt,
  computedHash: string,
  chain: ChainView,
  outbox?: OutboxHint | null,
): { status: VerificationStatus; checks: VerificationCheck[] } {
  const rec = chain.record;
  const unreachable = !chain.reachable;

  const notYet = outbox
    ? outbox.status === "failed"
      ? `Not on-chain: the chain writer gave up (${outbox.lastError ?? "unknown error"}).`
      : `Not yet on-chain: the commitment is ${outbox.status === "sent" ? "sent and awaiting a block" : "queued in the outbox"}${outbox.lastError ? ` (${outbox.lastError})` : ""}.`
    : "Not yet on-chain: no record exists for this id. A new receipt can take a few seconds to be mined; if this persists, the id was never committed.";

  const v1: VerificationCheck = {
    id: "V1",
    title: "Record integrity",
    meaning: MEANING.V1,
    state: unreachable ? "unavailable" : !rec ? "pending" : chain.verifies ? "pass" : "fail",
    detail: unreachable
      ? `The chain could not be reached${chain.error ? `: ${chain.error}` : ""}.`
      : !rec
        ? notYet
        : chain.verifies
          ? "verify(id, hash) returned true: the hash recomputed from this receipt is the one on-chain."
          : "verify(id, hash) returned false: this receipt's hash differs from the one committed on-chain.",
  };

  const x10 = scoreX10(receipt.assessment.finalScore);
  const v2: VerificationCheck = {
    id: "V2",
    title: "Score match",
    meaning: MEANING.V2,
    state: unreachable ? "unavailable" : !rec ? "pending" : rec.scoreX10 === x10 ? "pass" : "fail",
    detail: rec
      ? `On-chain ${(rec.scoreX10 / 10).toFixed(1)} · receipt ${receipt.assessment.finalScore.toFixed(1)}`
      : "Nothing on-chain to compare against yet.",
  };

  const f = receipt.fairness;
  const fairnessValid =
    !!f &&
    (f.admissionMode === "fair" || f.admissionMode === "fifo") &&
    (f.clockMode === "fair" || f.clockMode === "naive") &&
    Number.isFinite(f.readSecondsGranted) &&
    f.readSecondsGranted > 0 &&
    Number.isFinite(f.latencyCompMs) &&
    f.latencyCompMs >= 0;
  const v3: VerificationCheck = {
    id: "V3",
    title: "Fairness record",
    meaning: MEANING.V3,
    state: fairnessValid ? "pass" : "fail",
    detail: fairnessValid
      ? `Entry: ${f.admissionMode === "fair" ? `windowed random order${f.admissionWindowId ? ` (${f.admissionWindowId})` : ""}` : "arrival order"} · clock: ${
          f.clockMode === "fair" ? `delivery-compensated (+${(f.latencyCompMs / 1000).toFixed(1)} s)` : "server time only"
        } · ${f.readSecondsGranted} s granted`
      : "The fairness block is missing or malformed.",
  };

  let v4: VerificationCheck;
  if (receipt.supersedes) {
    v4 = {
      id: "V4",
      title: "Correction lineage",
      meaning: MEANING.V4,
      state: unreachable ? "unavailable" : !rec ? "pending" : chain.lineageLinked && chain.oldExists ? "pass" : "fail",
      detail:
        chain.lineageLinked && chain.oldExists
          ? `AssessmentSuperseded links ${receipt.supersedes.slice(0, 8)}… to this record on-chain.`
          : rec
            ? "No AssessmentSuperseded event links this record to the one it claims to supersede."
            : "Waiting for the correction to be mined.",
    };
  } else {
    v4 = {
      id: "V4",
      title: "Correction lineage",
      meaning: MEANING.V4,
      state: "not_applicable",
      detail: chain.supersededBy
        ? `A teacher correction superseded this record (${chain.supersededBy.slice(0, 8)}…). This record still verifies as the original.`
        : "This is an original record; it does not supersede another.",
    };
  }

  const checks = [v1, v2, v3, v4];
  let status: VerificationStatus;
  if (unreachable) status = "unavailable";
  else if (checks.some((c) => c.state === "fail")) status = "tampered";
  else if (!rec) status = "not_found";
  else if (checks.some((c) => c.state === "pending")) status = "pending";
  else if (chain.supersededBy) status = "superseded";
  else status = "verified";
  return { status, checks };
}

export const STATUS_COPY: Record<VerificationStatus, { title: string; body: string }> = {
  verified: { title: "Verified on-chain", body: "Every applicable check passed against AssessmentRegistry." },
  pending: { title: "Commitment pending", body: "Part of the record is not on-chain yet. It is not verified until it is." },
  tampered: { title: "Does not match the chain", body: "At least one check failed. This copy differs from what was committed." },
  superseded: {
    title: "Verified · superseded",
    body: "This record is authentic, and a teacher correction replaced it. Check the newer receipt for the current score.",
  },
  not_found: {
    title: "Not yet on-chain",
    body: "The registry has no record for this id yet. New receipts are mined within seconds once the chain writer is running.",
  },
  unavailable: { title: "Chain unreachable", body: "The checks that need the chain could not run. Nothing has been verified." },
};
