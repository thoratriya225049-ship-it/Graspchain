import { argmax } from "./jev";
import type { Article, Band, Claim, ClaimLabel, ClaimResult, Contribution, Dimensions, FusionResult, JevAnswers, KpLabel, KpResult, Weakness } from "./types";

/** Pre-registered weights and utilities (PRD §9.2.7). Fixed before any rated data is seen. */
export const WEIGHTS: Record<keyof Dimensions, number> = { coverage: 0.4, correctness: 0.25, accuracy: 0.15, reasoning: 0.1, ownWords: 0.1 };
export const KP_UTILITY: Record<KpLabel, number> = { correct: 1, vague: 0.4, absent: 0, incorrect: 0 };
export const CLAIM_UTILITY: Record<ClaimLabel, number> = { supported: 1, partial: 0.6, not_in_article: 0.5, contradicted: 0 };
export const ACCURACY_UTILITY = [0, 0.25, 0.5, 0.75, 1];
export const REASONING_UTILITY = [0, 1 / 3, 2 / 3, 1];
export const INJECTION_FLAG_AT = 0.7;
export const GIBBERISH_CAP_AT = 0.7;
export const PURPOSE_CAP_BELOW = 0.3;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function bandOf(score: number): Band {
  if (score >= 10) return "Expert";
  if (score >= 8) return "Deep";
  if (score >= 6) return "Functional";
  if (score >= 4) return "Partial";
  return "Surface";
}

export const BANDS: { band: Band; from: number; to: number; meaning: string }[] = [
  { band: "Surface", from: 1, to: 3.9, meaning: "Little of the article is explained, or it contains clear errors." },
  { band: "Partial", from: 4, to: 5.9, meaning: "Some ideas are explained, with gaps or errors." },
  { band: "Functional", from: 6, to: 7.9, meaning: "Mostly accurate; some ideas or links are missing." },
  { band: "Deep", from: 8, to: 9.9, meaning: "The key ideas and how they connect are explained." },
  { band: "Expert", from: 10, to: 10, meaning: "Complete, precise and in your own words." },
];

export interface FusionInput {
  article: Article;
  claims: Claim[];
  answers: JevAnswers;
  overlap5: number;
  /** "expected" (primary, distributions) or "argmax" (sensitivity variant S3′). */
  mode?: "expected" | "argmax";
}

function dist(answers: JevAnswers, key: string, labels: readonly string[], mode: "expected" | "argmax") {
  const a = answers[key];
  if (!a || a.type === "noul") throw new Error(`Missing judge answer "${key}"`);
  const p = Object.fromEntries(labels.map((l) => [l, a.probabilities[l] ?? 0]));
  if (mode === "argmax") {
    const top = argmax(p);
    for (const l of labels) p[l] = l === top ? 1 : 0;
  }
  return { p, confidence: a.confidence };
}

function noul(answers: JevAnswers, key: string): number {
  const a = answers[key];
  if (!a || a.type !== "noul") throw new Error(`Missing judge answer "${key}"`);
  return a.noul;
}

