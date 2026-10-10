import { describe, expect, it } from "vitest";
import { validateClaims } from "../src/claims";
import { bandOf, fuse } from "../src/fusion";
import { fakeAnswers, loadArticle } from "./helpers";

const article = loadArticle("A1");
const answer =
  "A Merkle tree makes a log tamper-evident. Each record is hashed and pairs of hashes are combined level by level into one root. If a record changes, the root changes, so anyone with the saved root can tell.";
const { claims } = validateClaims(null, answer);

describe("fuse (PRD §9.2.7)", () => {
  it("is deterministic: same input, same output", () => {
    const a = fakeAnswers(article, claims);
    expect(fuse({ article, claims, answers: a, overlap5: 0.1 })).toEqual(fuse({ article, claims, answers: a, overlap5: 0.1 }));
  });

  it("is bounded to [1, 10] for the extremes", () => {
    const best = fuse({ article, claims, answers: fakeAnswers(article, claims, { p: 1 }), overlap5: 0 });
    expect(best.finalScore).toBe(10);
    const worst = fuse({
      article,
      claims,
      answers: fakeAnswers(article, claims, {
        p: 1,
        kp: Object.fromEntries(article.keyPoints.map((k) => [k.id, "incorrect"])),
        claims: Object.fromEntries(claims.map((c) => [c.claimId, "contradicted"])),
        accuracy: 0,
        reasoning: 0,
      }),
      overlap5: 1,
    });
    expect(worst.finalScore).toBe(1);
  });

  it("is monotonic in p(correct) for a key point", () => {
    let last = -Infinity;
    for (const p of [0.3, 0.5, 0.7, 0.9]) {
      const answers = fakeAnswers(article, claims);
      answers.kp1_status = { type: "choice", choice: "correct", confidence: p, probabilities: { correct: p, absent: 1 - p, vague: 0, incorrect: 0 } };
      const s = fuse({ article, claims, answers, overlap5: 0.1 }).finalScore;
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
  });

  it("caps gibberish at 2.0 and a missing central claim at 6.0", () => {
    expect(fuse({ article, claims, answers: fakeAnswers(article, claims, { gibberish: 0.9 }), overlap5: 0 }).finalScore).toBeLessThanOrEqual(2);
    const purpose = fuse({ article, claims, answers: fakeAnswers(article, claims, { mainPurpose: 0.1 }), overlap5: 0 });
    expect(purpose.finalScore).toBe(6);
    expect(purpose.adjustments.join(" ")).toMatch(/central idea/);
  });

  it("subtracts 0.5 per misconception, at most 1.5", () => {
    const base = fuse({ article, claims, answers: fakeAnswers(article, claims, { p: 1 }), overlap5: 0 }).finalScore;
    const one = fuse({ article, claims, answers: fakeAnswers(article, claims, { p: 1, claims: { c1: "contradicted" } }), overlap5: 0 });
    expect(one.misconceptionCount).toBe(1);
    expect(one.adjustments[0]).toMatch(/−0\.5/);
    expect(one.finalScore).toBeLessThan(base);
  });

  it("uses the own-words curve: overlap ≤ 0.2 is free, ≥ 0.7 is zero", () => {
    const a = fakeAnswers(article, claims);
    expect(fuse({ article, claims, answers: a, overlap5: 0.2 }).dimensions.ownWords).toBe(1);
    expect(fuse({ article, claims, answers: a, overlap5: 0.7 }).dimensions.ownWords).toBeCloseTo(0, 10);
    expect(fuse({ article, claims, answers: a, overlap5: 0.45 }).dimensions.ownWords).toBeCloseTo(0.5);
  });

  it("argmax variant ignores spread in the distributions", () => {
    const a = fakeAnswers(article, claims, { p: 0.7 });
    const exp = fuse({ article, claims, answers: a, overlap5: 0 });
    const arg = fuse({ article, claims, answers: a, overlap5: 0, mode: "argmax" });
    expect(arg.finalScore).toBeGreaterThan(exp.finalScore);
  });

  it("links claims to the source sentence Jev chose", () => {
    const r = fuse({ article, claims, answers: fakeAnswers(article, claims, { sources: { c2: "s3", c3: "none" } }), overlap5: 0 });
    expect(r.claims.find((c) => c.claimId === "c2")!.sourceSentence).toBe(3);
    expect(r.claims.find((c) => c.claimId === "c3")!.sourceSentence).toBeNull();
  });

  it("maps bands", () => {
    expect([1, 3.9, 4, 6, 8, 10].map(bandOf)).toEqual(["Surface", "Surface", "Partial", "Functional", "Deep", "Expert"]);
  });
});
