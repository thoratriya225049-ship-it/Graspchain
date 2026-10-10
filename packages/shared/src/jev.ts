import { z } from "zod";
import type { ChoiceAnswer, JevAnswer, JevAnswers, JudgeResult, NoulAnswer, ScoreAnswer } from "./types";
import type { JevQuestions } from "./questions";

/** Zod schemas mirroring the official `systemOne` response fields (PRD §9.2.4). */
const prob = z.number().min(0).max(1);
export const ChoiceAnswerSchema = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  confidence: prob,
  probabilities: z.record(z.string(), prob),
});
export const ScoreAnswerSchema = z.object({
  type: z.literal("score"),
  score: z.number(),
  confidence: prob,
  legend: z.record(z.string(), z.unknown()).optional(),
  probabilities: z.record(z.string(), prob),
});
export const NoulAnswerSchema = z.object({ type: z.literal("noul"), noul: prob });
export const JevAnswerSchema = z.discriminatedUnion("type", [ChoiceAnswerSchema, ScoreAnswerSchema, NoulAnswerSchema]);
export const JudgeResultSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), JevAnswerSchema),
  usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }),
});

export class JudgeResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JudgeResponseError";
  }
}

const normalizeDist = (p: Record<string, number>, keys: string[]): Record<string, number> => {
  const out: Record<string, number> = {};
  let sum = 0;
  for (const k of keys) sum += p[k] ?? 0;
  for (const k of keys) out[k] = sum > 0 ? (p[k] ?? 0) / sum : 1 / keys.length;
  return out;
};

/**
 * Validate a raw response against the questions that were asked: every question answered, with
 * the right type, and distributions over exactly the labels/levels that were offered.
 */
export function validateJudgeResult(raw: unknown, questions: JevQuestions): JudgeResult {
  const parsed = JudgeResultSchema.safeParse(raw);
  if (!parsed.success) throw new JudgeResponseError(`Judge response failed validation: ${parsed.error.issues[0]?.message}`);
  const answers: JevAnswers = {};
  for (const [key, q] of Object.entries(questions)) {
    const a = parsed.data.answers[key];
    if (!a) throw new JudgeResponseError(`Judge response is missing "${key}"`);
    if (a.type !== q.type) throw new JudgeResponseError(`"${key}" answered as ${a.type}, asked as ${q.type}`);
    if (a.type === "choice" && q.type === "choice") {
      const labels = Object.keys(q.criteria);
      const probabilities = normalizeDist(a.probabilities, labels);
      const choice = labels.includes(a.choice) ? a.choice : argmax(probabilities);
      answers[key] = { type: "choice", choice, confidence: a.confidence, probabilities };
    } else if (a.type === "score" && q.type === "score") {
      const levels = q.criteria.map((_, i) => String(i));
      const probabilities = normalizeDist(a.probabilities, levels);
      answers[key] = { type: "score", score: a.score, confidence: a.confidence, legend: a.legend, probabilities };
    } else if (a.type === "noul") {
      answers[key] = { type: "noul", noul: a.noul };
    }
  }
  return { model: parsed.data.model, answers, usage: parsed.data.usage };
}

export function argmax(p: Record<string, number>): string {
  let best = "";
  let bp = -1;
  for (const [k, v] of Object.entries(p)) if (v > bp) [best, bp] = [k, v];
  return best;
}

/** Thresholds (PRD §9.2.6): choice/score confidence < 0.6; noul |2p − 1| < 0.3. */
export const CONFIDENCE_MIN = 0.6;
export const NOUL_MARGIN_MIN = 0.3;

export function isUncertain(a: JevAnswer): boolean {
  if (a.type === "noul") return Math.abs(2 * a.noul - 1) < NOUL_MARGIN_MIN;
  return a.confidence < CONFIDENCE_MIN;
}

/** Keys worth re-asking. `cN_source` is excluded: it only positions the X-Ray link. */
export function uncertainKeys(answers: JevAnswers): string[] {
  return Object.entries(answers)
    .filter(([k, a]) => !k.endsWith("_source") && isUncertain(a))
    .map(([k]) => k);
}

const avg = (a: Record<string, number>, b: Record<string, number>) => {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return Object.fromEntries(keys.map((k) => [k, ((a[k] ?? 0) + (b[k] ?? 0)) / 2]));
};

/** Re-ask merge: average the two distributions; recompute choice and expected score. */
export function mergeAnswers(base: JevAnswers, again: JevAnswers): JevAnswers {
  const out: JevAnswers = { ...base };
  for (const [k, b] of Object.entries(again)) {
    const a = base[k];
    if (!a || a.type !== b.type) continue;
    if (a.type === "choice" && b.type === "choice") {
      const probabilities = avg(a.probabilities, b.probabilities);
      out[k] = { type: "choice", choice: argmax(probabilities), confidence: (a.confidence + b.confidence) / 2, probabilities } satisfies ChoiceAnswer;
    } else if (a.type === "score" && b.type === "score") {
      const probabilities = avg(a.probabilities, b.probabilities);
      const score = Object.entries(probabilities).reduce((s, [l, p]) => s + Number(l) * p, 0);
      out[k] = { type: "score", score, confidence: (a.confidence + b.confidence) / 2, legend: a.legend, probabilities } satisfies ScoreAnswer;
    } else if (a.type === "noul" && b.type === "noul") {
      out[k] = { type: "noul", noul: (a.noul + b.noul) / 2 } satisfies NoulAnswer;
    }
  }
  return out;
}

/** Order-flip helper: re-key a reversed-order run back to canonical label order (labels are names, so this is identity on keys). */
export function choiceAgreement(a: JevAnswers, b: JevAnswers): { agree: number; total: number } {
  let agree = 0;
  let total = 0;
  for (const [k, x] of Object.entries(a)) {
    const y = b[k];
    if (x.type !== "choice" || !y || y.type !== "choice") continue;
    total++;
    if (x.choice === y.choice) agree++;
  }
  return { agree, total };
}
