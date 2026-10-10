import { APIError, TypeSafeClient } from "@typesafe-ai/sdk";
import {
  estimateTokens,
  validateJudgeResult,
  type Article,
  type Claim,
  type EvidenceDecision,
  type JevQuestions,
  type JevState,
  type JudgeKind,
  type JudgeResult,
} from "@graspchain/shared";
import type { Config } from "../config";
import { AppError } from "../errors";
import { ApiCache, Usage, cacheKey } from "./cache";

export interface JudgeRequest {
  article: Article;
  state: JevState;
  questions: JevQuestions;
  /** The validated claims (the evidence judge needs their spans). */
  claims?: Claim[];
  /** "bypass" skips the cache read (benchmark repeatability runs). */
  cache?: "use" | "bypass";
}

export interface JudgeCall extends JudgeResult {
  cached: boolean;
  latencyMs: number;
  /** Evidence judge only: the validated evidence and the rules that fired. */
  evidence?: EvidenceDecision;
}

/** Stage 2 judge. `kind` is written into every receipt so a demo judgment can never pass as Jev. */
export interface Judge {
  kind: JudgeKind;
  model: string;
  systemOne(req: JudgeRequest): Promise<JudgeCall>;
}

/** $0.042 per 1M input tokens; output is free (TECH_STACK §4). */
export const JEV_USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;

/**
 * Jev through the official TypeScript SDK (`TypeSafeClient.systemOne`). One code path for all
 * access routes: TypeSafe direct, Vercel AI Gateway or OpenRouter, selected by JEV_BASE_URL.
 * Retries: the SDK retries 408/429/5xx (incl. 529) with exponential backoff and jitter;
 * 401/422 are not retried.
 */
export class JevJudge implements Judge {
  kind = "jev" as const;
  model: string;
  private client: TypeSafeClient | null;

  constructor(
    private cfg: Config,
    private cache: ApiCache,
    private usage: Usage,
    client?: TypeSafeClient,
  ) {
    this.model = cfg.JEV_MODEL;
    this.client =
      client ??
      (cfg.JEV_API_KEY
        ? new TypeSafeClient({
            apiKey: cfg.JEV_API_KEY,
            baseURL: cfg.JEV_BASE_URL,
            defaultModel: cfg.JEV_MODEL,
            timeout: cfg.JEV_TIMEOUT_MS,
            logLevel: "off",
            retry: { maxRetries: 3, backoffInitialMs: 1000, backoffMaxMs: 4000, backoffJitter: 0.25 },
          })
        : null);
  }

  async systemOne(req: JudgeRequest): Promise<JudgeCall> {
    const t0 = Date.now();
    const key = cacheKey("jev", this.model, { state: req.state, questions: req.questions });
    if (req.cache !== "bypass") {
      const hit = this.cache.get<JudgeResult>(key);
      if (hit) {
        this.usage.record("jev", { cacheHit: true });
        return { ...validateJudgeResult(hit, req.questions), cached: true, latencyMs: Date.now() - t0 };
      }
    }
    if (this.cfg.DEMO_MODE === "replay") {
      throw new AppError(503, "REPLAY_MISS", "DEMO_MODE=replay: this exact request has no cached Jev answer, so it cannot be judged offline.");
    }
    if (!this.client) throw new AppError(503, "JEV_NOT_CONFIGURED", "JEV_API_KEY is not set.");

    const spent = this.usage.today("jev").inputTokens;
    if (spent + estimateTokens(req.state, req.questions) > this.cfg.JEV_DAILY_TOKEN_CAP) {
      throw new AppError(
        503,
        "BUDGET_EXHAUSTED",
        `Daily Jev token cap reached (${spent.toLocaleString()} of ${this.cfg.JEV_DAILY_TOKEN_CAP.toLocaleString()}).`,
      );
    }

    try {
      const raw = await this.client.systemOne({ model: this.model, state: req.state as never, questions: req.questions as never });
      const result = validateJudgeResult(raw, req.questions);
      this.usage.record("jev", { inputTokens: result.usage.input_tokens, outputTokens: result.usage.output_tokens, call: true });
      this.cache.put(key, "jev", result);
      return { ...result, cached: false, latencyMs: Date.now() - t0 };
    } catch (e) {
      if (e instanceof APIError) {
        throw new AppError(
          e.status === 401 ? 503 : 502,
          e.status === 401 ? "JEV_AUTH" : "JEV_ERROR",
          `Jev returned HTTP ${e.status}${e.requestId ? ` (request ${e.requestId})` : ""}.`,
        );
      }
      throw e;
    }
  }
}
