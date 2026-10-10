import { EVIDENCE_JUDGE_VERSION, decideEvidence, decisionToAnswers, validateJudgeResult } from "@graspchain/shared";
import type { Config } from "../config";
import { AppError } from "../errors";
import type { Judge, JudgeCall, JudgeRequest } from "./judge";
import type { Llm } from "./llm";

function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error(`timed out after ${ms} ms`)), ms);
  return Promise.race([
    run(ac.signal),
    new Promise<never>((_, rej) => ac.signal.addEventListener("abort", () => rej(ac.signal.reason ?? new Error("aborted")))),
  ]).finally(() => clearTimeout(t));
}

/**
 * GRASPCHAIN EVIDENCE JUDGE (Stage 2). The LLM (Groq, via the backend only) extracts evidence;
 * `decideEvidence` validates every quote against the article and the answer and applies the
 * published rules; the result is expressed in the judge-answer shape `fuse()` already scores.
 * The LLM never sees a scale and never returns a score.
 *
 * Failure is honest: no LLM, a timeout or an unusable extraction throws, and the pipeline marks
 * the attempt delayed and retries it. Nothing is invented in its place.
 */
export class EvidenceJudge implements Judge {
  kind = "evidence" as const;
  model: string;

  constructor(
    private cfg: Config,
    private llm: Llm | null,
  ) {
    this.model = `${EVIDENCE_JUDGE_VERSION}+${llm ? `${llm.provider}/${cfg.EVIDENCE_MODEL ?? llm.model}` : "unconfigured"}`;
  }

  async systemOne(req: JudgeRequest): Promise<JudgeCall> {
    const t0 = Date.now();
    if (!this.llm) throw new AppError(503, "EVIDENCE_NOT_CONFIGURED", "The evidence judge needs an LLM (LLM_PROVIDER, LLM_MODEL and its API key).");
    if (!req.claims) throw new Error("EvidenceJudge needs the validated claims");
    const input = { article: req.article, answer: req.state.student_summary, claims: req.claims };
    let x: Awaited<ReturnType<Llm["extractEvidence"]>>;
    try {
      x = await withTimeout(this.cfg.EVIDENCE_TIMEOUT_MS, (signal) => this.llm!.extractEvidence(input, signal));
    } catch (e) {
      if (e instanceof AppError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      if (/replay/i.test(msg)) throw new AppError(503, "REPLAY_MISS", msg);
      throw new AppError(
        502,
        /401|invalid api key|unauthorized/i.test(msg) ? "EVIDENCE_AUTH" : "EVIDENCE_ERROR",
        `Evidence extraction failed: ${msg.slice(0, 200)}`,
      );
    }
    let evidence;
    try {
      evidence = decideEvidence(x.raw, { ...input, extractor: x.model });
    } catch (e) {
      throw new AppError(502, "EVIDENCE_INVALID", e instanceof Error ? e.message : "Evidence extraction was unusable.");
    }
    const all = decisionToAnswers(evidence, req.article);
    const answers = Object.fromEntries(Object.keys(req.questions).map((k) => [k, all[k]]));
    const result = validateJudgeResult({ model: this.model, answers, usage: { input_tokens: x.tokens, output_tokens: 0 } }, req.questions);
    return { ...result, cached: x.cached, latencyMs: Date.now() - t0, evidence };
  }
}
