import type { Metadata } from "next";
import Link from "next/link";
import { formatDateTime } from "@graspchain/shared";
import { inputClass } from "@/components/ui/Bits";
import { buttonClass } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Sheet";
import { Tag } from "@/components/ui/Status";
import { page, requireMe } from "@/lib/api";
import type { QueueItem } from "@/lib/types";

export const metadata: Metadata = { title: "Review" };

/** Review: one calm list. The first item is the one to open; everything else waits its turn. */
export default async function TeacherPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  await requireMe(["teacher", "admin"], "/teacher");
  const { search } = await searchParams;
  const q = await page<{ queue: QueueItem[]; reviewed: QueueItem[]; search: QueueItem[] | null }>(
    `/api/teacher/queue${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    "/teacher",
  );
  const first = q.queue[0];
  return (
    <div className="frame-narrow pt-10 md:pt-14">
      <header>
        <p className="eyebrow">Review</p>
        <h1 className="display mt-3 text-[clamp(2.25rem,5vw,3.25rem)]">
          {q.queue.length ? `${q.queue.length} answer${q.queue.length > 1 ? "s" : ""} to look at` : "Nothing waiting"}
        </h1>
        <p className="mt-3 max-w-xl text-[0.9375rem] text-ink-2">
          Answers the system stayed unsure about, or that address the grader. A correction never edits a record — it adds a new, linked one, with your reason.
        </p>
      </header>

      {first ? (
        <Link
          href={`/teacher/${first.attemptId}`}
          className="group mt-10 block rounded-[28px] p-7 no-underline ring-1 ring-rule transition-shadow hover:shadow-lift sm:p-9"
          style={{ background: "linear-gradient(150deg, #DAF3F2, #F7FCFC)" }}
        >
          <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-3">Next up</p>
          <p className="mt-3 font-serif text-2xl leading-snug text-ink">{first.articleTitle}</p>
          <p className="mt-2 text-sm text-ink-3">
            <span className="mono">{first.studentCode}</span> · {first.articleId} · attempt {first.attemptNo} · {formatDateTime(first.createdAt)}
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {first.reasons.map((r) => (
              <Tag key={r} tone={/grader|stuffing|failed/i.test(r) ? "bad" : "warn"}>
                {r}
              </Tag>
            ))}
          </div>
          <span className={`${buttonClass("primary", "md")} mt-7`}>
            Open review <span aria-hidden>→</span>
          </span>
        </Link>
      ) : null}

      <ItemList title="Waiting" items={q.queue.slice(1)} empty={q.queue.length ? "Nothing else waiting." : "Flagged answers will appear here."} />

      <div className="mt-14">
        <Reveal summary="Find a student's attempts" meta="by roster code" defaultOpen={!!search}>
          <form className="flex gap-2" action="/teacher">
            <label htmlFor="search" className="sr-only">
              Search by roster code
            </label>
            <input id="search" name="search" defaultValue={search ?? ""} placeholder="Roster code, e.g. DEMO-01" className={`${inputClass} mono`} />
            <button className={buttonClass("secondary")}>Search</button>
          </form>
          {q.search ? <ItemList title={`Matching “${search}”`} items={q.search} empty="No attempts match that code." /> : null}
        </Reveal>
        <Reveal summary="Recently corrected" meta={`${q.reviewed.length}`}>
          <ItemList items={q.reviewed} empty="No corrections yet." />
        </Reveal>
        <div className="border-t border-rule" />
      </div>
    </div>
  );
}

function ItemList({ title, items, empty }: { title?: string; items: QueueItem[]; empty: string }) {
  return (
    <section className={title ? "mt-12" : "mt-2"}>
      {title ? <h2 className="mb-3 text-2xs font-semibold uppercase tracking-[0.14em] text-ink-3">{title}</h2> : null}
      {items.length ? (
        <ul className="divide-y divide-rule rounded-[20px] bg-paper-raised ring-1 ring-rule">
          {items.map((i) => (
            <li key={i.attemptId}>
              <Link
                href={`/teacher/${i.attemptId}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 px-5 py-4 no-underline transition-colors hover:bg-mint/50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-serif text-md text-ink">{i.articleTitle}</span>
                  <span className="mt-0.5 block text-xs text-ink-3">
                    <span className="mono">{i.studentCode}</span> · {i.articleId} · attempt {i.attemptNo} · {formatDateTime(i.createdAt)}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {i.reasons.map((r) => (
                      <Tag key={r} tone={/grader|stuffing|failed/i.test(r) ? "bad" : "warn"}>
                        {r}
                      </Tag>
                    ))}
                    {i.reviewed ? <Tag tone="signal">Corrected</Tag> : null}
                  </span>
                </span>
                <span className="num text-right font-serif text-xl leading-none text-ink">
                  {i.currentScore?.toFixed(1) ?? "—"}
                  {i.reviewed && i.systemScore !== null ? <span className="block text-xs text-ink-3">was {i.systemScore.toFixed(1)}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[18px] bg-paper-sunk px-5 py-5 text-[0.9375rem] text-ink-3">{empty}</p>
      )}
    </section>
  );
}
