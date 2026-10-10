import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * 12-factor configuration (SYSTEM_DESIGN §11), validated with zod at boot. A missing or invalid
 * variable stops the process with the exact variable name. `apps/api/.env` is loaded if present
 * (create it with `pnpm run setup:env`, which copies `.env.example` and generates local secrets).
 */

export const API_ROOT = path.resolve(import.meta.dirname, "..");
export const REPO_ROOT = path.resolve(API_ROOT, "../..");

/** Hardhat's publicly known account #0 key. Accepted only on the local chain (31337). */
export const HARDHAT_DEV_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const bool = z.enum(["0", "1", "true", "false", "on", "off"]).transform((v) => v === "1" || v === "true" || v === "on");
const optStr = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));
const secret = (name: string) => z.string({ error: `${name} is required` }).min(16, `${name} must be at least 16 characters`);

const Schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().default(4000),
    HOST: z.string().default("127.0.0.1"),
    WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
    PUBLIC_WEB_URL: z.string().url().default("http://localhost:3000"),
    VERIFIER_URL: z.string().url().default("http://localhost:5174/"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

    DATABASE_PATH: z.string().default("./data/graspchain.db"),
    COOKIE_SECRET: secret("COOKIE_SECRET"),
    QUEUE_SECRET: secret("QUEUE_SECRET"),
    ADMIN_SECRET: secret("ADMIN_SECRET"),
    ADMIN_DEMO_TOOLS: bool.default(false),
    DEMO_MODE: z.enum(["off", "replay"]).default("off"),

    JUDGE: z.enum(["evidence", "jev", "local"]).default("evidence"),
    JEV_BASE_URL: z.string().url().default("https://api.typesafe.ai"),
    JEV_API_KEY: optStr,
    JEV_MODEL: z.string().default("jev-1.13.0"),
    JEV_DAILY_TOKEN_CAP: z.coerce.number().int().positive().default(2_000_000),
    JEV_ORDER_DEBIAS: bool.default(false),
    JEV_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),

    LLM_PROVIDER: z.enum(["google", "groq", "none"]).default("google"),
    LLM_MODEL: optStr,
    GOOGLE_GENERATIVE_AI_API_KEY: optStr,
    GROQ_API_KEY: optStr,
    SEGMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(1800),
    /** Evidence judge: model id for extraction (defaults to LLM_MODEL) and its hard timeout. */
    EVIDENCE_MODEL: optStr,
    EVIDENCE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    FEEDBACK_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

    CLOCK_MODE: z.enum(["fair", "naive"]).default("fair"),
    FAIRCLOCK_CAP_S: z.coerce.number().positive().default(10),
    READ_SECONDS_OVERRIDE: z.coerce.number().int().min(15).max(600).optional(),
    WRITE_TTL_MIN: z.coerce.number().positive().default(20),
    SESSION_IDLE_S: z.coerce.number().int().min(30).default(120),

    FAIR_MODE: z.enum(["fair", "fifo"]).default("fair"),
    WINDOW_MS: z.coerce.number().int().min(100).default(2000),
    BURST_WINDOW_MS: z.coerce.number().int().min(100).default(5000),
    CONCURRENCY: z.coerce.number().int().min(1).default(3),
    TOKEN_TTL_S: z.coerce.number().int().min(5).default(30),

    CHAIN_ID: z.coerce.number().int().default(31337),
    CHAIN_RPC_URL: z.string().url().default("http://127.0.0.1:8545"),
    CHAIN_RPC_BACKUP_URL: optStr,
    CHAIN_PUBLIC_RPC_URL: optStr,
    CHAIN_EXPLORER_URL: optStr,
    CHAIN_FROM_BLOCK: z.coerce.number().int().min(0).default(0),
    REGISTRY_ADDRESS: optStr,
    DEPLOYER_PRIVATE_KEY: optStr,
    MAX_FEE_GWEI: z.coerce.number().positive().default(30),
  })
  .superRefine((c, ctx) => {
    if (c.JUDGE === "jev" && !c.JEV_API_KEY && c.DEMO_MODE !== "replay") {
      ctx.addIssue({
        code: "custom",
        path: ["JEV_API_KEY"],
        message: "JEV_API_KEY is required when JUDGE=jev (or set DEMO_MODE=replay to serve cached answers, or JUDGE=local for the labelled local demo judge)",
      });
    }
    if (c.JUDGE === "evidence" && (c.LLM_PROVIDER === "none" || !c.LLM_MODEL)) {
      ctx.addIssue({
        code: "custom",
        path: ["JUDGE"],
        message:
          "JUDGE=evidence needs an LLM for evidence extraction: set LLM_PROVIDER (groq or google), LLM_MODEL and its API key (or JUDGE=local for the labelled local demo judge)",
      });
    }
    if (c.LLM_PROVIDER === "google" && c.LLM_MODEL && !c.GOOGLE_GENERATIVE_AI_API_KEY && c.DEMO_MODE !== "replay") {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_GENERATIVE_AI_API_KEY"],
        message: "GOOGLE_GENERATIVE_AI_API_KEY is required when LLM_PROVIDER=google and LLM_MODEL is set",
      });
    }
    if (c.LLM_PROVIDER === "groq" && c.LLM_MODEL && !c.GROQ_API_KEY && c.DEMO_MODE !== "replay") {
      ctx.addIssue({ code: "custom", path: ["GROQ_API_KEY"], message: "GROQ_API_KEY is required when LLM_PROVIDER=groq and LLM_MODEL is set" });
    }
    if (c.DEPLOYER_PRIVATE_KEY && !/^0x[0-9a-fA-F]{64}$/.test(c.DEPLOYER_PRIVATE_KEY)) {
      ctx.addIssue({ code: "custom", path: ["DEPLOYER_PRIVATE_KEY"], message: "DEPLOYER_PRIVATE_KEY must be 0x followed by 64 hex characters" });
    }
    if (c.CHAIN_ID !== 31337 && c.DEPLOYER_PRIVATE_KEY?.toLowerCase() === HARDHAT_DEV_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["DEPLOYER_PRIVATE_KEY"],
        message: "The public Hardhat test key may only be used on the local chain (CHAIN_ID=31337)",
      });
    }
    if (c.NODE_ENV === "production" && c.ADMIN_DEMO_TOOLS) {
      ctx.addIssue({ code: "custom", path: ["ADMIN_DEMO_TOOLS"], message: "ADMIN_DEMO_TOOLS must be 0 in production" });
    }
  });

