import { describe, expect, it } from "vitest";
import { validateClaims } from "../src/claims";
import { templateFeedback, validateFeedback, verdictSummary } from "../src/feedback";
import { fuse } from "../src/fusion";
import { JudgeResponseError, mergeAnswers, uncertainKeys, validateJudgeResult } from "../src/jev";
import { buildQuestions, buildState, estimateTokens } from "../src/questions";
import { recommend } from "../src/recommend";
import { fakeAnswers, loadArticle } from "./helpers";

const article = loadArticle("A1");
const answer =
  "A Merkle tree makes a log tamper-evident. Each record is hashed and pairs of hashes are combined into one root. Merkle trees encrypt the records so nobody can read them.";
const { claims } = validateClaims(null, answer);
const fused = fuse({
  article,
  claims,
  answers: fakeAnswers(article, claims, { kp: { kp3: "absent", kp4: "incorrect" }, claims: { c3: "contradicted" } }),
  overlap5: 0.1,
});
const ctx = { article, answer, claims, fused };

describe("Jev question builder", () => {
  it("asks every type in one request and stays well inside the token limit", () => {
    const many = validateClaims(null, Array.from({ length: 12 }, (_, i) => `Claim number ${i} says the root changes.`).join(" ")).claims;
    const q = buildQuestions(article, many);
    expect(Object.keys(q).length).toBe(4 + 24 + 6);
    expect(new Set(Object.values(q).map((x) => x.type))).toEqual(new Set(["choice", "score", "noul"]));
    expect(estimateTokens(buildState(article, answer, many), q)).toBeLessThan(8000);
  });
  it("reverses choice option order for the order-flip audit, keeping labels", () => {
    const q = buildQuestions(article, claims, { reversed: true });
    const kp = q.kp1_status;
    expect(kp.type === "choice" && Object.keys(kp.criteria)).toEqual(["incorrect", "correct", "vague", "absent"]);
  });
});

describe("Jev response handling", () => {
  const questions = buildQuestions(article, claims);
  it("rejects responses that miss a question", () => {
    const answers = fakeAnswers(article, claims);
    delete answers.weakness;
    expect(() => validateJudgeResult({ model: "jev-1.13.0", answers, usage: { input_tokens: 1, output_tokens: 0 } }, questions)).toThrow(JudgeResponseError);
  });
  it("flags uncertain items and averages re-asked distributions", () => {
    const a = fakeAnswers(article, claims);
    a.kp2_status = { type: "choice", choice: "vague", confidence: 0.45, probabilities: { vague: 0.45, correct: 0.4, absent: 0.1, incorrect: 0.05 } };
    a.main_purpose = { type: "noul", noul: 0.55 };
    expect(uncertainKeys(a).sort()).toEqual(["kp2_status", "main_purpose"]);
    const again = {
      kp2_status: { type: "choice" as const, choice: "correct", confidence: 0.85, probabilities: { vague: 0.1, correct: 0.85, absent: 0.03, incorrect: 0.02 } },
    };
    const m = mergeAnswers(a, again);
    expect(m.kp2_status.type === "choice" && m.kp2_status.choice).toBe("correct");
    expect(m.kp2_status.type === "choice" && m.kp2_status.confidence).toBeCloseTo(0.65);
  });
});

describe("feedback validators (PRD §9.2.8)", () => {
  it("drops hallucinated quotes, unknown ids and items that contradict Jev", () => {
    const raw = {
      oneLineSummary: "Good start.",
      understood: [
        { keyPointId: "kp1", evidence: "Each record is hashed" },
        { keyPointId: "kp1", evidence: "The tree uses quantum signatures" },
        { keyPointId: "kp3", evidence: "Each record is hashed" },
        { keyPointId: "kp9", evidence: "Each record is hashed" },
      ],
      missed: [{ keyPointId: "kp1", whatToAdd: "nothing" }],
      misunderstood: [
        { claimId: "c3", studentQuote: "Merkle trees encrypt the records", why: "They hash.", correctVersion: "They hash." },
        { claimId: "c1", studentQuote: "A Merkle tree makes a log tamper-evident", why: "x", correctVersion: "y" },
      ],
      couldBeBetter: Array.from({ length: 6 }, (_, i) => ({ action: `Do ${i}`, exampleSentence: "Example." })),
      nextStep: "Read again.",
    };
    const v = validateFeedback(raw, ctx)!;
    expect(v.feedback.understood).toEqual([{ keyPointId: "kp1", evidence: "Each record is hashed" }]);
    expect(v.feedback.misunderstood.map((m) => m.claimId)).toEqual(["c3"]);
    // kp3 is missing; kp4 is wrong, and a wrong idea is a gap too (never silently dropped).
    expect(v.feedback.missed.map((m) => m.keyPointId)).toEqual(["kp3", "kp4"]);
    expect(v.feedback.couldBeBetter).toHaveLength(4);
    expect(v.dropped).toBeGreaterThanOrEqual(6);
  });
  it("returns null for output that fails the schema", () => {
    expect(validateFeedback({ oneLineSummary: "" }, ctx)).toBeNull();
  });
  it("template feedback is never empty and quotes only the answer", () => {
    const t = templateFeedback(ctx);
    expect(t.oneLineSummary.length).toBeGreaterThan(0);
    expect(t.misunderstood[0].studentQuote).toBe("Merkle trees encrypt the records so nobody can read them.");
    expect(t.misunderstood[0].correctVersion).toMatch(/does not encrypt/);
    for (const u of t.understood) if (u.evidence) expect(answer.includes(u.evidence)).toBe(true);
    expect(t.couldBeBetter.length).toBeGreaterThan(0);
  });
});

