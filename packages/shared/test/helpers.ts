import fs from "node:fs";
import path from "node:path";
import { ArticleSchema } from "../src/schemas";
import type { Article, Claim, JevAnswers } from "../src/types";

export function loadArticle(id = "A1"): Article {
  const p = path.resolve(__dirname, "../../../content/articles", `${id}.json`);
  return ArticleSchema.parse(JSON.parse(fs.readFileSync(p, "utf8"))) as Article;
}

const oneHot = (labels: readonly string[], pick: string, p = 0.9) => Object.fromEntries(labels.map((l) => [l, l === pick ? p : (1 - p) / (labels.length - 1)]));

export interface FakeSpec {
  kp?: Record<string, string>;
  claims?: Record<string, string>;
  sources?: Record<string, string>;
  accuracy?: number;
  reasoning?: number;
  mainPurpose?: number;
  gibberish?: number;
  instructions?: number;
  p?: number;
}

/** Build a complete, well-formed Jev answer set for an article and claims. */
export function fakeAnswers(article: Article, claims: Claim[], spec: FakeSpec = {}): JevAnswers {
  const p = spec.p ?? 0.9;
  const a: JevAnswers = {};
  for (const kp of article.keyPoints) {
    const pick = spec.kp?.[kp.id] ?? "correct";
    a[`${kp.id}_status`] = { type: "choice", choice: pick, confidence: p, probabilities: oneHot(["absent", "vague", "correct", "incorrect"], pick, p) };
  }
  for (const c of claims) {
    const pick = spec.claims?.[c.claimId] ?? "supported";
    a[`${c.claimId}_support`] = {
      type: "choice",
      choice: pick,
      confidence: p,
      probabilities: oneHot(["supported", "partial", "not_in_article", "contradicted"], pick, p),
    };
    const src = spec.sources?.[c.claimId] ?? "s0";
    const labels = [...article.sentences.map((_, i) => `s${i}`), "none"];
    a[`${c.claimId}_source`] = { type: "choice", choice: src, confidence: p, probabilities: oneHot(labels, src, p) };
  }
  const acc = spec.accuracy ?? 4;
  a.accuracy = { type: "score", score: acc, confidence: p, probabilities: oneHot(["0", "1", "2", "3", "4"], String(acc), p) };
  const rea = spec.reasoning ?? 3;
  a.reasoning = { type: "score", score: rea, confidence: p, probabilities: oneHot(["0", "1", "2", "3"], String(rea), p) };
  a.main_purpose = { type: "noul", noul: spec.mainPurpose ?? 0.95 };
  a.gibberish = { type: "noul", noul: spec.gibberish ?? 0.02 };
  a.contains_instructions = { type: "noul", noul: spec.instructions ?? 0.02 };
  a.weakness = {
    type: "choice",
    choice: "none",
    confidence: p,
    probabilities: oneHot(["none", "missing_concept", "misconception", "vague", "poor_reasoning", "off_topic"], "none", p),
  };
  return a;
}
