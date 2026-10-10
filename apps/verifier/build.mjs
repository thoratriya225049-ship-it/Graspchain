/**
 * Builds dist/: index.html, verifier.js (shared canonicalization + V1–V4 bundled by esbuild),
 * vendor/ethers.umd.min.js (pinned, copied from node_modules), and config.js (chain + registry).
 *
 * Chain selection: VERIFIER_CHAIN_ID (default 31337 local; 11155111 for the GitHub Pages build).
 * The registry address comes from packages/contracts/deployments/<chainId>.json unless
 * VERIFIER_REGISTRY is set. VERIFIER_RPC_URL overrides the default RPC.
 */
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const here = import.meta.dirname;
const dist = path.join(here, "dist");
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, "vendor"), { recursive: true });

await build({
  entryPoints: [path.join(here, "src/main.ts")],
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  sourcemap: true,
  outfile: path.join(dist, "verifier.js"),
  logLevel: "warning",
});

// ethers does not export ./package.json; its workspace install lives in node_modules/ethers.
const ethersDir = fs.realpathSync(path.join(here, "node_modules", "ethers"));
fs.copyFileSync(path.join(ethersDir, "dist", "ethers.umd.min.js"), path.join(dist, "vendor", "ethers.umd.min.js"));
fs.copyFileSync(path.join(here, "index.html"), path.join(dist, "index.html"));
fs.copyFileSync(path.join(here, "..", "web", "public", "favicon.svg"), path.join(dist, "favicon.svg"));

const chainId = Number(process.env.VERIFIER_CHAIN_ID ?? 31337);
const depFile = path.join(here, "..", "..", "packages", "contracts", "deployments", `${chainId}.json`);
const dep = fs.existsSync(depFile) ? JSON.parse(fs.readFileSync(depFile, "utf8")) : null;
const names = { 31337: "Local Hardhat chain", 11155111: "Ethereum Sepolia" };
const config = {
  chainId,
  chainName: names[chainId] ?? `Chain ${chainId}`,
  registry: process.env.VERIFIER_REGISTRY ?? dep?.address ?? null,
  rpcUrl: process.env.VERIFIER_RPC_URL ?? (chainId === 11155111 ? "https://ethereum-sepolia-rpc.publicnode.com" : "http://127.0.0.1:8545"),
  explorerUrl: chainId === 11155111 ? "https://sepolia.etherscan.io" : null,
  fromBlock: Number(process.env.VERIFIER_FROM_BLOCK ?? 0),
};
fs.writeFileSync(path.join(dist, "config.js"), `window.GC_CONFIG = ${JSON.stringify(config, null, 2)};\n`);
console.log(`verifier → dist/ (chain ${config.chainId}, registry ${config.registry ?? "NOT SET"})`);
if (!config.registry) console.warn("No registry address: deploy the contract first (pnpm chain:deploy:local) or set VERIFIER_REGISTRY.");
