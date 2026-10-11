"use client";

import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/Button";
import { Field, Notice, inputClass } from "@/components/ui/Bits";
import { call, store } from "@/lib/http";

interface Next {
  attemptId: string;
  articleId: string;
  articleTitle: string;
  articleSentences: string[];
  keyPoints: { id: string; statement: string; weight: number }[];
  answer: string;
}

/** Blind rating desk: rater identity is remembered on this device only. */
export function RatingDesk() {
  const ls = store("local");
  const [rater, setRater] = useState("");
  const [type, setType] = useState<"internal" | "external">("internal");
  const [started, setStarted] = useState(false);
  const [q, setQ] = useState<{ total: number; done: number; next: Next | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    setRater(ls.get("gc-rater") ?? "");
    setType((ls.get("gc-rater-type") as "internal" | "external") ?? "internal");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async (name: string) => {
    const r = await call<{ total: number; done: number; next: Next | null }>(`/api/research/rating-queue?rater=${encodeURIComponent(name)}`);
    if (!r.ok) return setError(r.error!.message);
    setQ(r.data);
  }, []);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!rater.trim()) return setError("Enter a rater name, e.g. R1 or an initials code.");
    ls.set("gc-rater", rater.trim());
    ls.set("gc-rater-type", type);
    setError(null);
    setStarted(true);
    await load(rater.trim());
  }

  async function rate(score: number) {
    if (!q?.next) return;
    setBusy(score);
    const r = await call("/api/research/rating", { method: "POST", json: { attemptId: q.next.attemptId, rater: rater.trim(), raterType: type, score } });
    setBusy(null);
    if (!r.ok) return setError(r.error!.message);
    await load(rater.trim());
  }

  if (!started)
    return (
      <form onSubmit={start} className="mt-6 flex flex-wrap items-end gap-4">
        <div className="w-48">
          <Field label="Rater name" htmlFor="rater">
            <input id="rater" value={rater} onChange={(e) => setRater(e.target.value)} className={inputClass} placeholder="R1" />
          </Field>
        </div>
        <fieldset className="flex gap-4 pb-2.5 text-sm">
          <legend className="sr-only">Rater type</legend>
          {(["internal", "external"] as const).map((t) => (
            <label key={t} className="flex items-center gap-2">
              <input type="radio" name="rtype" checked={type === t} onChange={() => setType(t)} className="accent-[#12708A]" />
              {t === "internal" ? "Team member" : "External rater"}
            </label>
          ))}
        </fieldset>
        <Button type="submit">Start rating</Button>
        {error ? <p className="w-full text-sm text-bad">{error}</p> : null}
      </form>
    );

  if (!q) return <div className="skeleton mt-6 h-40" aria-busy="true" />;
  if (!q.next)
    return (
      <div className="mt-6">
        <Notice tone="ok" title={q.total ? `All ${q.total} answers rated by ${rater}` : "Nothing to rate yet"}>
          {q.total
            ? "Thank you. Agreement statistics below update as ratings arrive."
            : "Rated answers come from first attempts of consenting students (seeded demo attempts are excluded)."}
        </Notice>
        <button className="link mt-4 text-sm" onClick={() => setStarted(false)}>
          Switch rater
        </button>
      </div>
    );

  return (
    <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div>
        <p className="eyebrow">
          {q.done + 1} of {q.total} · rater <span className="mono normal-case tracking-normal">{rater}</span>
        </p>
        <p className="mt-2 font-serif text-lg">{q.next.articleTitle}</p>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-ink-3">Article text</summary>
          <p className="mt-2 font-serif leading-relaxed text-ink-2">{q.next.articleSentences.join(" ")}</p>
        </details>
        <h3 className="eyebrow mt-6">Rubric · key points</h3>
        <ul className="mt-2 border-t border-rule text-sm">
          {q.next.keyPoints.map((k) => (
            <li key={k.id} className="border-b border-rule py-2">
              <span className="mono mr-2 text-xs text-ink-3">
                {k.id} ×{k.weight}
              </span>
              {k.statement}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="eyebrow">The answer</p>
        <p className="mt-3 rounded-[20px] border-l-[3px] border-lavender bg-lavender/[0.07] px-5 py-5 font-serif text-[1.0625rem] leading-relaxed">
          {q.next.answer}
        </p>
        <p className="eyebrow mt-6">Your score</p>
        <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-10" role="group" aria-label="Score from 1 to 10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => rate(n)}
              disabled={busy !== null}
              className="num mono h-12 rounded-[12px] bg-paper-raised text-[0.9375rem] ring-1 ring-rule transition-colors hover:bg-teal hover:text-white disabled:opacity-50"
            >
              {busy === n ? "…" : n}
            </button>
          ))}
        </div>
        <p className="mt-2 flex justify-between text-xs text-ink-3">
          <span>1 · surface</span>
          <span>10 · complete and precise</span>
        </p>
        {error ? <p className="mt-3 text-sm text-bad">{error}</p> : null}
      </div>
    </div>
  );
}

