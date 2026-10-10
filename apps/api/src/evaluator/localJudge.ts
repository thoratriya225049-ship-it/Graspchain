import {
  articleText,
  normalize,
  validateJudgeResult,
  words,
  type Article,
  type ClaimLabel,
  type JevAnswers,
  type KpLabel,
  type Weakness,
} from "@graspchain/shared";
import type { Judge, JudgeCall, JudgeRequest } from "./judge";

/**
 * LOCAL DEMO JUDGE — not Jev.
 *
 * A deterministic rubric matcher that answers the same questions Jev is asked, in Jev's response
 * shape, so that fusion, gating, feedback, X-Ray, receipts and the chain are exercised by the
 * production code path when no Jev key is available. Its model id `local-rubric-judge@1` is
 * written into every receipt and shown in the UI. Known limits: it matches rubric cue phrases,
 * so it misses paraphrases it has no cue for; its probabilities are fixed heuristics, not
 * calibrated model output; re-asking returns the same answer.
 */
export const LOCAL_JUDGE_MODEL = "local-rubric-judge@1";

const STOP = new Set(
  "a an the and or but if so of to in on at by for with from as is are was were be been being it its this that these those there their they them then than which who whom what when where why how not no nor can could should would will may might must do does did done have has had having into onto over under about after before because while also only just very more most less least such each every any all both either neither one two first next you your we our he she his her i me my".split(
    " ",
  ),
);
const REASONING =
  /\b(because|therefore|thus|hence|so that|which means|this means|that means|as a result|since|so|leading to|which makes|which lets|enables|allows|causes|instead of)\b/g;
const INSTRUCTION =
  /(ignore (all|the|any|previous|prior|your|these)|give (me|this|it|the answer)|score (me|this)|\b10\s*\/\s*10\b|full marks|as the grader|dear grader|you are a|system prompt|disregard)/i;

const groupsMatched = (text: string, cues: string[][]) => cues.filter((g) => g.some((t) => text.includes(t))).length;
/** Cue groups needed for "correct"/"supported": all of them, up to three; three for longer rubrics. */
const fullMatch = (cues: string[][]) => Math.min(3, cues.length);

/** A peaked distribution over `labels` with `p` on `pick`; the rest is shared evenly. */
function peaked(labels: string[], pick: string, p: number): Record<string, number> {
  const rest = labels.length > 1 ? (1 - p) / (labels.length - 1) : 0;
  return Object.fromEntries(labels.map((l) => [l, l === pick ? p : rest]));
}

/** A distribution over ordered levels: most mass on `level`, some on its neighbours. */
function levels(n: number, level: number, p: number): Record<string, number> {
  const out: Record<string, number> = {};
  const side = (1 - p) / 2;
  for (let i = 0; i < n; i++) out[String(i)] = i === level ? p : Math.abs(i - level) === 1 ? side : 0;
  const sum = Object.values(out).reduce((s, v) => s + v, 0);
  for (const k of Object.keys(out)) out[k] /= sum;
  return out;
}

function bestSourceSentence(article: Article, text: string, candidates: number[]): number | null {
  const tw = new Set(words(text).filter((w) => w.length >= 4 && !STOP.has(w)));
  let best: number | null = null;
  let bestScore = 0;
  const pool = candidates.length ? candidates : article.sentences.map((_, i) => i);
  for (const i of pool) {
    const score = words(article.sentences[i]).filter((w) => w.length >= 4 && !STOP.has(w) && tw.has(w)).length;
    if (score > bestScore) [best, bestScore] = [i, score];
  }
  if (!candidates.length && bestScore < 2) return null;
  return best ?? candidates[0] ?? null;
}

