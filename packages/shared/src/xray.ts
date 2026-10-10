import type { CopyAnalysis } from "./copy";
import type { Article, Claim, FeedbackRecord, FusionResult, XRay } from "./types";

/** X-Ray payload (PRD §9.3): article sentences, key-point labels, claims linked to sentences. */
export function buildXray(
  article: Article,
  answer: string,
  claims: Claim[],
  fused: FusionResult,
  feedback: FeedbackRecord | null,
  copy: CopyAnalysis | null = null,
): XRay {
  const mis = new Map((feedback?.feedback.misunderstood ?? []).map((m) => [m.claimId, m]));
  return {
    articleId: article.id,
    title: article.title,
    sentences: article.sentences,
    breaks: article.breaks,
    keyPoints: fused.keyPoints.map((k) => {
      const kp = article.keyPoints.find((x) => x.id === k.id)!;
      return { id: k.id, concept: kp.concept, statement: kp.statement, sentenceIdx: kp.sentenceIdx, label: k.label, p: k.p };
    }),
    claims: fused.claims.map((c) => {
      const claim = claims.find((x) => x.claimId === c.claimId)!;
      const m = mis.get(c.claimId);
      return {
        claimId: c.claimId,
        text: claim.text,
        start: claim.start,
        end: claim.end,
        label: c.label,
        p: c.p,
        sourceSentence: c.sourceSentence,
        correctVersion: m?.correctVersion ?? null,
        why: m?.why ?? null,
      };
    }),
    answer,
    copied: copy?.spans ?? [],
  };
}