interface SimRun {
  label: string;
  ratioMean: number | null;
  ratioSd: number | null;
  fastMedian: number;
  normalMedian: number;
  fastAdmit: number;
  normalAdmit: number;
  jain: number;
}

// Teal and deep Lavender (both ≥ 4.4:1 on Paper); every value is also in the table beside the chart.
const FAST = "#12708A";
const NORMAL = "#7E6AA8";

export function FairGateSim() {
  const [runs, setRuns] = useState<SimRun[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const r = await call<{ runs: SimRun[] }>("/api/research/fairgate-sim", { method: "POST", json: { mode: "fair", seeds: 30 } });
    setBusy(false);
    if (!r.ok) return setError(r.error!.message);
    setRuns(r.data.runs);
  }

  return (
    <div className="mt-6">
      <Button variant="secondary" onClick={run} busy={busy}>
        {runs ? "Run again" : "Run the simulation"}
      </Button>
      {error ? <p className="mt-3 text-sm text-bad">{error}</p> : null}
      {runs ? (
        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <figure>
            <figcaption className="eyebrow">Median wait to admission (seconds)</figcaption>
            <ul className="mt-3 flex gap-6 text-sm text-ink-2" aria-label="Legend">
              <li className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-[2px]" style={{ background: FAST }} aria-hidden /> Fast links
              </li>
              <li className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-[2px]" style={{ background: NORMAL }} aria-hidden /> Normal links
              </li>
            </ul>
            <div className="mt-3 h-64" role="img" aria-label="Median waits by condition; the table beside it has the same numbers.">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={runs} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barGap={2} barCategoryGap="28%">
                  <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "rgb(11 58 74 / 0.22)" }} tick={{ fill: "#4F7682", fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "#4F7682", fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: "rgb(106 204 198 / 0.12)" }}
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="rounded-[12px] bg-paper-raised px-3 py-2 text-xs shadow-lift ring-1 ring-rule">
                          <p className="font-semibold">{(payload[0].payload as SimRun).label}</p>
                          <p className="mt-1">
                            Fast <span className="num mono">{(payload[0].payload as SimRun).fastMedian.toFixed(1)} s</span>
                          </p>
                          <p>
                            Normal <span className="num mono">{(payload[0].payload as SimRun).normalMedian.toFixed(1)} s</span>
                          </p>
                        </div>
                      ) : null
                    }
                  />
                  <Bar dataKey="fastMedian" fill={FAST} maxBarSize={24} radius={[4, 4, 0, 0]} stroke="#f7fcfc" strokeWidth={2} isAnimationActive={false} />
                  <Bar dataKey="normalMedian" fill={NORMAL} maxBarSize={24} radius={[4, 4, 0, 0]} stroke="#f7fcfc" strokeWidth={2} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </figure>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] text-sm">
              <thead>
                <tr className="border-b border-rule-strong text-left">
                  <th className="eyebrow py-2">Condition</th>
                  <th className="eyebrow py-2 text-right">Slow ÷ fast</th>
                  <th className="eyebrow py-2 text-right">Admitted ≤ 60 s</th>
                  <th className="eyebrow py-2 text-right">Jain</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.label} className="border-b border-rule">
                    <td className="py-2.5">{r.label}</td>
                    <td className={`num mono py-2.5 text-right ${r.ratioMean !== null && r.ratioMean <= 1.2 ? "text-ok" : "text-bad"}`}>
                      {r.ratioMean === null ? "—" : `${r.ratioMean.toFixed(2)} ± ${(r.ratioSd ?? 0).toFixed(2)}`}
                    </td>
                    <td className="num mono py-2.5 text-right">
                      {Math.round(r.fastAdmit * 100)}% / {Math.round(r.normalAdmit * 100)}%
                    </td>
                    <td className="num mono py-2.5 text-right">{r.jain.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-ink-3">
              Latency-advantage ratio: median wait of normal clients ÷ fast clients. Target ≤ 1.2; arrival order (FIFO) is expected to be far above it.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
