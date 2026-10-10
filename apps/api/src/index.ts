import pino from "pino";
import { loadConfig } from "./config";
import { createContext } from "./context";
import { seedDemo } from "./seed";
import { buildApp } from "./server";

/** Boot: validate config → migrate → seed roster/demo → start workers → listen; drain on SIGINT/SIGTERM. */
async function main() {
  let cfg;
  try {
    cfg = loadConfig();
  } catch (e) {
    console.error(`\n${(e as Error).message}\n`);
    process.exit(1);
  }
  const logger = pino({
    level: cfg.LOG_LEVEL,
    redact: ["req.headers.cookie", "req.headers['x-admin-secret']", "res.headers['set-cookie']"],
    ...(cfg.NODE_ENV === "development"
      ? { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname", singleLine: true } } }
      : {}),
  });
  const ctx = await createContext(cfg, logger);
  const app = await buildApp(ctx, { loggerInstance: logger });

  if (ctx.judge.kind === "evidence")
    logger.info({ judge: ctx.judge.model }, "Evidence judge: the LLM extracts evidence; deterministic rules classify and score.");
  if (ctx.judge.kind === "local") logger.warn("JUDGE=local: the local demo judge stands in for Jev. Receipts say so (models.jev = local-rubric-judge@1).");
  if (!ctx.llm) logger.warn("No LLM configured: segmentation uses the sentence splitter and feedback uses templates (both recorded per attempt).");
  if (!ctx.chain.canWrite)
    logger.warn("Chain writer disabled (no DEPLOYER_PRIVATE_KEY or registry address): receipts stay queued and verify as 'not yet on-chain'.");

  ctx.fairgate.start();
  ctx.sessions.start();
  ctx.evaluator.start();
  ctx.writer.start();
  const seeded = await seedDemo(ctx);
  if (seeded.attempts) logger.info(seeded, "seeded demo roster and attempts");

  await app.listen({ port: cfg.PORT, host: cfg.HOST });

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "shutting down: draining evaluations and the chain writer");
    ctx.fairgate.stop();
    ctx.sessions.stop();
    ctx.evaluator.stop();
    await ctx.evaluator.drain();
    await ctx.writer.stop();
    await app.close();
    ctx.db.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
