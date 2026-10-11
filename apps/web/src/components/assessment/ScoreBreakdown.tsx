import { DIMENSION_COPY } from "@graspchain/shared";
import type { ScorePayload } from "@/lib/types";

const SHADE: Record<string, string> = {
  coverage: "bg-abyss",
  correctness: "bg-teal",
  accuracy: "bg-aqua",
  reasoning: "bg-sky",
  ownWords: "bg-peri",
};

/**
 * How the number was made (PRD §9.2.7): 1 + Σ 9·weight·dimension, then misconception penalties
 * and caps. One bar from 1 to 10, segmented by each dimension's points — the arithmetic, drawn.
 */
export function ScoreBreakdown({ score }: { score: ScorePayload }) {
  const raw = 1 + score.contributions.reduce((s, c) => s + c.points, 0);
  const x = (v: number) => `${(Math.max(0, v) / 9) * 100}%`;
  let acc = 0;
  return (
    <div>
      <div className="relative h-4 overflow-hidden rounded-full bg-mint" aria-hidden>
        {score.contributions.map((c) => {
          const left = acc;
          acc += c.points;
          return (
            <div key={c.key} className={`absolute inset-y-0 ${SHADE[c.key]} border-r-2 border-paper-raised`} style={{ left: x(left), width: x(c.points) }} />
          );
        })}
        {raw - 1 > score.finalScore - 1 + 0.01 ? (
          <div className="absolute inset-y-0 border-l-2 border-bad-mark" style={{ left: x(score.finalScore - 1) }} title="Final score after adjustments" />
        ) : null}
      </div>
      <div className="mt-1 flex justify-between text-2xs text-ink-3">
        <span className="num">1</span>
        <span className="num">10</span>
      </div>
      <table className="mt-4 w-full text-sm">
        <caption className="sr-only">Score construction</caption>
        <tbody>
          <tr className="border-b border-rule">
            <td className="py-2 text-ink-3">Base</td>
            <td />
            <td className="num mono py-2 text-right">1.00</td>
          </tr>
          {score.contributions.map((c) => (
            <tr key={c.key} className="border-b border-rule">
              <td className="py-2">
                <span className={`mr-2 inline-block h-2.5 w-2.5 border border-ink/40 align-[-1px] rounded-full ${SHADE[c.key]}`} aria-hidden />
                {DIMENSION_COPY[c.key].label}
              </td>
              <td className="num mono py-2 text-right text-ink-3">
                {Math.round(c.weight * 100)}% × {(c.value * 100).toFixed(0)}
              </td>
              <td className="num mono py-2 text-right">+{c.points.toFixed(2)}</td>
            </tr>
          ))}
          {score.adjustments.map((a) => (
            <tr key={a} className="border-b border-rule text-warn">
              <td className="py-2" colSpan={2}>
                {a}
              </td>
              <td />
            </tr>
          ))}
          <tr>
            <td className="pt-3 font-semibold">Final</td>
            <td />
            <td className="num mono pt-3 text-right font-semibold">{score.finalScore.toFixed(1)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-3 text-xs text-ink-3">
        Weights were fixed before any data was seen. No text enters this arithmetic — only the judge&rsquo;s probabilities and the copied-phrase share.
      </p>
    </div>
  );
}
