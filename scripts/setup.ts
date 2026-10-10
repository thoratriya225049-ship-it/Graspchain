/**
 * First-run setup: creates apps/api/.env and apps/web/.env.local from their examples if they do
 * not exist yet. Generates COOKIE_SECRET / QUEUE_SECRET / ADMIN_SECRET locally. Never overwrites
 * an existing file and never invents third-party credentials:
 *  - --llm given → JUDGE=evidence (the LLM extracts evidence, code judges); --jev-key → JUDGE=jev;
 *    neither → JUDGE=local (the labelled local demo judge) with no LLM; ADMIN_DEMO_TOOLS=1
 *  - CHAIN_ID=31337 → the public Hardhat test key for the local chain writer
 * Usage: pnpm run setup:env [--jev-key=…] [--llm=groq:openai/gpt-oss-120b:<gsk_key>]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const arg = (name: string) =>
  process.argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
const HARDHAT_DEV_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function setVar(text: string, key: string, value: string) {
  const re = new RegExp(`^${key}=.*$`, "m");
  return re.test(text) ? text.replace(re, `${key}=${value}`) : `${text}\n${key}=${value}\n`;
}

const apiEnv = path.join(root, "apps/api/.env");
if (fs.existsSync(apiEnv)) {
  console.log("apps/api/.env exists — left unchanged.");
} else {
  let t = fs.readFileSync(path.join(root, "apps/api/.env.example"), "utf8");
  for (const k of ["COOKIE_SECRET", "QUEUE_SECRET", "ADMIN_SECRET"]) t = setVar(t, k, crypto.randomBytes(24).toString("base64url"));
  const jev = arg("jev-key");
  const llm = arg("llm");
  if (jev) t = setVar(t, "JEV_API_KEY", jev);
  t = setVar(t, "JUDGE", jev ? "jev" : llm ? "evidence" : "local");
  if (llm) {
    const [provider, model, key] = llm.split(":");
    t = setVar(t, "LLM_PROVIDER", provider);
    t = setVar(t, "LLM_MODEL", model);
    t = setVar(t, provider === "groq" ? "GROQ_API_KEY" : "GOOGLE_GENERATIVE_AI_API_KEY", key);
  } else t = setVar(t, "LLM_MODEL", "");
  t = setVar(t, "ADMIN_DEMO_TOOLS", "1");
  t = setVar(t, "DEPLOYER_PRIVATE_KEY", HARDHAT_DEV_KEY);
  fs.writeFileSync(apiEnv, t);
  console.log(
    `Created apps/api/.env (judge: ${jev ? "jev" : llm ? "evidence" : "local demo"}; LLM: ${llm ? llm.split(":").slice(0, 2).join("/") : "none — fallbacks"}; chain: local Hardhat 31337).`,
  );
  console.log(`Admin secret (needed on the Admin page): ${t.match(/^ADMIN_SECRET=(.*)$/m)![1]}`);
}

const webEnv = path.join(root, "apps/web/.env.local");
if (fs.existsSync(webEnv)) console.log("apps/web/.env.local exists — left unchanged.");
else {
  fs.copyFileSync(path.join(root, "apps/web/.env.example"), webEnv);
  console.log("Created apps/web/.env.local.");
}
