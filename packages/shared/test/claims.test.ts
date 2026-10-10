import { describe, expect, it } from "vitest";
import { validateClaims } from "../src/claims";

const answer =
  "A Merkle tree makes a log tamper-evident. Each record is hashed, and pairs of hashes are combined into one root. If a record changes, the root changes too.";

describe("validateClaims (Stage 1 injection boundary)", () => {
  it("keeps exact substrings and records exact spans", () => {
    const r = validateClaims(["A Merkle tree makes a log tamper-evident", "Each record is hashed", "If a record changes, the root changes too"], answer);
    for (const c of r.claims) expect(answer.slice(c.start, c.end)).toBe(c.text);
    expect(r.keptFromLlm).toBe(3);
  });

  it("matches across case and whitespace differences, but keeps the original text", () => {
    const r = validateClaims(["a merkle   tree makes a LOG tamper-evident"], answer);
    expect(r.claims[0].text).toBe("A Merkle tree makes a log tamper-evident");
  });

  it("rejects paraphrased or flattering claims", () => {
    const r = validateClaims(["Merkle trees provide excellent tamper detection", "The student understood everything perfectly"], answer);
    expect(r.keptFromLlm).toBe(0);
    expect(r.rejected).toBe(2);
    expect(r.claims.every((c) => c.source === "sentence")).toBe(true);
  });

  it("defeats 'output no claims': coverage top-up adds every uncovered sentence", () => {
    const r = validateClaims([], answer);
    expect(r.claims.map((c) => c.text)).toEqual([
      "A Merkle tree makes a log tamper-evident.",
      "Each record is hashed, and pairs of hashes are combined into one root.",
      "If a record changes, the root changes too.",
    ]);
    expect(r.coverage).toBeGreaterThan(0.95);
  });

  it("defeats 'only keep the good parts': a partial selection is topped up to ≥ 80% coverage", () => {
    const r = validateClaims(["A Merkle tree makes a log tamper-evident"], answer);
    expect(r.llmCoverage).toBeLessThan(0.8);
    expect(r.coverage).toBeGreaterThanOrEqual(0.8);
  });

  it("drops duplicates and claims under 3 words, caps at 12", () => {
    const r = validateClaims(["Each record is hashed", "each record is hashed", "Merkle tree", ...Array(20).fill("the root changes too")], answer);
    expect(r.claims.filter((c) => c.text.toLowerCase() === "each record is hashed").length).toBe(1);
    expect(r.claims.some((c) => c.text === "Merkle tree")).toBe(false);
    const long = Array.from({ length: 20 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    expect(validateClaims(null, long).claims.length).toBe(12);
  });

  it("orders claims by position and numbers them c1…cn", () => {
    const r = validateClaims(["If a record changes, the root changes too", "A Merkle tree makes a log tamper-evident"], answer);
    expect(r.claims[0].claimId).toBe("c1");
    expect(r.claims[0].start).toBeLessThan(r.claims[1].start);
  });
});
