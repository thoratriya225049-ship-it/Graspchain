"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DIMENSION_COPY, formatDate } from "@graspchain/shared";
import type { Profile } from "@/lib/types";

/**
 * Comprehension fingerprint (PRD §9.6): four dimensions over attempts, in brand-family inks that
 * hold ≥ 3:1 on Paper (Teal, deep Lavender, Abyss, deep Aqua). Two are close in hue, so every
 * series also has its own marker shape, a legend entry and a direct label at the line end. No grid.
 */
export const SERIES = [
  { key: "coverage", color: "#12708A", shape: "circle" },
  { key: "correctness", color: "#7E6AA8", shape: "square" },
  { key: "reasoning", color: "#0B3A4A", shape: "diamond" },
  { key: "ownWords", color: "#2E9C95", shape: "triangle" },
] as const;

type Shape = (typeof SERIES)[number]["shape"];

function Marker({ cx, cy, shape, color, r = 4.5 }: { cx?: number; cy?: number; shape: Shape; color: string; r?: number }) {
  if (cx == null || cy == null) return null;
  const ring = { stroke: "#f7fcfc", strokeWidth: 2, fill: color };
  if (shape === "circle") return <circle cx={cx} cy={cy} r={r} {...ring} />;
  if (shape === "square") return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={1} {...ring} />;
  if (shape === "diamond") return <path d={`M${cx} ${cy - r - 1}L${cx + r + 1} ${cy}L${cx} ${cy + r + 1}L${cx - r - 1} ${cy}Z`} {...ring} />;
  return <path d={`M${cx} ${cy - r - 1}L${cx + r + 1} ${cy + r}L${cx - r - 1} ${cy + r}Z`} {...ring} />;
}

export function Swatch({ shape, color }: { shape: Shape; color: string }) {
  return (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden className="shrink-0">
      <line x1="0" y1="6" x2="22" y2="6" stroke={color} strokeWidth="2" />
      <Marker cx={11} cy={6} shape={shape} color={color} r={3.5} />
    </svg>
  );
}

type Row = Profile["fingerprint"][number];

function TipBox({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-[12px] bg-paper-raised px-3 py-2.5 text-xs shadow-lift ring-1 ring-rule">
      <p className="font-semibold">
        Attempt {row.index} · <span className="mono">{row.articleId}</span> · {formatDate(row.createdAt)}
      </p>
      <p className="mt-0.5 text-ink-3">
        Score <span className="num mono text-ink">{row.finalScore.toFixed(1)}</span>
      </p>
      <ul className="mt-2 space-y-1">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <Swatch shape={s.shape} color={s.color} />
            <span className="w-24 text-ink-2">{DIMENSION_COPY[s.key].label}</span>
            <span className="num mono ml-auto text-ink">{Math.round(row[s.key] * 100)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Fingerprint({ data }: { data: Row[] }) {
  const last = data[data.length - 1];
  return (
    <figure>
      <ul className="mb-4 flex flex-wrap gap-x-6 gap-y-2" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-sm text-ink-2">
            <Swatch shape={s.shape} color={s.color} />
            {DIMENSION_COPY[s.key].label}
          </li>
        ))}
      </ul>
      <div className="h-72 w-full md:h-80" role="img" aria-label={`Four comprehension dimensions over ${data.length} attempts. A table view follows.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 96, bottom: 4, left: -16 }}>
            <XAxis
              dataKey="index"
              tickLine={false}
              axisLine={{ stroke: "rgb(11 58 74 / 0.22)" }}
              tick={{ fill: "#4F7682", fontSize: 12 }}
              tickFormatter={(i) => `#${i}`}
            />
            <YAxis
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#4F7682", fontSize: 12 }}
              tickFormatter={(v) => String(Math.round(v * 100))}
            />
            <Tooltip content={<TipBox />} cursor={{ stroke: "#12708A", strokeWidth: 1 }} />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                isAnimationActive={false}
                dot={(p: { cx?: number; cy?: number; index?: number }) => (
                  <Marker key={`${s.key}-${p.index}`} cx={p.cx} cy={p.cy} shape={s.shape} color={s.color} />
                )}
                activeDot={(p: { cx?: number; cy?: number }) => <Marker cx={p.cx} cy={p.cy} shape={s.shape} color={s.color} r={6} />}
                label={(p: { x?: number | string; y?: number | string; index?: number }) =>
                  p.index === data.length - 1 && p.x != null && p.y != null ? (
                    <text key={`l-${s.key}`} x={Number(p.x) + 12} y={Number(p.y) + 4} fontSize={12} fill="#3F6672">
                      {DIMENSION_COPY[s.key].label} {Math.round(last[s.key] * 100)}
                    </text>
                  ) : (
                    <g key={`l-${s.key}-${p.index}`} />
                  )
                }
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-ink-3">Show as a table</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left">
            <thead>
              <tr className="border-b border-rule-strong">
                <th className="eyebrow py-2">Attempt</th>
                <th className="eyebrow py-2">Article</th>
                {SERIES.map((s) => (
                  <th key={s.key} className="eyebrow py-2 text-right">
                    {DIMENSION_COPY[s.key].label}
                  </th>
                ))}
                <th className="eyebrow py-2 text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.attemptId} className="border-b border-rule">
                  <td className="num py-2">#{r.index}</td>
                  <td className="mono py-2">{r.articleId}</td>
                  {SERIES.map((s) => (
                    <td key={s.key} className="num mono py-2 text-right">
                      {Math.round(r[s.key] * 100)}
                    </td>
                  ))}
                  <td className="num mono py-2 text-right">{r.finalScore.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
