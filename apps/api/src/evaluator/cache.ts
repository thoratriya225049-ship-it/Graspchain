import crypto from "node:crypto";
import { canonicalize } from "@graspchain/shared";
import { nowIso, type DB } from "../db";

/**
 * Response cache (`api_cache`) and usage ledger (`api_usage`). Every paid call is cached by
 * sha256(provider + model + JCS(input)), so nothing is paid for twice and DEMO_MODE=replay can
 * serve previously seen requests with the network off.
 */
export function cacheKey(provider: string, model: string, input: unknown): string {
  return crypto
    .createHash("sha256")
    .update(`${provider}\n${model}\n${canonicalize(input)}`)
    .digest("hex");
}

export class ApiCache {
  constructor(private db: DB) {}

  get<T>(key: string): T | null {
    const row = this.db.prepare("SELECT response FROM api_cache WHERE key = ?").get(key) as { response: string } | undefined;
    if (!row) return null;
    this.db.prepare("UPDATE api_cache SET hits = hits + 1 WHERE key = ?").run(key);
    return JSON.parse(row.response) as T;
  }

  put(key: string, provider: string, response: unknown) {
    this.db
      .prepare("INSERT INTO api_cache (key, provider, response, hits, createdAt) VALUES (?, ?, ?, 0, ?) ON CONFLICT(key) DO NOTHING")
      .run(key, provider, JSON.stringify(response), nowIso());
  }
}

export const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

export class Usage {
  constructor(private db: DB) {}

  record(provider: string, u: { inputTokens?: number; outputTokens?: number; call?: boolean; cacheHit?: boolean }) {
    this.db
      .prepare(
        `INSERT INTO api_usage (day, provider, inputTokens, outputTokens, calls, cacheHits) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(day, provider) DO UPDATE SET inputTokens = inputTokens + excluded.inputTokens,
           outputTokens = outputTokens + excluded.outputTokens, calls = calls + excluded.calls, cacheHits = cacheHits + excluded.cacheHits`,
      )
      .run(utcDay(), provider, u.inputTokens ?? 0, u.outputTokens ?? 0, u.call ? 1 : 0, u.cacheHit ? 1 : 0);
  }

  today(provider: string): { inputTokens: number; outputTokens: number; calls: number; cacheHits: number } {
    const row = this.db.prepare("SELECT inputTokens, outputTokens, calls, cacheHits FROM api_usage WHERE day = ? AND provider = ?").get(utcDay(), provider) as
      { inputTokens: number; outputTokens: number; calls: number; cacheHits: number } | undefined;
    return row ?? { inputTokens: 0, outputTokens: 0, calls: 0, cacheHits: 0 };
  }
}
