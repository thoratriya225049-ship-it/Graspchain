import { z } from "zod";
import { normalizeWithMap, words } from "./text";
import type { Article, Claim, Feedback, FusionResult } from "./types";

export const FeedbackSchema = z.object({
  oneLineSummary: z.string().min(1).max(400),
  understood: z.array(z.object({ keyPointId: z.string(), evidence: z.string() })).max(12),
  missed: z.array(z.object({ keyPointId: z.string(), whatToAdd: z.string().min(1).max(400) })).max(12),
  misunderstood: z
    .array(z.object({ claimId: z.string(), studentQuote: z.string(), why: z.string().min(1).max(400), correctVersion: z.string().min(1).max(400) }))
    .max(12),
  couldBeBetter: z.array(z.object({ action: z.string().min(1).max(300), exampleSentence: z.string().min(1).max(400) })).max(8),
  nextStep: z.string().min(1).max(400),
});

export interface FeedbackContext {
  article: Article;
  answer: string;
  claims: Claim[];
  fused: FusionResult;
}

/** Return the exact original span of `quote` inside `answer` (whitespace/case-insensitive), or null. */
export function exactSpan(answer: string, quote: string): string | null {
  const q = normalizeWithMap(quote).norm;
  if (q.length < 3) return null;
  const A = normalizeWithMap(answer);
  const i = A.norm.indexOf(q);
  if (i < 0) return null;
  return answer.slice(A.map[i], A.map[i + q.length - 1] + 1);
}

/**
 * Validators (PRD §9.2.8): drop non-substring quotes, unknown ids, and items that contradict
 * Jev's labels; cap couldBeBetter at 4. Missing key points the LLM left out are added from the
 * rubric so the list is complete. Returns null if the output is unusable.
 */
export function validateFeedback(raw: unknown, ctx: FeedbackContext): { feedback: Feedback; dropped: number } | null {
  const parsed = FeedbackSchema.safeParse(raw);
  if (!parsed.success) return null;
  const f = parsed.data;
  const kpLabel = new Map(ctx.fused.keyPoints.map((k) => [k.id, k.label]));
  const claimLabel = new Map(ctx.fused.claims.map((c) => [c.claimId, c.label]));
  let dropped = 0;

  const understood: Feedback["understood"] = [];
  for (const u of f.understood) {
    const span = exactSpan(ctx.answer, u.evidence);
    if (kpLabel.get(u.keyPointId) !== "correct" || !span || understood.some((x) => x.keyPointId === u.keyPointId)) {
      dropped++;
      continue;
    }
    understood.push({ keyPointId: u.keyPointId, evidence: span });
  }

  const missed: Feedback["missed"] = [];
  for (const m of f.missed) {
    const l = kpLabel.get(m.keyPointId);
    if ((l !== "absent" && l !== "vague") || missed.some((x) => x.keyPointId === m.keyPointId)) {
      dropped++;
      continue;
    }
    missed.push(m);
  }
  const weightOf = new Map(ctx.article.keyPoints.map((k) => [k.id, k.weight]));
  for (const k of ctx.fused.keyPoints) {
    if ((k.label === "absent" || k.label === "vague") && !missed.some((m) => m.keyPointId === k.id)) {
      missed.push({ keyPointId: k.id, whatToAdd: ctx.article.keyPoints.find((x) => x.id === k.id)!.addHint });
    }
  }
  missed.sort((a, b) => (weightOf.get(b.keyPointId) ?? 0) - (weightOf.get(a.keyPointId) ?? 0));

  const misunderstood: Feedback["misunderstood"] = [];
  for (const m of f.misunderstood) {
    const l = claimLabel.get(m.claimId);
    const span = exactSpan(ctx.answer, m.studentQuote);
    if ((l !== "contradicted" && l !== "partial") || !span) {
      dropped++;
      continue;
    }
    misunderstood.push({ ...m, studentQuote: span });
  }

  if (f.couldBeBetter.length > 4) dropped += f.couldBeBetter.length - 4;
  return {
    feedback: { oneLineSummary: f.oneLineSummary, understood, missed, misunderstood, couldBeBetter: f.couldBeBetter.slice(0, 4), nextStep: f.nextStep },
    dropped,
  };
}

const content = (s: string) => new Set(words(s).filter((w) => w.length >= 4));

