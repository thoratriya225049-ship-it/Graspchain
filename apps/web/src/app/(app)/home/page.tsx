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
const LEVEL = ["", "Introductory", "Intermediate", "Advanced"];

/** Desk: one thing to do next — the recommended article. Everything else is quiet and below. */
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
      <p className="eyebrow">
        Desk · <span className="mono normal-case tracking-normal">{me.code}</span>
      </p>

      {profile.researchHidden ? (
        <div className="mt-6">
          <Notice tone="warn" title="Research mode is on">
            Your answers are recorded and scored, but scores stay hidden until your instructor turns research mode off.
          </Notice>
        </div>
      ) : null}

      <section
        aria-labelledby="rec"
        className="mt-6 overflow-hidden rounded-[32px] px-7 py-10 sm:px-12 sm:py-14"
        style={{ background: "linear-gradient(150deg, #AEDFF7 0%, #DAF3F2 55%, #EEF8F8 100%)" }}
      >
        <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-abyss/80">Recommended for you · {recArticle.topic}</p>
        <h1 id="rec" className="display mt-4 max-w-3xl text-[clamp(2.25rem,5.5vw,4rem)] text-abyss">
          {recArticle.title}
        </h1>
        <p className="mt-4 max-w-xl text-md text-abyss/85">{recArticle.dek}</p>
        <p className="mt-6 max-w-xl text-[0.9375rem] text-abyss">
          <span className="font-medium">Why this one · </span>
          {rec.reason}
        </p>
        <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm text-abyss">
          {[
            [
              "Reading time",
              <span key="r" className="num mono">
                {mmss(recArticle.readSeconds)}
              </span>,
            ],
            ["Length", `${recArticle.wordCount} words`],
            ["Key ideas", recArticle.keyPointCount],
            ["Level", LEVEL[recArticle.difficulty]],
          ].map(([k, v]) => (
            <div key={k as string}>
              <dt className="text-2xs uppercase tracking-[0.14em] text-abyss/70">{k}</dt>
              <dd className="mt-1">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-10 flex flex-wrap items-center gap-6">
          <ButtonLink href={`/start/${rec.articleId}`} size="lg" iconAfter="arrow">
            Start reading
          </ButtonLink>
          <Link href="/library" className="text-[0.9375rem] text-abyss underline decoration-abyss/30 underline-offset-4 hover:decoration-abyss">
            Browse all articles
          </Link>
        </div>
      </section>

      <div className="mt-16 grid gap-14 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-16">
        <section aria-labelledby="recent">
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2 id="recent" className="font-serif text-xl">
              Recent work
            </h2>
            <span className="text-xs text-ink-3">Every result is a receipt you can verify.</span>
          </div>
          <AttemptLedger attempts={profile.attempts.slice(-6)} empty="Nothing yet — your first result will appear here with its on-chain record." />
        </section>

        <aside aria-labelledby="stand">
          <h2 id="stand" className="font-serif text-xl">
            Your fingerprint
          </h2>
          <p className="mt-1 text-xs text-ink-3">
            Average of your last {recent.length || 3} attempts
            {profile.stats ? ` · ${profile.stats.count} in all, best ${profile.stats.best?.toFixed(1) ?? "—"}` : ""}
          </p>
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
                  <span className="num mono text-ink">{Math.abs(last.finalScore - prev.finalScore).toFixed(1)}</span> since the one before.
                </p>
              ) : null}
              <Link href="/progress" className="link mt-6 inline-block text-sm text-teal">
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
    </div>
  );
}
