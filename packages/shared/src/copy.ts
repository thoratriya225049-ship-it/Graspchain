/**
 * COPY DETECTION — deterministic, word-level, explainable.
 *
 * "Understand → explain in your own words → earn comprehension credit. Copy → detect → flag."
 *
 * A word of the answer counts as copied when it lies inside a run of at least `minRun`
 * consecutive words that also appears, in the same order, in the article. Paraphrasing — the
 * same ideas in other words, or short shared technical phrases like "level by level" — never
 * forms such a run, so it is never counted. Measured on our articles: genuine own-word answers
 * and strong paraphrases score 0%, an answer with two pasted sentences 53%, a lightly edited copy
 * 87%, a full copy 100% (with minRun = 7; at 6, a natural six-word phrase already registers).
 *
 * Nothing here is a model judgment: the same answer and article always give the same result.
 */

export const COPY_RULES_VERSION = "copy-detection@1";

export interface CopyPolicy {
  /** Shortest run of identical consecutive words that counts as copying. */
  minRun: number;
  /** A claim whose words are at least this share copied is a copied claim. */
  claimCopiedAt: number;
  /** Share of the whole answer copied → integrity WARNING (LOW). */
  warnAt: number;
  /** → teacher review required (HIGH). */
  reviewAt: number;
  /** → integrity violation, result not certified (CRITICAL). */
  violationAt: number;
  /** "withhold": copied claims earn no comprehension credit. "flag_only": they are judged but flagged. */
  credit: "withhold" | "flag_only";
}

export const DEFAULT_COPY_POLICY: CopyPolicy = {
  minRun: 7,
  claimCopiedAt: 0.5,
  warnAt: 0.15,
  reviewAt: 0.3,
  violationAt: 0.5,
  credit: "withhold",
};

export interface CopySpan {
  start: number;
  end: number;
  words: number;
  text: string;
}

export interface CopyAnalysis {
  version: string;
  policy: CopyPolicy;
  totalWords: number;
  copiedWords: number;
  /** copiedWords / totalWords (0–1). */
  ratio: number;
  /** Longest run of identical consecutive words shared with the article. */
  longestRun: number;
  /** Copied passages as exact spans of the answer. */
  spans: CopySpan[];
  /** Per claim: share of its words that are copied, and whether it counts as a copied claim. */
  claims: { claimId: string; ratio: number; copied: boolean }[];
  /** The integrity level this ratio reaches under the policy. */
  level: "none" | "warning" | "review" | "violation";
}

interface Tok {
  w: string;
  start: number;
  end: number;
}

/** Lower-cased words with their offsets in the original string. Curly quotes are normalized. */
export function tokensWithOffsets(s: string): Tok[] {
  const out: Tok[] = [];
  const re = /[A-Za-z0-9]+(?:['’‘][A-Za-z0-9]+)*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push({ w: m[0].toLowerCase().replace(/[’‘]/g, "'"), start: m.index, end: m.index + m[0].length });
  return out;
}

export function copyLevel(ratio: number, p: CopyPolicy): CopyAnalysis["level"] {
  return ratio >= p.violationAt ? "violation" : ratio >= p.reviewAt ? "review" : ratio >= p.warnAt ? "warning" : "none";
}

/**
 * Mark every answer word inside a run of ≥ minRun words shared, in order, with the source.
 * Longest-common-substring dynamic programming over words: O(answer × article), both ≤ ~300 words.
 */
export function detectCopy(
  answer: string,
  source: string,
  claims: { claimId: string; start: number; end: number }[] = [],
  policy: CopyPolicy = DEFAULT_COPY_POLICY,
): CopyAnalysis {
  const a = tokensWithOffsets(answer);
  const b = tokensWithOffsets(source).map((t) => t.w);
  const mark = new Uint8Array(a.length);
  let longestRun = 0;
  let prev = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Uint16Array(b.length + 1);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1].w !== b[j - 1]) continue;
      const run = prev[j - 1] + 1;
      cur[j] = run;
      if (run > longestRun) longestRun = run;
      if (run >= policy.minRun) for (let t = i - run; t < i; t++) mark[t] = 1;
    }
    prev = cur;
  }

  const spans: CopySpan[] = [];
  for (let i = 0; i < a.length; i++) {
    if (!mark[i]) continue;
    let j = i;
    while (j + 1 < a.length && mark[j + 1]) j++;
    spans.push({ start: a[i].start, end: a[j].end, words: j - i + 1, text: answer.slice(a[i].start, a[j].end) });
    i = j;
  }
  const copiedWords = mark.reduce((s, x) => s + x, 0);
  const ratio = a.length ? copiedWords / a.length : 0;

  const claimRows = claims.map((c) => {
    let n = 0;
    let k = 0;
    a.forEach((t, i) => {
      if (t.start >= c.start && t.end <= c.end) {
        n++;
        k += mark[i];
      }
    });
    const r = n ? k / n : 0;
    return { claimId: c.claimId, ratio: Math.round(r * 100) / 100, copied: n > 0 && r >= policy.claimCopiedAt };
  });

  return {
    version: COPY_RULES_VERSION,
    policy,
    totalWords: a.length,
    copiedWords,
    ratio: Math.round(ratio * 1000) / 1000,
    longestRun,
    spans,
    claims: claimRows,
    level: copyLevel(ratio, policy),
  };
}

/**
 * The answer as the judge sees it when credit is withheld: copied claims are blanked to the same
 * length (so every offset still points at the original), leaving only the student's own words.
 */
export function maskCopiedClaims(answer: string, claims: { claimId: string; start: number; end: number }[], copy: CopyAnalysis): string {
  const copied = new Set(copy.claims.filter((c) => c.copied).map((c) => c.claimId));
  let out = answer;
  for (const c of claims) {
    if (!copied.has(c.claimId)) continue;
    const len = c.end - c.start;
    const note = "[copied from the article: not assessed]";
    const fill = note.length <= len ? note + " ".repeat(len - note.length) : " ".repeat(len);
    out = out.slice(0, c.start) + fill + out.slice(c.end);
  }
  return out;
}
