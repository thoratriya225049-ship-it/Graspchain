/**
 * One command for the whole local stack:
 *   local Hardhat chain (8545) → AssessmentRegistry deploy (if the chain is fresh) →
 *   static verifier (5174) → API (4000) → web (3000).
 * Usage: pnpm dev            (watch mode)
 *        pnpm start          (production builds: next build + next start)
 *        pnpm dev --no-chain (use CHAIN_RPC_URL from apps/api/.env, e.g. Sepolia)
 * Ctrl+C stops every child process (whole process trees on Windows).
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const prod = process.argv.includes("--prod");
const noChain = process.argv.includes("--no-chain");
const win = process.platform === "win32";
const children: ChildProcess[] = [];
const COLORS: Record<string, string> = { chain: "35", api: "36", web: "33", verifier: "32", setup: "90" };

function log(name: string, line: string) {
  process.stdout.write(`\x1b[${COLORS[name] ?? "37"}m${name.padEnd(8)}\x1b[0m ${line}\n`);
}

function run(name: string, cmd: string, args: string[], cwd: string, env: Record<string, string> = {}) {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, FORCE_COLOR: "1", ...env }, shell: win, stdio: ["ignore", "pipe", "pipe"] });
  const pipe = (s: NodeJS.ReadableStream) => {
    let buf = "";
    s.on("data", (d) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) log(name, l);
    });
  };
  pipe(child.stdout!);
  pipe(child.stderr!);
  child.on("exit", (code) => {
    log(name, `exited (${code ?? "signal"})`);
    if (!stopping && name !== "setup") shutdown(1);
  });
  children.push(child);
  return child;
}

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    if (c.exitCode !== null || !c.pid) continue;
    if (win) spawnSync("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
    else c.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 300);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function rpc(url: string, method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(2000),
  });
  const j = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

async function waitFor(what: string, check: () => Promise<boolean>, timeoutMs = 90_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await check().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

function sh(name: string, cmd: string, args: string[], cwd: string, input?: string) {
  log(name, `$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd, shell: win, encoding: "utf8", input });
  for (const l of `${r.stdout ?? ""}${r.stderr ?? ""}`.split(/\r?\n/)) if (l.trim()) log(name, l);
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed`);
}

async function main() {
  if (!fs.existsSync(path.join(root, "apps/api/.env"))) sh("setup", "pnpm", ["run", "setup:env"], root);

  const local = "http://127.0.0.1:8545";
  if (!noChain) {
    const up = await rpc(local, "eth_chainId").then(
      () => true,
      () => false,
    );
    if (up) log("chain", "Using the Hardhat node already running on 8545.");
    else run("chain", "pnpm", ["--filter", "contracts", "exec", "hardhat", "node"], root);
    await waitFor("the local chain", async () => (await rpc(local, "eth_chainId")) === "0x7a69");
    const depFile = path.join(root, "packages/contracts/deployments/31337.json");
    const address = fs.existsSync(depFile) ? (JSON.parse(fs.readFileSync(depFile, "utf8")) as { address: string }).address : null;
    const code = address ? ((await rpc(local, "eth_getCode", [address, "latest"])) as string) : "0x";
    if (code === "0x") {
      log("chain", "Fresh chain: deploying AssessmentRegistry with Hardhat Ignition.");
      fs.rmSync(path.join(root, "packages/contracts/ignition/deployments/chain-31337"), { recursive: true, force: true });
      sh("chain", "pnpm", ["--filter", "contracts", "run", "deploy:local"], root, "y\n");
    } else log("chain", `AssessmentRegistry already deployed at ${address}.`);
  }

  sh("verifier", "pnpm", ["--filter", "verifier", "run", "build"], root);
  run("verifier", "node", ["serve.mjs"], path.join(root, "apps/verifier"));

  run("api", "pnpm", ["--filter", "api", "run", prod ? "start" : "dev"], root);
  await waitFor("the API", async () => (await fetch("http://127.0.0.1:4000/healthz", { signal: AbortSignal.timeout(2000) })).ok);

  if (prod) sh("web", "pnpm", ["--filter", "web", "run", "build"], root);
  run("web", "pnpm", ["--filter", "web", "run", prod ? "start" : "dev"], root);
  await waitFor("the web app", async () => (await fetch("http://localhost:3000/login", { signal: AbortSignal.timeout(5000) })).ok, 180_000);
  log("setup", "Ready: web http://localhost:3000 · API http://127.0.0.1:4000 · verifier http://localhost:5174 · chain http://127.0.0.1:8545");
}

main().catch((e) => {
  log("setup", `\x1b[31m${(e as Error).message}\x1b[0m`);
  shutdown(1);
});
