import type { Metadata } from "next";
import Link from "next/link";
import { page, requireMe } from "@/lib/api";
import type { ArticlesResponse } from "@/lib/types";

export const metadata: Metadata = { title: "Library" };

const LEVEL = ["", "Introductory", "Intermediate", "Advanced"];
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** S2 — a table of contents, not a card grid. The text itself is never sent before a session starts. */
export default async function Library() {
  await requireMe(["student"], "/library");
  const { articles, recommended } = await page<ArticlesResponse>("/api/articles", "/library");
  return (
    <div className="frame pt-10 md:pt-14">
      <header className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-end">
        <div>
          <p className="eyebrow">Library</p>
          <h1 className="display mt-3 text-[clamp(2.25rem,5vw,3.5rem)]">Short, applied articles</h1>
        </div>
        <p className="text-sm text-ink-3">
          Each opens for a fixed reading time, then closes for good. You explain it from memory, in your own words, in 30–300 words.
        </p>
      </header>

      <ol className="mt-10 divide-y divide-rule rounded-[24px] bg-paper-raised ring-1 ring-rule">
        {articles.map((a) => {
          const isRec = recommended?.articleId === a.id;
          return (
            <li key={a.id}>
              <article
                className={`group grid gap-x-10 gap-y-4 px-6 py-7 transition-colors md:grid-cols-[4.5rem_minmax(0,1fr)_12rem] md:px-8 ${isRec ? "bg-mint/50" : "hover:bg-paper-sunk/60"}`}
              >
                <p className="mono text-2xl leading-none text-ink-3/70 md:text-[2.25rem]" aria-hidden>
                  {a.id}
                </p>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="eyebrow">{a.topic}</span>
                    {isRec ? (
                      <span className="rounded-full bg-teal px-2.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.12em] text-white">Recommended</span>
                    ) : null}
                  </div>
                  <h2 className="mt-2 font-serif text-xl leading-tight md:text-[1.75rem]">
                    <Link href={`/start/${a.id}`} className="no-underline hover:underline hover:decoration-teal/40 hover:underline-offset-[6px]">
                      {a.title}
                    </Link>
                  </h2>
                  <p className="mt-2 max-w-2xl text-[0.9375rem] text-ink-2">{a.dek}</p>
                  {isRec && recommended ? <p className="mt-3 max-w-2xl text-sm text-ink-2">Why this one · {recommended.reason}</p> : null}
                  <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-ink-3">
                    <div className="flex gap-2">
                      <dt>Read</dt>
                      <dd className="num mono text-ink">{mmss(a.readSeconds)}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt>Length</dt>
                      <dd className="num text-ink">{a.wordCount} words</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt>Key ideas</dt>
                      <dd className="num text-ink">{a.keyPointCount}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt>Level</dt>
                      <dd className="text-ink">{LEVEL[a.difficulty]}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt>Exercises</dt>
                      <dd className="text-ink">{a.skillTags.join(", ")}</dd>
                    </div>
                  </dl>
                </div>
                <div className="flex flex-row items-center justify-between gap-4 md:flex-col md:items-end md:justify-between">
                  <div className="md:text-right">
                    {a.attemptsByMe ? (
                      <>
                        <p className="eyebrow">Your best</p>
                        <p className="num mt-1 font-serif text-2xl leading-none">{a.bestScore?.toFixed(1) ?? "—"}</p>
                        <p className="mt-1 text-xs text-ink-3">
                          {a.attemptsByMe} attempt{a.attemptsByMe > 1 ? "s" : ""}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-ink-3">Not attempted</p>
                    )}
                  </div>
                  <Link
                    href={`/start/${a.id}`}
                    className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[0.9375rem] font-medium text-teal no-underline hover:bg-mint"
                  >
                    {a.attemptsByMe ? "Try again" : "Start"} <span aria-hidden>→</span>
                  </Link>
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
