import { describe, expect, it } from "vitest";
import { validateClaims } from "../src/claims";
import { DEFAULT_COPY_POLICY, detectCopy, maskCopiedClaims } from "../src/copy";
import { assessIntegrity } from "../src/integrity";
import { loadArticle } from "./helpers";

const A1 = loadArticle("A1");
const SOURCE = A1.sentences.join(" ");

export const ANSWERS = {
  genuine:
    "The article explains how a Merkle tree lets anyone check that a log has not been rewritten. Every record is hashed, then pairs of hashes are hashed together level by level until one root is left. Because each level depends on the one below, editing a single record changes its hash and every parent hash, so the root changes and anyone who saved the old root can tell. You can also prove one record belongs to the log with just a few sibling hashes instead of the whole log. Publishing only the root keeps the data private.",
  paraphrase:
    "Think of the tree as a stack of fingerprints. Each entry gets its own short digest, neighbouring digests are combined into a parent, and this repeats upward until a single top value summarises everything. Tweak one entry and its digest shifts, which ripples up through every parent to the top, so comparing against an older top value exposes the edit. Proving one entry is included only needs the neighbours along its path, about twenty for a million entries, and the top value alone leaks nothing about the data.",
  fullCopy: A1.sentences.slice(0, 9).join(" "),
  lightEdit:
    "Every record in the log is passed through a hash function, which turns it into a short fingerprint. Pairs of fingerprints are hashed together, and the process repeats level by level until a single value is at the top: the root. Because every level depends on the one below it, changing one character in one record changes that record's hash, every parent hash above it, and the root.",
  /** One pasted article sentence among the student's own sentences (~30% of the words). */
  partialCopy:
    "A Merkle tree is a way to make a log trustworthy. Pairs of fingerprints are then hashed together, and the process repeats level by level until a single value remains at the top: the root. If anything in the log is edited, the top value no longer matches the one people saved earlier, so the change shows. It also lets someone check a single entry without the whole log, and publishing only the top value keeps the entries private.",
};

describe("copy detection (deterministic, word-level)", () => {
  const run = (answer: string) => detectCopy(answer, SOURCE, validateClaims(null, answer).claims);

  it("never counts own words or paraphrase as copying", () => {
    expect(run(ANSWERS.genuine)).toMatchObject({ ratio: 0, level: "none", spans: [] });
    expect(run(ANSWERS.paraphrase)).toMatchObject({ ratio: 0, level: "none" });
    // A short shared technical phrase is not copying.
    expect(run(ANSWERS.genuine).longestRun).toBeLessThan(DEFAULT_COPY_POLICY.minRun);
  });

  it("detects a word-for-word copy and a lightly edited copy as violations", () => {
    expect(run(ANSWERS.fullCopy)).toMatchObject({ ratio: 1, level: "violation" });
    const edited = run(ANSWERS.lightEdit);
    expect(edited.ratio).toBeGreaterThan(0.8);
    expect(edited.level).toBe("violation");
  });

  it("detects a partial copy at claim level and only flags the copied claim", () => {
    const r = run(ANSWERS.partialCopy);
    expect(r.level).toBe("review");
    expect(r.ratio).toBeGreaterThanOrEqual(0.3);
    expect(r.ratio).toBeLessThan(0.5);
    expect(r.claims.filter((c) => c.copied).map((c) => c.claimId)).toEqual(["c2"]);
    expect(r.spans).toHaveLength(1);
    expect(ANSWERS.partialCopy.slice(r.spans[0].start, r.spans[0].end)).toBe(r.spans[0].text);
  });

  it("is configurable and deterministic", () => {
    const strict = detectCopy(ANSWERS.genuine, SOURCE, [], { ...DEFAULT_COPY_POLICY, minRun: 5 });
    expect(strict.ratio).toBeGreaterThan(0);
    expect(run(ANSWERS.partialCopy)).toEqual(run(ANSWERS.partialCopy));
  });

  it("masks copied claims to the same length so every offset stays valid", () => {
    const claims = validateClaims(null, ANSWERS.partialCopy).claims;
    const masked = maskCopiedClaims(ANSWERS.partialCopy, claims, detectCopy(ANSWERS.partialCopy, SOURCE, claims));
    expect(masked).toHaveLength(ANSWERS.partialCopy.length);
    expect(masked).toContain("[copied from the article: not assessed]");
    expect(masked).not.toContain("Pairs of fingerprints");
    expect(masked.slice(claims[0].start, claims[0].end)).toBe(claims[0].text);
  });

  it("maps copying onto integrity: warning → review → violation (COMPROMISED)", () => {
    const base = {
      events: [
        { type: "MONITOR_START" as const, source: "client" as const, phase: "reading" as const, at: 1, clientAt: null, clientId: "c", seq: 1, detail: {} },
      ],
      seeded: false,
      wordCount: 80,
      writingMs: 300_000,
      clients: [],
    };
    const statusOf = (answer: string) => assessIntegrity({ ...base, copy: run(answer) });
    expect(statusOf(ANSWERS.genuine).status).toBe("NORMAL");
    expect(statusOf(ANSWERS.paraphrase).status).toBe("NORMAL");
    expect(statusOf(ANSWERS.partialCopy)).toMatchObject({ status: "INTEGRITY_RISK", outcome: "REVIEW_REQUIRED" });
    const full = statusOf(ANSWERS.fullCopy);
    expect(full).toMatchObject({ status: "COMPROMISED", outcome: "NOT_CERTIFIED" });
    expect(full.findings[0]).toMatchObject({ code: "COPIED_SOURCE_TEXT", severity: "CRITICAL" });
    expect(full.findings[0].explanation).toContain("Significant source text copied");
  });
});
