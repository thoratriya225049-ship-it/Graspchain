/**
 * Copies the Ignition deployment of AssessmentRegistry for a chain into
 * deployments/<chainId>.json ({ chainId, address, abi, exportedAt }). The API's chain writer,
 * the web app and the static verifier read this file; nothing secret is written.
 */
import fs from "node:fs";
import path from "node:path";

const chainId = Number(process.argv[2]);
if (!Number.isInteger(chainId)) throw new Error("usage: export-deployment <chainId>");
const root = path.resolve(import.meta.dirname, "..");
const addrFile = path.join(root, "ignition", "deployments", `chain-${chainId}`, "deployed_addresses.json");
const artifact = path.join(root, "artifacts", "contracts", "AssessmentRegistry.sol", "AssessmentRegistry.json");
const addresses = JSON.parse(fs.readFileSync(addrFile, "utf8")) as Record<string, string>;
const address = addresses["AssessmentRegistryModule#AssessmentRegistry"];
if (!address) throw new Error(`No AssessmentRegistry in ${addrFile}`);
const { abi } = JSON.parse(fs.readFileSync(artifact, "utf8")) as { abi: unknown[] };
fs.mkdirSync(path.join(root, "deployments"), { recursive: true });
const out = path.join(root, "deployments", `${chainId}.json`);
fs.writeFileSync(out, JSON.stringify({ chainId, address, abi, exportedAt: new Date().toISOString() }, null, 2) + "\n");
console.log(`AssessmentRegistry on chain ${chainId}: ${address} → ${path.relative(process.cwd(), out)}`);
