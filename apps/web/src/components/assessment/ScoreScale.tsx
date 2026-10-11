import { BANDS } from "@graspchain/shared";

/**
 * The 1–10 ruler: band segments as labelled spans along one rule, ticks at every point, and the
 * score as a marker. The band name is always printed, so the colour is never the only cue.
 */
export function ScoreScale({ score, previous }: { score: number; previous?: number | null }) {
  const x = (v: number) => `${((v - 1) / 9) * 100}%`;
  return (
    <div className="select-none" aria-hidden="true">
      <div className="relative h-9">
        <div className="absolute inset-x-0 top-4 h-px" style={{ background: "var(--thread-x)" }} />
        {Array.from({ length: 10 }, (_, i) => i + 1).map((t) => (
          <div key={t} className="absolute top-2.5" style={{ left: x(t) }}>
            <div className={`-ml-px w-px ${t % 5 === 0 || t === 1 ? "h-3.5 bg-ink-2" : "h-2.5 bg-ink-3/50"}`} />
          </div>
        ))}
        {previous != null ? (
          <div className="absolute top-1 -ml-[3px]" style={{ left: x(previous) }} title={`Previous ${previous.toFixed(1)}`}>
            <div className="h-1.5 w-1.5 rounded-full border border-ink-3 bg-paper" />
          </div>
        ) : null}
        <div className="absolute top-0 transition-[left] duration-700 ease-out" style={{ left: x(score) }}>
          <div className="-ml-[5px] h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-teal" />
          <div className="-ml-px mt-0 h-6 w-[2px] bg-teal" />
        </div>
      </div>
      <div className="relative mt-1 h-8 text-2xs">
        {BANDS.filter((b) => b.band !== "Expert").map((b) => (
          <div
            key={b.band}
            className="absolute hidden border-l border-rule-strong pl-1.5 text-ink-3 sm:block"
            style={{ left: x(b.from), width: `calc(${x(b.to + 0.1)} - ${x(b.from)})` }}
          >
            <span className="uppercase tracking-[0.1em]">{b.band}</span>
          </div>
        ))}
        <div className="absolute right-0 text-right uppercase tracking-[0.1em] text-ink-3">10</div>
        {/* Phones: numbers instead of band names (the band is printed beside the score). */}
        <div className="absolute left-0 text-ink-3 sm:hidden">1</div>
        <div className="absolute -translate-x-1/2 text-ink-3 sm:hidden" style={{ left: x(5) }}>
          5
        </div>
      </div>
    </div>
  );
}
