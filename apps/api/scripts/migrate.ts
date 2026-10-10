import { loadConfig } from "../src/config";
import { migrate, openDb } from "../src/db";

const cfg = loadConfig();
const db = openDb(cfg.dbPath);
const applied = migrate(db);
console.log(applied.length ? `Applied ${applied.join(", ")} to ${cfg.dbPath}` : `Up to date: ${cfg.dbPath}`);
db.close();
