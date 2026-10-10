import type { FastifyBaseLogger } from "fastify";
import { EVIDENCE_SYSTEM, promptTemplateFingerprint, sha256Hex, type Article } from "@graspchain/shared";
import type { ChainPort } from "./chain/client";
import { EthersChain } from "./chain/client";
import { ChainWriter } from "./chain/writer";
import type { Config } from "./config";
import { loadArticles, syncArticles } from "./content";
import { migrate, openDb, type DB } from "./db";
import { ApiCache, Usage } from "./evaluator/cache";
import { EvidenceJudge } from "./evaluator/evidenceJudge";
import { EventHub } from "./evaluator/hub";
import { JevJudge, type Judge } from "./evaluator/judge";
import { createLlm, FEEDBACK_SYSTEM, SEGMENT_SYSTEM, type Llm } from "./evaluator/llm";
import { LocalJudge } from "./evaluator/localJudge";
import { Evaluator } from "./evaluator/pipeline";
import { FairGate } from "./fairgate/service";
import { IntegrityService } from "./integrity/service";
import { SessionService } from "./session/service";
import { SettingsStore } from "./settings";

/** Everything a route needs. Built once at boot; tests build it with fakes. */
export interface Ctx {
  cfg: Config;
  db: DB;
  log: FastifyBaseLogger;
  articles: Map<string, Article>;
  judge: Judge;
  llm: Llm | null;
  chain: ChainPort;
  writer: ChainWriter;
  hub: EventHub;
  cache: ApiCache;
  usage: Usage;
  settings: SettingsStore;
  fairgate: FairGate;
  sessions: SessionService;
  integrity: IntegrityService;
  evaluator: Evaluator;
  promptHash: string;
  now: () => number;
}

export interface CtxOverrides {
  db?: DB;
  judge?: Judge;
  llm?: Llm | null;
  chain?: ChainPort;
  now?: () => number;
}

export async function createContext(cfg: Config, log: FastifyBaseLogger, o: CtxOverrides = {}): Promise<Ctx> {
  const db = o.db ?? openDb(cfg.dbPath);
  migrate(db);
  const articles = loadArticles();
  syncArticles(db, articles);
  const cache = new ApiCache(db);
  const usage = new Usage(db);
  const llm = o.llm !== undefined ? o.llm : createLlm(cfg, cache, usage);
  const judge =
    o.judge ?? (cfg.JUDGE === "local" ? new LocalJudge() : cfg.JUDGE === "evidence" ? new EvidenceJudge(cfg, llm) : new JevJudge(cfg, cache, usage));
  const chain = o.chain ?? new EthersChain(cfg);
  const ctx = {
    cfg,
    db,
    log,
    articles,
    judge,
    llm,
    chain,
    hub: new EventHub(),
    cache,
    usage,
    settings: new SettingsStore(db, cfg),
    promptHash: await sha256Hex(promptTemplateFingerprint({ segment: SEGMENT_SYSTEM, feedback: FEEDBACK_SYSTEM, evidence: EVIDENCE_SYSTEM })),
    now: o.now ?? Date.now,
  } as Ctx;
  ctx.writer = new ChainWriter(db, chain, log);
  ctx.fairgate = new FairGate(ctx);
  ctx.sessions = new SessionService(ctx);
  ctx.integrity = new IntegrityService(ctx);
  ctx.evaluator = new Evaluator(ctx);
  return ctx;
}
