/**
 * E5a — FairGate simulation (PRD §13.3). 200 synthetic clients: 20 fast (0–20 ms, 5-join bursts),
 * 180 normal (log-normal, median ≈ 600 ms); 3 slots, 2 s service, ≈ 3× capacity for 60 s.
 * Conditions: FIFO and fair windows W ∈ {1, 2, 5} s, 30 seeds each. Writes research/results/fairness-sim.csv.
 * Usage: pnpm fairness-sim [--seeds 30]
 */
import fs from "node:fs";
import path from "node:path";
import { simulateMany } from "../packages/shared/src/sim";

const seeds = Number(process.argv[process.argv.indexOf("--seeds") + 1]) || 30;
const conditions = [
  { label: "fifo", mode: "fifo" as const, windowMs: 2000 },
  { label: "fair W=1s", mode: "fair" as const, windowMs: 1000 },
  { label: "fair W=2s", mode: "fair" as const, windowMs: 2000 },
  { label: "fair W=5s", mode: "fair" as const, windowMs: 5000 },
];

const rows = conditions.map((c) => ({ ...c, ...simulateMany({ mode: c.mode, windowMs: c.windowMs }, seeds) }));
console.log(`E5a FairGate simulation — ${seeds} seeds per condition (simulated, not measured)\n`);
console.table(
  rows.map((r) => ({
    condition: r.label,
    "ratio slow/fast (mean ± sd)": r.ratioMean === null ? "—" : `${r.ratioMean.toFixed(2)} ± ${(r.ratioSd ?? 0).toFixed(2)}`,
    "median wait fast (s)": r.fastMedian.toFixed(2),
    "median wait normal (s)": r.normalMedian.toFixed(2),
    "admitted ≤60s fast": `${Math.round(r.fastAdmit * 100)}%`,
    "admitted ≤60s normal": `${Math.round(r.normalAdmit * 100)}%`,
    jain: r.jain.toFixed(3),
    "meets ≤1.2": r.ratioMean !== null && r.ratioMean <= 1.2 ? "yes" : "no",
  })),
);

const out = path.resolve(import.meta.dirname, "../research/results/fairness-sim.csv");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  [
    "condition,seeds,ratio_mean,ratio_sd,fast_median_s,normal_median_s,fast_admit,normal_admit,jain",
    ...rows.map((r) => [r.label, seeds, r.ratioMean, r.ratioSd, r.fastMedian, r.normalMedian, r.fastAdmit, r.normalAdmit, r.jain].join(",")),
  ].join("\n") + "\n",
);
console.log(`\nWritten ${path.relative(process.cwd(), out)}`);
