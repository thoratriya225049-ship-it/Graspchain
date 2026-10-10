/**
 * E2/E3 — benchmark (PRD §13). Scores every human-rated FIRST attempt with
 *   S1 LLM-only · S2 sentence split + judge · S3 LLM claims + judge (proposed) · S3′ argmax fusion
 * and compares each with the human mean (Spearman ρ + bootstrap 95% CI, Pearson, MAE, QWK, ±1).
 * --runs N repeats each system N times (with --cache bypass for real repeatability, E3).
 * Results go to `benchmark_runs` and research/results/benchmark.csv. Systems whose dependencies
 * are not configured are skipped and say so; with the local demo judge the output is labelled
 * as describing the demo judge, not Jev.
 * Usage: pnpm benchmark (from the repo root) [--runs 1] [--cache use|bypass] [--system s1,s2,s3,s3p]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pino from "pino";
import {
  bootstrapCI,
  buildQuestions,
  buildState,
  articleText,
  fiveGramOverlap,
  fuse,
  mae,
  mergeAnswers,
  pearsonR,
  qwk,
  spearman,
  uncertainKeys,
  validateClaims,
  withinOne,
  type Article,
} from "@graspchain/shared";
import { loadConfig } from "../src/config";
import { createContext } from "../src/context";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const runs = Number(arg("runs", "1"));
const bypass = arg("cache", "use") === "bypass";
const systems = arg("system", "s1,s2,s3,s3p").split(",");

const ctx = await createContext(loadConfig(), pino({ level: "warn" }));
const rated = ctx.db
  .prepare(
    `SELECT a.id, a.articleId, a.answerText, AVG(h.score) human, COUNT(h.id) n FROM attempts a JOIN human_ratings h ON h.attemptId = a.id
     WHERE a.attemptNo = 1 GROUP BY a.id ORDER BY a.createdAt`,
  )
  .all() as { id: string; articleId: string; answerText: string; human: number; n: number }[];

console.log(
  `Benchmark · judge ${ctx.judge.model} (${ctx.judge.kind}) · LLM ${ctx.llm ? `${ctx.llm.provider}/${ctx.llm.model}` : "none"} · ${rated.length} rated first attempts · ${runs} run(s)${bypass ? " · cache bypass" : ""}`,
);
if (ctx.judge.kind === "local") console.log("NOTE: the local demo judge is not Jev. Numbers below describe the demo judge only and are not a research result.");
if (!rated.length) {
  console.log("No human ratings yet. Collect blind ratings on the Research page (or import into human_ratings), then re-run.");
  process.exit(0);
}

async function judged(article: Article, answer: string, claimsRaw: string[] | null, run: number) {
  const { claims } = validateClaims(claimsRaw, answer);
  const state = buildState(article, answer, claims);
  const q = buildQuestions(article, claims);
  // Distinguish repeat runs in the cache key only when bypassing (so each run is a real call).
  const first = await ctx.judge.systemOne({
    article,
    state: bypass ? { ...state, article: state.article + "​".repeat(run) } : state,
    questions: q,
    cache: bypass ? "bypass" : "use",
  });
  let answers = first.answers;
  const unc = uncertainKeys(answers);
  if (unc.length)
    answers = mergeAnswers(
      answers,
      (await ctx.judge.systemOne({ article, state, questions: buildQuestions(article, claims, { rephrased: true, only: unc }) })).answers,
    );
  const overlap5 = fiveGramOverlap(answer, articleText(article));
  return {
    expected: fuse({ article, claims, answers, overlap5 }).finalScore,
    argmax: fuse({ article, claims, answers, overlap5, mode: "argmax" }).finalScore,
    latencyMs: first.latencyMs,
    tokens: first.usage.input_tokens,
  };
}

const scores: Record<string, number[][]> = Object.fromEntries(systems.map((s) => [s, []]));
const ins = ctx.db.prepare(
  "INSERT INTO benchmark_runs (id, attemptId, system, run, optionOrder, score, latencyMs, tokens, judgeModel, createdAt) VALUES (?, ?, ?, ?, 'canonical', ?, ?, ?, ?, ?)",
);
for (const a of rated) {
  const article = ctx.articles.get(a.articleId)!;
  for (let run = 0; run < runs; run++) {
    const t0 = Date.now();
    const rec = (system: string, score: number, latencyMs: number, tokens: number) => {
      (scores[system][rated.indexOf(a)] ??= []).push(score);
      ins.run(crypto.randomUUID(), a.id, system, run, score, latencyMs, tokens, ctx.judge.model, new Date().toISOString());
    };
    if (systems.includes("s1") && ctx.llm)
      rec("s1", (await ctx.llm.baselineScore(article, a.answerText, { bypassCache: bypass, run })).score, Date.now() - t0, 0);
    if (systems.includes("s2")) {
      const r = await judged(article, a.answerText, null, run);
      rec("s2", r.expected, r.latencyMs, r.tokens);
    }
    if ((systems.includes("s3") || systems.includes("s3p")) && ctx.llm) {
      const seg = await ctx.llm.segment(a.answerText, AbortSignal.timeout(ctx.cfg.SEGMENT_TIMEOUT_MS * 3)).catch(() => null);
      const r = await judged(article, a.answerText, seg?.claims ?? null, run);
      if (systems.includes("s3")) rec("s3", r.expected, r.latencyMs, r.tokens);
      if (systems.includes("s3p")) rec("s3p", r.argmax, r.latencyMs, r.tokens);
    }
  }
}

const human = rated.map((r) => r.human);
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs: number[]) => (xs.length > 1 ? Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2))) : 0);
const table = systems.map((s) => {
  const per = scores[s];
  if (!per.length || per.some((x) => !x?.length))
    return { system: s, status: s === "s2" ? "no data" : "skipped (needs an LLM: set LLM_PROVIDER/LLM_MODEL and its key)" };
  const sys = per.map(mean);
  const ci = bootstrapCI(sys, human, spearman);
  return {
    system: s,
    n: sys.length,
    spearman: spearman(sys, human)?.toFixed(3) ?? "—",
    "95% CI": ci ? `${ci[0].toFixed(2)}–${ci[1].toFixed(2)}` : "—",
    pearson: pearsonR(sys, human)?.toFixed(3) ?? "—",
    MAE: mae(sys, human)?.toFixed(2) ?? "—",
    QWK: qwk(sys, human)?.toFixed(3) ?? "—",
    "within ±1": `${Math.round((withinOne(sys, human) ?? 0) * 100)}%`,
    "mean SD over runs": runs > 1 ? mean(per.map(sd)).toFixed(3) : "—",
  };
});
console.table(table);
const out = path.resolve(import.meta.dirname, "../../../research/results/benchmark.csv");
fs.mkdirSync(path.dirname(out), { recursive: true });
const keys = Object.keys(table.find((t) => "n" in t) ?? table[0]);
fs.writeFileSync(out, [keys.join(","), ...table.map((t) => keys.map((k) => (t as Record<string, unknown>)[k] ?? "").join(","))].join("\n") + "\n");
console.log(`Written ${path.relative(process.cwd(), out)}`);
ctx.db.close();
