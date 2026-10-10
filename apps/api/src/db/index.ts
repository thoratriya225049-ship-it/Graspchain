import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type DB = Database.Database;

const MIGRATIONS = path.join(import.meta.dirname, "migrations");

/** Open SQLite with WAL, foreign keys and a busy timeout (SYSTEM_DESIGN §5, §8). */
export function openDb(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  return db;
}

/** Apply numbered migrations (NNN_name.sql) that have not run yet. Returns the versions applied. */
export function migrate(db: DB): string[] {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, appliedAt TEXT NOT NULL)");
  const done = new Set((db.prepare("SELECT version FROM schema_migrations").all() as { version: string }[]).map((r) => r.version));
  const files = fs
    .readdirSync(MIGRATIONS)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();
  const applied: string[] = [];
  for (const f of files) {
    const version = f.slice(0, 3);
    if (done.has(version)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS, f), "utf8");
    db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (version, appliedAt) VALUES (?, ?)").run(version, new Date().toISOString());
    })();
    applied.push(f);
  }
  return applied;
}

export const nowIso = () => new Date().toISOString();
export const json = (v: unknown) => JSON.stringify(v);
export const parse = <T>(s: string | null | undefined): T => (s == null ? (null as T) : (JSON.parse(s) as T));