export type Config = z.infer<typeof Schema> & {
  dbPath: string;
  llmEnabled: boolean;
  registryAddress: string | null;
  registryAbi: unknown[] | null;
  explorerUrl: string | null;
  publicRpcUrl: string;
};

function loadDeployment(chainId: number): { address: string; abi: unknown[] } | null {
  const p = path.join(REPO_ROOT, "packages", "contracts", "deployments", `${chainId}.json`);
  if (!fs.existsSync(p)) return null;
  const d = JSON.parse(fs.readFileSync(p, "utf8")) as { address: string; abi: unknown[] };
  return { address: d.address, abi: d.abi };
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const envFile = path.join(API_ROOT, ".env");
  if (env === process.env && fs.existsSync(envFile) && process.env.NODE_ENV !== "test") process.loadEnvFile(envFile);
  // Blank values ("KEY=") mean "not set", so defaults apply instead of coercing "" to 0.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== ""));
  const parsed = Schema.safeParse(cleaned);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  • ${i.path.join(".") || "(config)"}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join("\n")}\nSee apps/api/.env.example.`);
  }
  const c = parsed.data;
  const dep = loadDeployment(c.CHAIN_ID);
  const registryAddress = c.REGISTRY_ADDRESS ?? dep?.address ?? null;
  const llmKey = c.LLM_PROVIDER === "google" ? c.GOOGLE_GENERATIVE_AI_API_KEY : c.LLM_PROVIDER === "groq" ? c.GROQ_API_KEY : undefined;
  return {
    ...c,
    dbPath: path.isAbsolute(c.DATABASE_PATH) ? c.DATABASE_PATH : path.resolve(API_ROOT, c.DATABASE_PATH),
    llmEnabled: c.LLM_PROVIDER !== "none" && !!c.LLM_MODEL && (!!llmKey || c.DEMO_MODE === "replay"),
    registryAddress,
    registryAbi: dep?.abi ?? null,
    explorerUrl: c.CHAIN_EXPLORER_URL ?? (c.CHAIN_ID === 11155111 ? "https://sepolia.etherscan.io" : null),
    publicRpcUrl: c.CHAIN_PUBLIC_RPC_URL ?? (c.CHAIN_ID === 11155111 ? "https://ethereum-sepolia-rpc.publicnode.com" : c.CHAIN_RPC_URL),
  };
}
