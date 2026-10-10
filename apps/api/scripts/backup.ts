import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../src/config";
import { openDb } from "../src/db";

/** Consistent online backup with VACUUM INTO (PRD §12). */
const cfg = loadConfig();
const dir = path.join(path.dirname(cfg.dbPath), "backups");
fs.mkdirSync(dir, { recursive: true });
const out = path.join(dir, `graspchain-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
const db = openDb(cfg.dbPath);
db.prepare("VACUUM INTO ?").run(out);
db.close();
console.log(`Backup written: ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KiB)`);