/** Deterministic score fusion. Same inputs → same output. No free text enters this function. */
export function fuse(input: FusionInput): FusionResult {
  const { article, claims, answers } = input;
  const mode = input.mode ?? "expected";
  const kpLabels = ["absent", "vague", "correct", "incorrect"] as const;
  const claimLabels = ["supported", "partial", "not_in_article", "contradicted"] as const;

  const keyPoints: KpResult[] = article.keyPoints.slice(0, 6).map((kp) => {
    const { p, confidence } = dist(answers, `${kp.id}_status`, kpLabels, mode);
    const label = argmax(p) as KpLabel;
    return { id: kp.id, label, p: p[label], probabilities: p as Record<KpLabel, number>, confidence };
  });
  const totalWeight = article.keyPoints.slice(0, 6).reduce((s, k) => s + k.weight, 0);
  const coverage =
    keyPoints.reduce((s, r, i) => {
      const e = (Object.keys(KP_UTILITY) as KpLabel[]).reduce((x, l) => x + KP_UTILITY[l] * r.probabilities[l], 0);
      return s + article.keyPoints[i].weight * e;
    }, 0) / totalWeight;

  const claimResults: ClaimResult[] = claims.slice(0, 12).map((c) => {
    const { p, confidence } = dist(answers, `${c.claimId}_support`, claimLabels, mode);
    const label = argmax(p) as ClaimLabel;
    const src = answers[`${c.claimId}_source`];
    let sourceSentence: number | null = null;
    let sourceConfidence = 0;
    if (src && src.type === "choice") {
      const m = /^s(\d+)$/.exec(src.choice);
      sourceSentence = m && Number(m[1]) < article.sentences.length ? Number(m[1]) : null;
      sourceConfidence = src.confidence;
    }
    return { claimId: c.claimId, label, p: p[label], probabilities: p as Record<ClaimLabel, number>, confidence, sourceSentence, sourceConfidence };
  });
  const correctness = claimResults.length
    ? claimResults.reduce((s, r) => s + claimLabels.reduce((x, l) => x + CLAIM_UTILITY[l] * r.probabilities[l], 0), 0) / claimResults.length
    : 0;

  const acc = dist(answers, "accuracy", ["0", "1", "2", "3", "4"], mode).p;
  const accuracy = ACCURACY_UTILITY.reduce((s, u, l) => s + u * (acc[String(l)] ?? 0), 0);
  const rea = dist(answers, "reasoning", ["0", "1", "2", "3"], mode).p;
  const reasoning = REASONING_UTILITY.reduce((s, u, l) => s + u * (rea[String(l)] ?? 0), 0);
  const ownWords = 1 - clamp((input.overlap5 - 0.2) / 0.5, 0, 1);

  const dimensions: Dimensions = { coverage, correctness, accuracy, reasoning, ownWords };
  const contributions: Contribution[] = (Object.keys(WEIGHTS) as (keyof Dimensions)[]).map((key) => ({
    key,
    weight: WEIGHTS[key],
    value: dimensions[key],
    points: 9 * WEIGHTS[key] * dimensions[key],
  }));

  let f = 1 + contributions.reduce((s, c) => s + c.points, 0);
  const adjustments: string[] = [];
  const misconceptionCount = Math.max(
    keyPoints.filter((k) => k.probabilities.incorrect >= 0.5).length,
    claimResults.filter((c) => c.probabilities.contradicted >= 0.5).length,
  );
  if (misconceptionCount > 0) {
    const penalty = Math.min(1.5, 0.5 * misconceptionCount);
    f -= penalty;
    adjustments.push(`−${penalty.toFixed(1)} for ${misconceptionCount} misconception${misconceptionCount > 1 ? "s" : ""}`);
  }
  const n = {
    mainPurpose: noul(answers, "main_purpose"),
    gibberish: noul(answers, "gibberish"),
    containsInstructions: noul(answers, "contains_instructions"),
  };
  if (n.gibberish >= GIBBERISH_CAP_AT && f > 2) {
    f = 2;
    adjustments.push("Capped at 2.0: keyword stuffing or text unrelated to the article");
  }
  if (n.mainPurpose < PURPOSE_CAP_BELOW && f > 6) {
    f = 6;
    adjustments.push("Capped at 6.0: the central idea of the article is not stated");
  }
  const finalScore = Math.round(clamp(f, 1, 10) * 10) / 10;

  const w = answers.weakness;
  const weakness = (w && w.type === "choice" ? w.choice : "none") as Weakness;

  return {
    dimensions,
    contributions,
    keyPoints,
    claims: claimResults,
    misconceptionCount,
    adjustments,
    finalScore,
    band: bandOf(finalScore),
    noul: n,
    weakness,
    overlap5: input.overlap5,
  };
}
