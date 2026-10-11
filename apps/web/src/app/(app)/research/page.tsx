import type { Metadata } from "next";
import { buttonClass } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Bits";
import { page, requireMe } from "@/lib/api";
import Link from "next/link";
import { FairGateSim } from "./ResearchClient";

export const metadata: Metadata = { title: "Research" };

interface Summary {
  ratings: number;
  raters: { rater: string; type: string; n: number }[];
  e1: { raters: string[]; n: number; spearman: number | null; qwk: number | null; mae: number | null } | null;
  e2: {
    system: string;
    judges: string[];
    caveat: string | null;
    n: number;
    spearman: number | null;
    spearmanCI: [number, number] | null;
    pearson: number | null;
    mae: number | null;
    qwk: number | null;
    withinOne: number | null;
  };
}
interface ClockData {
  capS: number;
  sessions: { clockMode: string; measuredDelayMs: number; latencyCompMs: number; readSeconds: number; readTimeLossS: number }[];
}

const f2 = (v: number | null) => (v === null ? "—" : v.toFixed(2));
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export default async function ResearchPage() {
  await requireMe(["teacher", "admin"], "/research");
  const [summary, clock] = await Promise.all([page<Summary>("/api/research/summary"), page<ClockData>("/api/research/fairclock")]);
  const modes = ["fair", "naive"].map((m) => {
    const xs = clock.sessions.filter((s) => s.clockMode === m);
    return {
      mode: m,
      n: xs.length,
      delay: median(xs.map((s) => s.measuredDelayMs / 1000)),
      comp: median(xs.map((s) => s.latencyCompMs / 1000)),
      loss: median(xs.map((s) => s.readTimeLossS)),
      worst: xs.length ? Math.max(...xs.map((s) => s.readTimeLossS)) : null,
    };
  });

  return (
    <div className="frame pt-10 md:pt-14">
      <header className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <p className="eyebrow">Research</p>
          <h1 className="display mt-3 text-[clamp(2.25rem,5vw,3.25rem)]">Is it a good assessor, and is it fair?</h1>
          <p className="mt-3 max-w-2xl text-[0.9375rem] text-ink-2">
            Blind human ratings against the pipeline (E1–E2), fair entry under load (E5a) and reading time across networks (E5b). Numbers are computed from what
            is in this database — nothing here is pre-filled.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <form method="post" action="/api/research/export">
            <button className={buttonClass("secondary", "sm")}>Export for raters (CSV)</button>
          </form>
          <form method="post" action="/api/research/export?includeScores=1">
            <button className={buttonClass("quiet", "sm")}>With system scores</button>
          </form>
        </div>
      </header>

      <Link
        href="/research/rate"
        className="group mt-10 flex items-center justify-between gap-4 rounded-[24px] bg-mint px-6 py-5 no-underline transition-colors hover:bg-[#cdeeed]"
      >
        <span>
          <span className="block font-serif text-xl text-ink">Blind rating</span>
          <span className="mt-1 block text-sm text-ink-2">Rate first attempts without seeing the system&rsquo;s score — its own calm mode.</span>
        </span>
        <span className="text-teal transition-transform group-hover:translate-x-0.5" aria-hidden>
          →
        </span>
      </Link>

      <section className="mt-16 border-t border-rule pt-8" aria-labelledby="agree">
        <h2 id="agree" className="font-serif text-xl">
          Agreement with humans
        </h2>
        {summary.e2.caveat ? (
          <div className="mt-4">
            <Notice tone="warn" title="Not a research result">
              {summary.e2.caveat}
            </Notice>
          </div>
        ) : null}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-rule-strong text-left">
                {["Comparison", "n", "Spearman ρ", "95% CI", "Pearson r", "MAE", "QWK", "Within ±1"].map((h) => (
                  <th key={h} className={`eyebrow py-2 ${h === "Comparison" ? "" : "text-right"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-rule">
                <td className="py-3">E2 · {summary.e2.system} vs human mean</td>
                <td className="num mono py-3 text-right">{summary.e2.n}</td>
                <td className="num mono py-3 text-right">{f2(summary.e2.spearman)}</td>
                <td className="num mono py-3 text-right">
                  {summary.e2.spearmanCI ? `${f2(summary.e2.spearmanCI[0])} – ${f2(summary.e2.spearmanCI[1])}` : "—"}
                </td>
                <td className="num mono py-3 text-right">{f2(summary.e2.pearson)}</td>
                <td className="num mono py-3 text-right">{f2(summary.e2.mae)}</td>
                <td className="num mono py-3 text-right">{f2(summary.e2.qwk)}</td>
                <td className="num mono py-3 text-right">{summary.e2.withinOne === null ? "—" : `${Math.round(summary.e2.withinOne * 100)}%`}</td>
              </tr>
              <tr className="border-b border-rule">
                <td className="py-3">E1 · rater vs rater{summary.e1 ? ` (${summary.e1.raters.join(" vs ")})` : ""}</td>
                <td className="num mono py-3 text-right">{summary.e1?.n ?? 0}</td>
                <td className="num mono py-3 text-right">{f2(summary.e1?.spearman ?? null)}</td>
                <td className="py-3 text-right text-ink-3">—</td>
                <td className="py-3 text-right text-ink-3">—</td>
                <td className="num mono py-3 text-right">{f2(summary.e1?.mae ?? null)}</td>
                <td className="num mono py-3 text-right">{f2(summary.e1?.qwk ?? null)}</td>
                <td className="py-3 text-right text-ink-3">—</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-3">
          {summary.ratings} ratings from {summary.raters.length} rater{summary.raters.length === 1 ? "" : "s"}
          {summary.raters.length ? ` (${summary.raters.map((r) => `${r.rater}: ${r.n}, ${r.type}`).join("; ")})` : ""}. Targets (pre-registered): ρ ≥ 0.75, ≥
          75% within ±1. With small n, read the interval, not the point.
        </p>
      </section>

      <section className="mt-16 border-t border-rule pt-8" aria-labelledby="gate">
        <h2 id="gate" className="font-serif text-xl">
          Fair entry under load · simulation
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-3">
          200 synthetic clients (20 on fast links joining in bursts, 180 on normal links), 3 admission slots, 2 s service, offered load ≈ 3× capacity. Each
          condition averages 30 seeds. Simulated, not measured.
        </p>
        <FairGateSim />
      </section>

      <section className="mt-16 border-t border-rule pt-8" aria-labelledby="clock">
        <h2 id="clock" className="font-serif text-xl">
          Reading time across networks · real sessions
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-3">
          From sessions in this database: the delay between sending the article and its render acknowledgement, and how much of it the clock gave back (cap{" "}
          {clock.capS} s). Read-time loss = delay − compensation.
        </p>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-rule-strong text-left">
                {["Clock mode", "Sessions", "Median delay", "Median given back", "Median loss", "Worst loss"].map((h) => (
                  <th key={h} className={`eyebrow py-2 ${h === "Clock mode" ? "" : "text-right"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modes.map((m) => (
                <tr key={m.mode} className="border-b border-rule">
                  <td className="py-3">{m.mode === "fair" ? "Fair clock (delivery-compensated)" : "Naive (server time only)"}</td>
                  <td className="num mono py-3 text-right">{m.n}</td>
                  <td className="num mono py-3 text-right">{m.delay === null ? "—" : `${m.delay.toFixed(2)} s`}</td>
                  <td className="num mono py-3 text-right">{m.comp === null ? "—" : `${m.comp.toFixed(2)} s`}</td>
                  <td className="num mono py-3 text-right">{m.loss === null ? "—" : `${m.loss.toFixed(2)} s`}</td>
                  <td className="num mono py-3 text-right">{m.worst === null ? "—" : `${m.worst.toFixed(2)} s`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-3">
          To see a difference, switch the clock mode on the Integrity page and read once on a throttled connection (DevTools → Slow 3G). Target: ≤ 1 s loss on
          Slow 3G with the fair clock.
        </p>
      </section>
    </div>
  );
}