/** Best supporting claim for a key point: one Jev linked to its sentences, else the closest in wording. */
function evidenceFor(ctx: FeedbackContext, kpId: string, used: Set<string>): string {
  const kp = ctx.article.keyPoints.find((k) => k.id === kpId)!;
  const usable = ctx.fused.claims.filter((c) => (c.label === "supported" || c.label === "partial") && !used.has(c.claimId));
  const pick = (id: string) => ctx.claims.find((c) => c.claimId === id)?.text ?? "";
  const take = (id: string) => {
    used.add(id);
    return pick(id);
  };
  const linked = usable.find((c) => c.sourceSentence !== null && kp.sentenceIdx.includes(c.sourceSentence));
  if (linked) return take(linked.claimId);
  const kw = content(kp.statement);
  let best: string | null = null;
  let bestN = 1;
  for (const c of usable) {
    const n = [...content(pick(c.claimId))].filter((w) => kw.has(w)).length;
    if (n > bestN) [best, bestN] = [c.claimId, n];
  }
  // A quote is shown once; a key point with no unused supporting claim is listed without one.
  return best ? take(best) : "";
}

/** Template feedback built only from Jev's results and the rubric (the fallback; never empty). */
export function templateFeedback(ctx: FeedbackContext): Feedback {
  const { article, fused } = ctx;
  const kpById = new Map(article.keyPoints.map((k) => [k.id, k]));
  const byWeight = [...fused.keyPoints].sort((a, b) => kpById.get(b.id)!.weight - kpById.get(a.id)!.weight);

  const used = new Set<string>();
  const understood = fused.keyPoints.filter((k) => k.label === "correct").map((k) => ({ keyPointId: k.id, evidence: evidenceFor(ctx, k.id, used) }));
  const missed = byWeight.filter((k) => k.label === "absent" || k.label === "vague").map((k) => ({ keyPointId: k.id, whatToAdd: kpById.get(k.id)!.addHint }));

  const misunderstood: Feedback["misunderstood"] = [];
  for (const c of fused.claims) {
    if (c.label !== "contradicted") continue;
    const text = ctx.claims.find((x) => x.claimId === c.claimId)?.text ?? "";
    const t = normalizeWithMap(text).norm;
    const mis = article.commonMisconceptions.find((m) => m.any.some((p) => t.includes(p)) && !(m.unless ?? []).some((p) => t.includes(p)));
    const kp = c.sourceSentence !== null ? article.keyPoints.find((k) => k.sentenceIdx.includes(c.sourceSentence!)) : undefined;
    misunderstood.push({
      claimId: c.claimId,
      studentQuote: text,
      why:
        mis?.why ??
        (c.sourceSentence !== null ? `The article says: “${article.sentences[c.sourceSentence]}”` : "The article does not support this; it says otherwise."),
      correctVersion:
        mis?.correction ?? kp?.statement ?? (c.sourceSentence !== null ? article.sentences[c.sourceSentence] : "Re-check this claim against the article."),
    });
  }

  const couldBeBetter: Feedback["couldBeBetter"] = [];
  for (const k of byWeight) {
    if (couldBeBetter.length >= 2) break;
    if (k.label === "vague" || k.label === "absent") {
      const kp = kpById.get(k.id)!;
      couldBeBetter.push({
        action:
          k.label === "vague"
            ? `Explain the mechanism behind “${kp.concept.toLowerCase()}”, not just the term.`
            : `Add the idea “${kp.concept.toLowerCase()}”.`,
        exampleSentence: kp.example,
      });
    }
  }
  if (fused.dimensions.reasoning < 0.5) {
    couldBeBetter.push({
      action: "Connect your points with reasons: say why each step leads to the next.",
      exampleSentence: "Because each step depends on the one before it, a change early on shows up at the end.",
    });
  }
  if (fused.overlap5 > 0.3) {
    couldBeBetter.push({
      action: "Rephrase in your own words instead of repeating the article's phrasing.",
      exampleSentence: "Explain it the way you would to a friend who has not read the article.",
    });
  }
  if (fused.noul.mainPurpose < 0.5) {
    couldBeBetter.push({
      action: "Open with the article's central idea in one sentence.",
      exampleSentence: `This article explains ${article.title.charAt(0).toLowerCase()}${article.title.slice(1)}.`,
    });
  }

  const nUnderstood = understood.length;
  const parts = [`You explained ${nUnderstood} of ${fused.keyPoints.length} key ideas`];
  if (misunderstood.length) parts.push(`${misunderstood.length} of your claims ${misunderstood.length > 1 ? "contradict" : "contradicts"} the article`);
  const d = fused.dimensions;
  const advice: [number, string][] = [
    [d.coverage, "Re-read for the ideas you missed and explain each one in a sentence."],
    [d.correctness, "Fix the claims that contradict the article before adding anything new."],
    [d.reasoning, "Practise linking ideas with “because” and “so”."],
    [d.ownWords, "Write your next summary without echoing the article's phrasing."],
  ];
  const nextStep = advice.reduce((a, b) => (b[0] < a[0] ? b : a))[1];

  return { oneLineSummary: parts.join("; ") + ".", understood, missed, misunderstood, couldBeBetter: couldBeBetter.slice(0, 4), nextStep };
}
