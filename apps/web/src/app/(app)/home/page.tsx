import type { Metadata } from "next";
import Link from "next/link";
import { DIMENSION_COPY } from "@graspchain/shared";
import { AttemptLedger } from "@/components/assessment/Ledger";
import { ButtonLink } from "@/components/ui/Button";
import { Meter, Notice } from "@/components/ui/Bits";
import { page, requireMe } from "@/lib/api";
import type { ArticlesResponse, Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Desk" };

const DIMS = ["coverage", "correctness", "reasoning", "ownWords"] as const;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default async function Desk() {
  const me = await requireMe(["student"], "/home");
  const [profile, lib] = await Promise.all([page<Profile>("/api/profile/me", "/home"), page<ArticlesResponse>("/api/articles", "/home")]);
  const rec = profile.recommendation;
  const recArticle = lib.articles.find((a) => a.id === rec.articleId)!;
  const last = profile.fingerprint[profile.fingerprint.length - 1] ?? null;
  const prev = profile.fingerprint[profile.fingerprint.length - 2] ?? null;
  // Same window the recommendation uses: the average of the last three attempts.
  const recent = profile.fingerprint.slice(-3);
  const avg = (d: (typeof DIMS)[number]) => (recent.length ? recent.reduce((s, f) => s + f[d], 0) / recent.length : null);

  return (
    <div className="frame pt-10 md:pt-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">
            Desk · <span className="mono normal-case tracking-normal">{me.code}</span>
          </p>
          <h1 className="mt-3 font-serif text-2xl md:text-3xl">What to read next</h1>
        </div>
        {profile.stats ? (
          <dl className="flex gap-8">
            {[
              ["Attempts", String(profile.stats.count)],
              ["Average", profile.stats.mean?.toFixed(1) ?? "—"],
              ["Best", profile.stats.best?.toFixed(1) ?? "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="eyebrow">{k}</dt>
                <dd className="num mt-1 font-serif text-xl">{v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </header>

      {profile.researchHidden ? (
        <div className="mt-8">
          <Notice tone="warn" title="Research mode is on">
            Your answers are recorded and scored, but scores stay hidden until your instructor turns research mode off.
          </Notice>
        </div>
      ) : null}

      <div className="mt-10 grid gap-12 border-t border-ink pt-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-16">
        <section aria-labelledby="rec" className="animate-rise">
          <p className="eyebrow text-signal-ink">Recommended for you</p>
          <h2 id="rec" className="mt-3 max-w-2xl font-serif text-2xl leading-[1.1] md:text-[2.75rem]">
            {recArticle.title}
          </h2>
          <p className="mt-4 max-w-xl text-md text-ink-2">{recArticle.dek}</p>
          <p className="mt-6 max-w-xl border-l-2 border-signal pl-4 text-[0.9375rem] text-ink-2">{rec.reason}</p>
          <dl className="mt-8 grid grid-cols-2 gap-x-10 gap-y-4 text-sm sm:flex sm:flex-wrap">
            <div>
              <dt className="eyebrow">Reading time</dt>
              <dd className="num mono mt-1">{mmss(recArticle.readSeconds)}</dd>
            </div>
            <div>
              <dt className="eyebrow">Length</dt>
              <dd className="num mt-1">{recArticle.wordCount} words</dd>
            </div>
            <div>
              <dt className="eyebrow">Key ideas</dt>
              <dd className="num mt-1">{recArticle.keyPointCount}</dd>
            </div>
            <div>
              <dt className="eyebrow">Difficulty</dt>
              <dd className="mt-1">{["", "Introductory", "Intermediate", "Advanced"][recArticle.difficulty]}</dd>
            </div>
          </dl>
          <div className="mt-10 flex flex-wrap items-center gap-6">
            <ButtonLink href={`/start/${rec.articleId}`} size="lg" iconAfter="arrow">
              Start reading
            </ButtonLink>
            <Link href="/library" className="link text-[0.9375rem]">
              Browse all articles
            </Link>
          </div>
        </section>

        <aside aria-labelledby="stand" className="animate-rise [animation-delay:80ms] lg:border-l lg:border-rule lg:pl-12">
          <h2 id="stand" className="eyebrow">
            Your fingerprint · last {recent.length || 3}
          </h2>
          {last ? (
            <>
              <div className="mt-6 space-y-5">
                {DIMS.map((d) => (
                  <Meter key={d} label={DIMENSION_COPY[d].label} value={avg(d)} tone={rec.weakest === d ? "signal" : "ink"} size="sm" />
                ))}
              </div>
              {prev ? (
                <p className="mt-6 text-sm text-ink-3">
                  Latest attempt {last.finalScore >= prev.finalScore ? "up" : "down"}{" "}
                  <span className="num mono text-ink">{Math.abs(last.finalScore - prev.finalScore).toFixed(1)}</span> since the attempt before.
                </p>
              ) : null}
              <Link href="/progress" className="link mt-6 inline-block text-sm">
                See progress over time
              </Link>
            </>
          ) : (
            <p className="mt-6 text-[0.9375rem] text-ink-3">
              {profile.researchHidden ? "Hidden while research mode is on." : "After your first assessment, your four comprehension dimensions appear here."}
            </p>
          )}
        </aside>
      </div>

      <section aria-labelledby="recent" className="mt-20">
        <div className="mb-4 flex items-end justify-between">
          <h2 id="recent" className="font-serif text-xl">
            Recent work
          </h2>
          <span className="text-xs text-ink-3">Every result is a receipt you can verify.</span>
        </div>
        <AttemptLedger attempts={profile.attempts.slice(-6)} empty="Nothing yet — your first result will be listed here with its on-chain record." />
      </section>
    </div>
  );
}
