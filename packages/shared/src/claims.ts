import type { Claim } from "./types";
import { normalizeWithMap, splitSentences, words } from "./text";

export const MAX_CLAIMS = 12;
export const MIN_CLAIM_WORDS = 3;
export const COVERAGE_MIN = 0.8;

export interface ClaimValidation {
  claims: Claim[];
  /** Claims the LLM returned that survived the substring/length/dedupe rules. */
  keptFromLlm: number;
  /** Claims the LLM returned that were rejected (paraphrased, too short, duplicate). */
  rejected: number;
  /** Coverage of the answer's non-space characters by the kept LLM claims alone. */
  llmCoverage: number;
  /** Coverage after deterministic sentence top-up. */
  coverage: number;
}

function coverageOf(answer: string, spans: { start: number; end: number }[]): number {
  let total = 0;
  let covered = 0;
  const mark = new Uint8Array(answer.length);
  for (const s of spans) for (let i = s.start; i < s.end; i++) mark[i] = 1;
  for (let i = 0; i < answer.length; i++) {
    if (/\s/.test(answer[i])) continue;
    total++;
    if (mark[i]) covered++;
  }
  return total ? covered / total : 0;
}

/**
 * The Stage 1 injection boundary (PRD §9.2.2, SYSTEM_DESIGN §4.3).
 *  1. keep an LLM claim only if, after whitespace/case normalization, it is a substring of the answer;
 *  2. drop duplicates and claims under 3 words; keep at most 12;
 *  3. if kept claims cover < 80% of the answer's non-space characters, add every uncovered
 *     sentence as its own claim (deterministic splitter).
 * Passing `raw = null` (LLM unavailable, timed out or invalid) segments the whole answer by sentence.
 */
export function validateClaims(raw: string[] | null, answer: string): ClaimValidation {
  const A = normalizeWithMap(answer);
  const seen = new Set<string>();
  const kept: { start: number; end: number; source: "llm" }[] = [];
  let rejected = 0;

  for (const r of raw ?? []) {
    const c = normalizeWithMap(String(r)).norm;
    const idx = c ? A.norm.indexOf(c) : -1;
    if (!c || c.split(" ").length < MIN_CLAIM_WORDS || idx < 0 || seen.has(c) || kept.length >= MAX_CLAIMS) {
      rejected++;
      continue;
    }
    seen.add(c);
    kept.push({ start: A.map[idx], end: A.map[idx + c.length - 1] + 1, source: "llm" });
  }

  const llmCoverage = coverageOf(answer, kept);
  const spans: { start: number; end: number; source: "llm" | "sentence" }[] = [...kept];

  if (llmCoverage < COVERAGE_MIN) {
    const mark = new Uint8Array(answer.length);
    for (const s of kept) for (let i = s.start; i < s.end; i++) mark[i] = 1;
    for (const s of splitSentences(answer)) {
      if (spans.length >= MAX_CLAIMS) break;
      if (words(s.text).length < MIN_CLAIM_WORDS) continue;
      let nonSpace = 0;
      let covered = 0;
      for (let i = s.start; i < s.end; i++) {
        if (/\s/.test(answer[i])) continue;
        nonSpace++;
        if (mark[i]) covered++;
      }
      if (nonSpace && covered / nonSpace < 0.5) spans.push({ start: s.start, end: s.end, source: "sentence" });
    }
  }

  spans.sort((a, b) => a.start - b.start || a.end - b.end);
  const claims: Claim[] = spans.map((s, i) => ({
    claimId: `c${i + 1}`,
    text: answer.slice(s.start, s.end),
    start: s.start,
    end: s.end,
    source: s.source,
  }));
  return { claims, keptFromLlm: kept.length, rejected, llmCoverage, coverage: coverageOf(answer, spans) };
}
