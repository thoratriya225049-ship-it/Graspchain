import type { Metadata } from "next";
import Link from "next/link";
import { DIMENSION_COPY } from "@graspchain/shared";
import { Fingerprint } from "@/components/charts/Fingerprint";
import { AttemptLedger } from "@/components/assessment/Ledger";
import { ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Bits";
import { page, requireMe } from "@/lib/api";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Progress" };

const DIMS = ["coverage", "correctness", "reasoning", "ownWords"] as const;
const signed = (v: number, digits = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}`;

/** S8: fingerprint over attempts, retry deltas, and the recommendation with its reason. */
export default async function ProgressPage() {
  await requireMe(["student"], "/progress");
  const p = await page<Profile>("/api/profile/me", "/progress");
  return (
    <div className="frame pt-10 md:pt-14">
      <header>
        <p className="eyebrow">Progress</p>
        <h1 className="mt-3 font-serif text-2xl md:text-3xl">Your comprehension fingerprint</h1>
        <p className="mt-3 max-w-2xl text-[0.9375rem] text-ink-2">
          Four dimensions per attempt. The overall score adds accuracy and penalties; these are the parts you can work on directly.
        </p>
      </header>

      {p.researchHidden ? (
        <div className="mt-8">
          <Notice tone="warn" title="Research mode is on">
            Scores are hidden until your instructor turns research mode off. Your attempts are listed below.
          </Notice>
        </div>
      ) : null}

      {!p.researchHidden && p.fingerprint.length ? (
        <section className="mt-10 border-t border-ink pt-8" aria-labelledby="fp">
          <h2 id="fp" className="sr-only">
            Dimensions over attempts
          </h2>
          {p.fingerprint.length > 1 ? (
            <Fingerprint data={p.fingerprint} />
          ) : (
            <p className="text-ink-3">One attempt so far — the chart appears after your second.</p>
          )}
        </section>
      ) : null}

      <div className="mt-16 grid gap-14 lg:grid-cols-2">
        <section aria-labelledby="retries">
          <h2 id="retries" className="font-serif text-xl">
            Retries
          </h2>
          <p className="mt-1 text-sm text-ink-3">The change from your previous attempt at the same article.</p>
          {p.retries.length ? (
            <ul className="mt-5 border-t border-ink">
              {p.retries.map((r) => (
                <li key={r.to} className="border-b border-rule py-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <Link href={`/attempts/${r.to}`} className="font-serif text-md no-underline hover:underline">
                      {r.articleTitle}
                    </Link>
                    <span className={`num mono text-lg ${r.finalScore >= 0 ? "text-ok" : "text-bad"}`}>{signed(r.finalScore)}</span>
                  </div>
                  <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-3">
                    {DIMS.map((d) => (
                      <span key={d}>
                        {DIMENSION_COPY[d].label} <span className="num mono text-ink">{signed((r.dimensions[d] ?? 0) * 100, 0)}</span>
                      </span>
                    ))}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 border-t border-ink pt-5 text-[0.9375rem] text-ink-3">Retry an article to see how much you improved on it.</p>
          )}
        </section>
        <section aria-labelledby="next" className="lg:border-l lg:border-rule lg:pl-12">
          <h2 id="next" className="font-serif text-xl">
            Next
          </h2>
          <p className="mt-5 border-t border-ink pt-5 font-serif text-lg">{p.recommendation.title}</p>
          <p className="mt-3 border-l-2 border-signal pl-3 text-[0.9375rem] text-ink-2">{p.recommendation.reason}</p>
          <ButtonLink href={`/start/${p.recommendation.articleId}`} className="mt-6" iconAfter="arrow">
            Start reading
          </ButtonLink>
        </section>
      </div>

      <section aria-labelledby="all" className="mt-20">
        <h2 id="all" className="mb-4 font-serif text-xl">
          Every attempt
        </h2>
        <AttemptLedger attempts={p.attempts} empty="No attempts yet." />
      </section>
    </div>
  );
}