export function localAnswers(article: Article, answer: string, claims: Record<string, string>): JevAnswers {
  const a: JevAnswers = {};
  const source = articleText(article);
  const tokens = words(answer);
  const vocab = new Set(words(source).filter((w) => w.length >= 4 && !STOP.has(w)));
  const stopRatio = tokens.length ? tokens.filter((w) => STOP.has(w)).length / tokens.length : 0;
  const vocabRatio = tokens.length ? tokens.filter((w) => vocab.has(w)).length / tokens.length : 0;
  const gibberish = tokens.length < 5 || stopRatio < 0.12 || vocabRatio < 0.04;

  type C = { id: string; text: string; label: ClaimLabel; kpId: string | null; strength: number; instruction: boolean };
  const cs: C[] = Object.entries(claims).map(([id, text]) => {
    const t = normalize(text);
    const instruction = INSTRUCTION.test(text);
    const mis = article.commonMisconceptions.find((m) => m.any.some((p) => t.includes(p)) && !(m.unless ?? []).some((p) => t.includes(p)));
    let bestKp: Article["keyPoints"][number] | null = null;
    let bestN = 0;
    for (const kp of article.keyPoints) {
      const n = groupsMatched(t, kp.cues);
      if (n > bestN) [bestKp, bestN] = [kp, n];
    }
    if (instruction) return { id, text, label: "not_in_article", kpId: null, strength: 1, instruction };
    if (mis) return { id, text, label: "contradicted", kpId: mis.kpId, strength: 1, instruction };
    // Naming terms without the mechanism is not support: every cue group of the point must appear.
    if (bestKp && bestN >= fullMatch(bestKp.cues))
      return { id, text, label: gibberish ? "partial" : "supported", kpId: bestKp.id, strength: bestN / bestKp.cues.length, instruction };
    if (bestKp && bestN >= 1) return { id, text, label: "partial", kpId: bestKp.id, strength: 0.5, instruction };
    return { id, text, label: "not_in_article", kpId: null, strength: 0, instruction };
  });

  const claimLabels = ["supported", "partial", "not_in_article", "contradicted"];
  const sentenceLabels = [...article.sentences.map((_, i) => `s${i}`), "none"];
  for (const c of cs) {
    const conf = c.label === "contradicted" ? 0.85 : c.label === "supported" ? (c.strength >= 1 ? 0.9 : 0.8) : c.label === "partial" ? 0.66 : 0.72;
    a[`${c.id}_support`] = { type: "choice", choice: c.label, confidence: conf, probabilities: peaked(claimLabels, c.label, conf) };
    const kp = c.kpId ? article.keyPoints.find((k) => k.id === c.kpId)! : null;
    const s = c.instruction ? null : bestSourceSentence(article, c.text, kp?.sentenceIdx ?? []);
    const pick = s === null ? "none" : `s${s}`;
    a[`${c.id}_source`] = { type: "choice", choice: pick, confidence: 0.7, probabilities: peaked(sentenceLabels, pick, 0.7) };
  }

  const kpLabels = ["absent", "vague", "correct", "incorrect"];
  const usable = cs.filter((c) => !c.instruction);
  for (const kp of article.keyPoints) {
    let label: KpLabel;
    let conf: number;
    if (usable.some((c) => c.label === "contradicted" && c.kpId === kp.id)) [label, conf] = ["incorrect", 0.8];
    else {
      const related = usable.filter((c) => c.label !== "contradicted" && groupsMatched(normalize(c.text), kp.cues) > 0);
      const n = groupsMatched(normalize(related.map((c) => c.text).join(" ")), kp.cues);
      if (n >= fullMatch(kp.cues) && !gibberish) [label, conf] = ["correct", n >= kp.cues.length ? 0.88 : 0.78];
      else if (n >= 1) [label, conf] = ["vague", 0.64];
      else [label, conf] = ["absent", 0.85];
    }
    a[`${kp.id}_status`] = { type: "choice", choice: label, confidence: conf, probabilities: peaked(kpLabels, label, conf) };
  }

  const n = usable.length;
  const contradicted = usable.filter((c) => c.label === "contradicted").length;
  const supported = usable.filter((c) => c.label === "supported").length;
  const acc = n === 0 || contradicted / n >= 0.5 ? 0 : contradicted >= 2 ? 1 : contradicted === 1 ? 2 : supported / n >= 0.75 ? 4 : 3;
  a.accuracy = { type: "score", score: acc, confidence: 0.7, probabilities: levels(5, acc, 0.7) };

  const claimText = normalize(usable.map((c) => c.text).join(" "));
  const markers = (claimText.match(REASONING) ?? []).length;
  const rea = gibberish ? 0 : markers === 0 ? 0 : markers === 1 ? 1 : markers <= 3 ? 2 : 3;
  a.reasoning = { type: "score", score: rea, confidence: 0.7, probabilities: levels(4, rea, 0.7) };

  const purposeGroups = article.purposeCues.filter((g) => g.some((t) => claimText.includes(t))).length;
  a.main_purpose = { type: "noul", noul: purposeGroups === article.purposeCues.length ? 0.85 : purposeGroups > 0 ? 0.45 : 0.15 };
  a.gibberish = { type: "noul", noul: gibberish ? 0.9 : 0.05 };
  a.contains_instructions = { type: "noul", noul: cs.some((c) => c.instruction) || INSTRUCTION.test(answer) ? 0.92 : 0.03 };

  const kpVals = article.keyPoints.map((k) => (a[`${k.id}_status`] as { choice: string }).choice);
  const weakness: Weakness = gibberish
    ? "off_topic"
    : contradicted
      ? "misconception"
      : kpVals.filter((l) => l === "absent").length >= 2
        ? "missing_concept"
        : kpVals.filter((l) => l === "vague").length >= 2
          ? "vague"
          : rea <= 1
            ? "poor_reasoning"
            : "none";
  a.weakness = {
    type: "choice",
    choice: weakness,
    confidence: 0.65,
    probabilities: peaked(["none", "missing_concept", "misconception", "vague", "poor_reasoning", "off_topic"], weakness, 0.65),
  };
  return a;
}

export class LocalJudge implements Judge {
  kind = "local" as const;
  model = LOCAL_JUDGE_MODEL;

  async systemOne(req: JudgeRequest): Promise<JudgeCall> {
    const t0 = Date.now();
    const all = localAnswers(req.article, req.state.student_summary, req.state.claims);
    const answers = Object.fromEntries(Object.keys(req.questions).map((k) => [k, all[k]]));
    const result = validateJudgeResult({ model: this.model, answers, usage: { input_tokens: 0, output_tokens: 0 } }, req.questions);
    return { ...result, cached: false, latencyMs: Date.now() - t0 };
  }
}
