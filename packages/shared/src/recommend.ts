import type { Dimensions } from "./types";

export const STUDENT_DIMENSIONS = ["coverage", "correctness", "reasoning", "ownWords"] as const;
export type StudentDimension = (typeof STUDENT_DIMENSIONS)[number];

/** Which article skill tag exercises each weak dimension. `ownWords` is practised on any article. */
export const DIMENSION_TAG: Record<StudentDimension, string | null> = {
  coverage: "coverage",
  correctness: "mechanism",
  reasoning: "causal",
  ownWords: null,
};

const LABEL: Record<StudentDimension, string> = { coverage: "coverage", correctness: "correctness", reasoning: "reasoning", ownWords: "own-words" };

export interface RecArticle {
  id: string;
  title: string;
  difficulty: number;
  skillTags: string[];
}
export interface RecAttempt {
  articleId: string;
  finalScore: number;
  dimensions: Dimensions;
  createdAt: string;
}

export interface Recommendation {
  articleId: string;
  weakest: StudentDimension | null;
  reason: string;
}

/**
 * PRD §9.6: weakest dimension over the last 3 attempts → next article tagged for that skill;
 * difficulty steps up after two consecutive attempts ≥ 8; the reason is always shown.
 */
export function recommend(articles: RecArticle[], attemptsOldestFirst: RecAttempt[]): Recommendation {
  const count = (id: string) => attemptsOldestFirst.filter((a) => a.articleId === id).length;
  const easiest = [...articles].sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id));
  if (!attemptsOldestFirst.length) {
    return { articleId: easiest[0].id, weakest: null, reason: "A good first article: it is the least technical in the library." };
  }
  const recent = attemptsOldestFirst.slice(-3);
  const avg = (k: StudentDimension) => recent.reduce((s, a) => s + a.dimensions[k], 0) / recent.length;
  const weakest = STUDENT_DIMENSIONS.reduce((a, b) => (avg(b) < avg(a) ? b : a));

  const last2 = attemptsOldestFirst.slice(-2);
  const stepUp = last2.length === 2 && last2.every((a) => a.finalScore >= 8);
  const maxDone = Math.max(...attemptsOldestFirst.map((a) => articles.find((x) => x.id === a.articleId)?.difficulty ?? 1));

  const tag = DIMENSION_TAG[weakest];
  let pool = tag ? articles.filter((a) => a.skillTags.includes(tag)) : articles;
  if (!pool.length) pool = articles;
  let steppedUp = false;
  if (stepUp) {
    const harder = pool.filter((a) => a.difficulty > maxDone);
    if (harder.length) {
      pool = harder;
      steppedUp = true;
    }
  }
  const lastId = attemptsOldestFirst[attemptsOldestFirst.length - 1].articleId;
  const pick = [...pool].sort(
    (a, b) => Number(a.id === lastId) - Number(b.id === lastId) || count(a.id) - count(b.id) || a.difficulty - b.difficulty || a.id.localeCompare(b.id),
  )[0];

  const pctTxt = `${Math.round(avg(weakest) * 100)}%`;
  const why =
    weakest === "ownWords"
      ? `Recommended because your own-words score is lowest (${pctTxt} over your last ${recent.length}). Try summarizing this one without echoing its phrasing.`
      : `Recommended because your ${LABEL[weakest]} score is lowest (${pctTxt} over your last ${recent.length}); this article exercises it.`;
  return { articleId: pick.id, weakest, reason: steppedUp ? `${why} Your last two scores were 8 or above, so it steps up in difficulty.` : why };
}

/** Retry delta per dimension and overall, versus the previous attempt on the same article. */
export function retryDelta(prev: { finalScore: number; dimensions: Dimensions } | null, cur: { finalScore: number; dimensions: Dimensions }) {
  if (!prev) return null;
  return {
    finalScore: Math.round((cur.finalScore - prev.finalScore) * 10) / 10,
    dimensions: Object.fromEntries(STUDENT_DIMENSIONS.map((k) => [k, cur.dimensions[k] - prev.dimensions[k]])) as Record<StudentDimension, number>,
  };
}
