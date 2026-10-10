import type { FastifyInstance } from "fastify";
import { CHAIN_NAMES, MAX_WORDS, MIN_WORDS } from "@graspchain/shared";
import type { Ctx } from "../context";

export function publicConfig(ctx: Ctx) {
  const s = ctx.settings.get();
  return {
    appName: "Graspchain",
    environment: ctx.cfg.NODE_ENV,
    judge: { kind: ctx.judge.kind, model: ctx.judge.model },
    llm: ctx.llm ? { enabled: true, provider: ctx.llm.provider, model: ctx.llm.model } : { enabled: false, provider: null, model: null },
    demoMode: ctx.cfg.DEMO_MODE,
    adminDemoTools: ctx.cfg.ADMIN_DEMO_TOOLS,
    chain: {
      chainId: ctx.chain.chainId,
      name: CHAIN_NAMES[ctx.chain.chainId] ?? `Chain ${ctx.chain.chainId}`,
      registry: ctx.chain.registry,
      explorerUrl: ctx.cfg.explorerUrl,
      publicRpcUrl: ctx.cfg.publicRpcUrl,
      canWrite: ctx.chain.canWrite,
    },
    verifierUrl: ctx.cfg.VERIFIER_URL,
    publicWebUrl: ctx.cfg.PUBLIC_WEB_URL,
    researchMode: s.researchMode,
    clockMode: s.clockMode,
    fairMode: s.fairMode,
    fairclockCapS: ctx.cfg.FAIRCLOCK_CAP_S,
    windowMs: ctx.cfg.WINDOW_MS,
    concurrency: ctx.cfg.CONCURRENCY,
    minWords: MIN_WORDS,
    maxWords: MAX_WORDS,
  };
}

export const healthRoutes = (ctx: Ctx) => async (app: FastifyInstance) => {
  app.get("/healthz", async () => ({ ok: true, uptimeS: Math.round(process.uptime()) }));

  /** Readiness without paid calls: DB open, chain reachable, judge/LLM configured. */
  app.get("/readyz", async (_req, reply) => {
    let db = false;
    try {
      db = (ctx.db.prepare("SELECT 1 ok").get() as { ok: number }).ok === 1;
    } catch {
      db = false;
    }
    const chain = await ctx.chain.status();
    const checks = {
      db,
      chainReachable: chain.reachable,
      registryDeployed: chain.registryDeployed === true,
      chainWriter: ctx.chain.canWrite,
      judge: ctx.judge.kind === "local" ? "local-demo" : ctx.cfg.JEV_API_KEY ? "jev-key-present" : ctx.cfg.DEMO_MODE === "replay" ? "jev-replay" : "missing",
      llm: ctx.llm ? `${ctx.llm.provider}/${ctx.llm.model}` : "none (fallbacks active)",
    };
    const ready = db;
    return reply.status(ready ? 200 : 503).send({ ready, checks, chain });
  });

  app.get("/api/config/public", async () => publicConfig(ctx));
};
