import pino from "pino";
import { loadConfig } from "../src/config";
import { createContext } from "../src/context";
import { seedDemo } from "../src/seed";

/** Seed the demo roster and prepared attempts through the configured pipeline (idempotent). */
const cfg = loadConfig();
const ctx = await createContext(cfg, pino({ level: "warn" }));
const r = await seedDemo(ctx);
console.log(
  r.attempts ? `Seeded ${r.roster} roster entries and ${r.attempts} attempts (judge: ${ctx.judge.model}).` : `Already seeded (${r.roster} new roster entries).`,
);
console.log("Commitments are queued; the API's chain writer sends them when it runs.");
ctx.db.close();
