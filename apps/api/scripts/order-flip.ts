/**
 * E3 — order-flip audit (PRD §9.2.5). Jev "leans toward the first option" (vendor-documented):
 * judge each first attempt with canonical and reversed option order and report the share of
 * choice questions whose label is unchanged. Target ≥ 90%. Requires JUDGE=jev: the local demo
 * judge ignores option order, so it would report a meaningless 100%.
 * Usage: pnpm order-flip [--limit 45]
 */
import fs from "node:fs";
import path from "node:path";
import pino from "pino";
import { buildQuestions, buildState, choiceAgreement, validateClaims } from "@graspchain/shared";
import { loadConfig } from "../src/config";
import { createContext } from "../src/context";

const limit = Number(process.argv[process.argv.indexOf("--limit") + 1]) || 45;
const ctx = await createContext(loadConfig(), pino({ level: "warn" }));
if (ctx.judge.kind !== "jev") {
  console.error(
    "order-flip needs JUDGE=jev with a JEV_API_KEY (or DEMO_MODE=replay with cached reversed-order answers). The local demo judge is order-invariant by construction.",
  );
  process.exit(2);
}
const rows = ctx.db
  .prepare("SELECT a.id, a.articleId, a.answerText FROM attempts a WHERE a.attemptNo = 1 AND a.status = 'done' ORDER BY a.createdAt LIMIT ?")
  .all(limit) as { id: string; articleId: string; answerText: string }[];
let agree = 0;
let total = 0;
const per: string[] = ["attemptId,agree,total"];
for (const r of rows) {
  const article = ctx.articles.get(r.articleId)!;
  const claims = (ctx.db.prepare('SELECT claimId, text, start, "end", source FROM claims WHERE attemptId = ? ORDER BY start').all(r.id) as never[]).length
    ? (ctx.db.prepare('SELECT claimId, text, start, "end", source FROM claims WHERE attemptId = ? ORDER BY start').all(r.id) as ReturnType<
        typeof validateClaims
      >["claims"])
    : validateClaims(null, r.answerText).claims;
  const state = buildState(article, r.answerText, claims);
  const a = await ctx.judge.systemOne({ article, state, questions: buildQuestions(article, claims) });
  const b = await ctx.judge.systemOne({ article, state, questions: buildQuestions(article, claims, { reversed: true }) });
  const c = choiceAgreement(a.answers, b.answers);
  agree += c.agree;
  total += c.total;
  per.push(`${r.id},${c.agree},${c.total}`);
}
console.log(
  `Order-flip agreement: ${agree}/${total} choice labels (${total ? ((agree / total) * 100).toFixed(1) : "—"}%) over ${rows.length} first attempts · target ≥ 90%`,
);
const out = path.resolve(import.meta.dirname, "../../../research/results/order-flip.csv");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, per.join("\n") + "\n");
ctx.db.close();
