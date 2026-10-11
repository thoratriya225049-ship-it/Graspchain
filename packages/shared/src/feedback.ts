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
    if (!GAP.has(l ?? "") || missed.some((x) => x.keyPointId === m.keyPointId)) {
      dropped++;
      continue;
    }
    missed.push(m);
  }
  const weightOf = new Map(ctx.article.keyPoints.map((k) => [k.id, k.weight]));
  for (const k of ctx.fused.keyPoints) {
    if (isGap(ctx, k.id, k.label) && !missed.some((m) => m.keyPointId === k.id)) missed.push({ keyPointId: k.id, whatToAdd: gapHint(ctx, k.id, k.label) });
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
    // The headline is never the LLM's: it is stated from the judge's classifications, so it cannot praise past the evidence.
    feedback: { oneLineSummary: verdictSummary(ctx), understood, missed, misunderstood, couldBeBetter: f.couldBeBetter.slice(0, 4), nextStep: f.nextStep },
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
  const missed = byWeight.filter((k) => isGap(ctx, k.id, k.label)).map((k) => ({ keyPointId: k.id, whatToAdd: gapHint(ctx, k.id, k.label) }));

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

  const d = fused.dimensions;
  const advice: [number, string][] = [
    [d.coverage, "Re-read for the ideas you missed and explain each one in a sentence."],
    [d.correctness, "Fix the claims that contradict the article before adding anything new."],
    [d.reasoning, "Practise linking ideas with “because” and “so”."],
    [d.ownWords, "Write your next summary without echoing the article's phrasing."],
  ];
  const nextStep = advice.reduce((a, b) => (b[0] < a[0] ? b : a))[1];

  return { oneLineSummary: verdictSummary(ctx), understood, missed, misunderstood, couldBeBetter: couldBeBetter.slice(0, 4), nextStep };
}

// ───────────────────────── Evidence-first wording ─────────────────────────

/** Key-point labels that go in "What you missed or misread": partial, wrong and absent are all gaps. */
const GAP = new Set<string>(["vague", "incorrect", "absent"]);
/** A wrong key point already shown through a contradicted claim on its sentences is not listed twice. */
function isGap(ctx: FeedbackContext, kpId: string, label: string): boolean {
  if (!GAP.has(label)) return false;
  if (label !== "incorrect") return true;
  const kp = ctx.article.keyPoints.find((k) => k.id === kpId);
  return !ctx.fused.claims.some((c) => c.label === "contradicted" && c.sourceSentence !== null && !!kp?.sentenceIdx.includes(c.sourceSentence));
}
/** The judge counts the article's central idea as stated from this main-purpose probability. */
const MAIN_IDEA_STATED = 0.5;

const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
/** "a", "a and b", "a, b and c" (or "or"). */
function list(items: string[], joiner: "and" | "or" = "and"): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${joiner} ${items[items.length - 1]}`;
}

/** What to do about a gap, stated as what kind of gap it is: missing, only partly there, or wrong. */
function gapHint(ctx: FeedbackContext, kpId: string, label: string): string {
  const kp = ctx.article.keyPoints.find((k) => k.id === kpId)!;
  if (label === "incorrect") return `Your answer gets this idea wrong. The source says: ${kp.statement}`;
  if (label === "vague") return `Partial understanding: you touch on this idea but do not explain it fully. ${kp.addHint}`;
  return kp.addHint;
}

/**
 * The one-line summary, built only from the judge's classifications against the source (ground truth →
 * evidence → classification → wording). It names what was right, then every gap by kind — wrong,
 * partial, missing — and never praises beyond what the evidence supports.
 */
export function verdictSummary(ctx: Pick<FeedbackContext, "article" | "fused">): string {
  const { article, fused } = ctx;
  const kpById = new Map(article.keyPoints.map((k) => [k.id, k]));
  const byWeight = [...fused.keyPoints].sort((a, b) => (kpById.get(b.id)?.weight ?? 0) - (kpById.get(a.id)?.weight ?? 0));
  // Concept names are short phrases ("Stability, not speed"), so each is quoted to keep the lists readable.
  const names = (label: string) => byWeight.filter((k) => k.label === label).map((k) => `“${lowerFirst(kpById.get(k.id)?.concept ?? k.id)}”`);
  const correct = names("correct");
  const partial = names("vague");
  const wrong = names("incorrect");
  const absent = names("absent");
  const contradicted = fused.claims.filter((c) => c.label === "contradicted").length;
  const n = fused.keyPoints.length;
  const mainIdea = fused.noul.mainPurpose >= MAIN_IDEA_STATED;
  const gaps = partial.length + wrong.length + absent.length + contradicted;

  if (!gaps) {
    if (n && correct.length === n) {
      return fused.dimensions.reasoning < 0.5
        ? `You explained all ${n} key ideas correctly. To show full understanding, also explain why each idea leads to the next.`
        : `You explained all ${n} key ideas correctly and showed how they connect.`;
    }
    return "Your answer does not show evidence for any of the article's key ideas yet.";
  }

  // What was right: only what the evidence supports.
  const right = correct.length
    ? `You explained ${correct.length > 3 ? `${correct.length} of ${n} key ideas` : list(correct)} correctly`
    : mainIdea
      ? "You identified the main idea"
      : `Your answer does not yet ${partial.length ? "fully " : ""}explain any of the key ideas`;
  const missingWord = absent.length > 1 ? "several important concepts are missing" : absent.length ? "an important concept is missing" : null;
  const headline =
    correct.length || mainIdea
      ? `${right}, but ${wrong.length || contradicted ? "part of your answer is incorrect" : (missingWord ?? "your understanding is only partial")}.`
      : `${right}.`;

  // Every gap, by kind: wrong first, then partial, then missing.
  const detail: string[] = [];
  if (wrong.length) detail.push(`You misunderstood ${list(wrong)}.`);
  if (contradicted && !wrong.length) detail.push(`${contradicted === 1 ? "One of your claims contradicts" : `${contradicted} of your claims contradict`} the source.`);
  if (partial.length) detail.push(`You only partly explain ${list(partial)}: ${partial.length > 1 ? "they are" : "it is"} mentioned but not fully explained.`);
  if (absent.length) detail.push(`Your answer does not explain ${list(absent, "or")}.`);

  const action =
    wrong.length || contradicted
      ? absent.length || partial.length
        ? "Correct the misunderstanding first, then fill in what is missing."
        : "Correct the misunderstanding to show accurate understanding."
      : absent.length
        ? `Add ${absent.length > 1 ? "these concepts" : "this concept"} to demonstrate complete understanding.`
        : "Explain how and why, not just what, to show full understanding.";

  return [headline, ...detail, action].join(" ");
}
