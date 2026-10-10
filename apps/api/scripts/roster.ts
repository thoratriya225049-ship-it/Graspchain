import path from "node:path";
import type { Role } from "@graspchain/shared";
import { API_ROOT, loadConfig } from "../src/config";
import { migrate, openDb } from "../src/db";
import { addAccount, listAccounts } from "../src/roster";

/**
 * Operator tool for real accounts (there is no built-in roster):
 *   pnpm roster add <CODE> <student|teacher|admin> "<label>"
 *   pnpm roster list
 * Works while the API is running (SQLite WAL).
 */
const [cmd, code, role, ...label] = process.argv.slice(2);
const cfg = loadConfig();
const db = openDb(path.isAbsolute(cfg.DATABASE_PATH) ? cfg.DATABASE_PATH : path.resolve(API_ROOT, cfg.DATABASE_PATH));
migrate(db);
try {
  if (cmd === "add" && code && role) {
    const r = addAccount(db, code, role as Role, label.join(" ") || `${role} ${code}`);
    console.log(r.created ? `Created ${role} account ${r.code}.` : `${r.code} already exists (unchanged).`);
  } else if (cmd === "list") {
    const rows = listAccounts(db);
    if (!rows.length) console.log('No accounts yet. Create one: pnpm roster add ADMIN-01 admin "Administrator"');
    for (const r of rows) console.log(`${r.code.padEnd(14)} ${r.role.padEnd(8)} ${String(r.attempts).padStart(4)} attempts  ${r.label}`);
  } else {
    console.log('Usage:\n  pnpm roster add <CODE> <student|teacher|admin> "<label>"\n  pnpm roster list');
    process.exitCode = 1;
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  db.close();
}