describe("evidence-first summary", () => {
  const PRAISE = /good effort|great|well done|excellent|nice work|good job/i;
  const fusedWith = (spec: Parameters<typeof fakeAnswers>[2]) => fuse({ article, claims, answers: fakeAnswers(article, claims, spec), overlap5: 0.1 });

  it("names what was right, then every gap by kind, without praise", () => {
    const v = verdictSummary(ctx);
    expect(v).toMatch(/^You explained “hashing up to a single root” and “any change alters the root” correctly, but part of your answer is incorrect\./);
    expect(v).toContain("You misunderstood “the root reveals nothing”.");
    expect(v).toContain("Your answer does not explain “short inclusion proofs”.");
    expect(v).not.toMatch(PRAISE);
  });
  it("replaces the LLM's headline, so it cannot over-praise", () => {
    const raw = { oneLineSummary: "Good effort — great answer!", understood: [], missed: [], misunderstood: [], couldBeBetter: [], nextStep: "Read again." };
    expect(validateFeedback(raw, ctx)!.feedback.oneLineSummary).toBe(verdictSummary(ctx));
    expect(templateFeedback(ctx).oneLineSummary).toBe(verdictSummary(ctx));
  });
  it("says 'main idea, but concepts are missing' when only the main idea is there", () => {
    const f = fusedWith({ kp: { kp1: "absent", kp2: "absent", kp3: "absent", kp4: "absent" }, mainPurpose: 0.9 });
    const v = verdictSummary({ article, fused: f });
    expect(v).toMatch(
      /^You identified the main idea, but several important concepts are missing\. Your answer does not explain .+ or “the root reveals nothing”\. Add these concepts/,
    );
  });
  it("calls partial understanding partial", () => {
    const f = fusedWith({ kp: { kp2: "vague" } });
    expect(verdictSummary({ article, fused: f })).toContain("only partly explain “any change alters the root”");
  });
  it("does not claim understanding when nothing is supported", () => {
    const f = fusedWith({ kp: { kp1: "absent", kp2: "absent", kp3: "absent", kp4: "absent" }, mainPurpose: 0.1 });
    expect(verdictSummary({ article, fused: f })).toMatch(/^Your answer does not yet explain any of the key ideas\./);
  });
  it("only praises a complete, accurate answer", () => {
    const f = fusedWith({});
    expect(verdictSummary({ article, fused: f })).toMatch(/^You explained all 4 key ideas correctly/);
  });
  it("lists a wrong key idea as a gap, never dropping it", () => {
    const t = templateFeedback(ctx);
    const kp4 = t.missed.find((m) => m.keyPointId === "kp4");
    expect(kp4?.whatToAdd).toMatch(/^Your answer gets this idea wrong\. The source says:/);
  });
});

describe("recommendation (PRD §9.6)", () => {
  const arts = ["A1", "A2", "A3"].map((id) => loadArticle(id));
  const dims = (o: Partial<Record<string, number>>) => ({ coverage: 0.8, correctness: 0.8, accuracy: 0.8, reasoning: 0.8, ownWords: 0.8, ...o });
  it("starts with the easiest article", () => {
    expect(recommend(arts, []).articleId).toBe("A3");
  });
  it("targets the weakest dimension with a reason", () => {
    const r = recommend(arts, [{ articleId: "A1", finalScore: 6, dimensions: dims({ reasoning: 0.2 }), createdAt: "" }]);
    expect(r.weakest).toBe("reasoning");
    expect(arts.find((a) => a.id === r.articleId)!.skillTags).toContain("causal");
    expect(r.reason).toMatch(/reasoning/);
  });
});
