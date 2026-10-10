/**
 * E6 — tamper detection (PRD §9.4.8) against the RUNNING stack (`pnpm dev`). For one mined
 * receipt, mutates each of the 7 fields in the server copy, asks the Verify endpoint, restores.
 * Expected: V1 fails for every field (V2 also for the score). Prints the table and gas per record.
 * Usage: pnpm tamper-test [assessmentId]
 */
import fs from "node:fs";
import path from "node:path";

const API = process.env.API_URL ?? "http://127.0.0.1:4000";
const env = fs.readFileSync(path.resolve(import.meta.dirname, "../apps/api/.env"), "utf8");
const secret = /^ADMIN_SECRET=(.*)$/m.exec(env)?.[1]?.trim();
if (!secret) throw new Error("ADMIN_SECRET not found in apps/api/.env");

let cookie = "";
async function call(p: string, init: RequestInit = {}) {
  const r = await fetch(API + p, { ...init, headers: { "content-type": "application/json", "x-admin-secret": secret!, cookie, ...(init.headers ?? {}) } });
  const sc = r.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${p}: ${r.status} ${JSON.stringify(body)}`);
  return body;
}

await call("/api/auth/login", { method: "POST", body: JSON.stringify({ code: "ADMIN-01" }) });
const { receipts, fields } = await call("/api/admin/receipts");
const target =
  process.argv[2] ?? receipts.find((r: { chainStatus: string; tamperedField: string | null }) => r.chainStatus === "mined" && !r.tamperedField)?.assessmentId;
if (!target) throw new Error("No mined, untampered receipt found. Take an assessment first.");

const before = await call(`/api/verify/${target}`);
if (before.status !== "verified" && before.status !== "superseded") throw new Error(`Baseline is ${before.status}, expected verified.`);
console.log(`E6 tamper test on ${target} (chain ${before.chain.chainId}, registry ${before.chain.registry})\n`);

const rows: Record<string, string>[] = [];
for (const f of fields as { id: string; label: string }[]) {
  await call("/api/admin/tamper", { method: "POST", body: JSON.stringify({ assessmentId: target, field: f.id }) });
  try {
    const v = await call(`/api/verify/${target}`);
    const st = Object.fromEntries(v.checks.map((c: { id: string; state: string }) => [c.id, c.state]));
    rows.push({ field: f.id, change: f.label, V1: st.V1, V2: st.V2, V3: st.V3, detected: st.V1 === "fail" ? "yes" : "NO" });
  } finally {
    await call("/api/admin/restore", { method: "POST", body: JSON.stringify({ assessmentId: target }) });
  }
}
console.table(rows);
const after = await call(`/api/verify/${target}`);
const detected = rows.filter((r) => r.detected === "yes").length;
console.log(`\nDetected ${detected}/${rows.length} (${Math.round((detected / rows.length) * 100)}%). Restored copy verifies: ${after.status}.`);
if (before.tx?.gasUsed) console.log(`Gas for this record() transaction: ${before.tx.gasUsed.toLocaleString()}`);

const out = path.resolve(import.meta.dirname, "../research/results/tamper-test.csv");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, ["field,V1,V2,V3,detected", ...rows.map((r) => [r.field, r.V1, r.V2, r.V3, r.detected].join(","))].join("\n") + "\n");
console.log(`Written ${path.relative(process.cwd(), out)}`);
process.exit(detected === rows.length ? 0 : 1);
