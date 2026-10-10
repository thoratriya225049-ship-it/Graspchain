import type { Metadata } from "next";
import Link from "next/link";
import { formatDateTime } from "@graspchain/shared";
import { inputClass } from "@/components/ui/Bits";
import { buttonClass } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Status";
import { page, requireMe } from "@/lib/api";

export const metadata: Metadata = { title: "Review" };

interface Item {
  attemptId: string;
  studentCode: string;
  articleId: string;
  articleTitle: string;
  attemptNo: number;
  createdAt: string;
  status: string;
  systemScore: number | null;
  currentScore: number | null;
  assessmentId: string | null;
  reviewed: boolean;
  reasons: string[];
}

export default async function TeacherPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  await requireMe(["teacher", "admin"], "/teacher");
  const { search } = await searchParams;
  const q = await page<{ queue: Item[]; reviewed: Item[]; search: Item[] | null }>(
    `/api/teacher/queue${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    "/teacher",
  );
  return (
    <div className="frame pt-10 md:pt-14">
      <header className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] md:items-end">
        <div>
          <p className="eyebrow">Review</p>
          <h1 className="mt-3 font-serif text-2xl md:text-3xl">Answers the system wasn&rsquo;t sure about</h1>
          <p className="mt-3 max-w-2xl text-[0.9375rem] text-ink-2">
            Items stay uncertain after one re-ask, or contain text addressed to the grader. A correction never edits a record: it creates a new receipt that
            supersedes the old one, with your reason, on-chain.
          </p>
        </div>
        <form className="flex gap-2" action="/teacher">
          <label htmlFor="search" className="sr-only">
            Search by roster code
          </label>
          <input id="search" name="search" defaultValue={search ?? ""} placeholder="Roster code, e.g. DEMO-01" className={`${inputClass} mono`} />
          <button className={buttonClass("secondary")}>Search</button>
        </form>
      </header>

      {q.search ? <ItemTable title={`Attempts matching “${search}”`} items={q.search} empty="No attempts match that code." /> : null}
      <ItemTable title="Needs review" items={q.queue} empty="Nothing waiting. Flagged answers will appear here." count />
      <ItemTable title="Recently corrected" items={q.reviewed} empty="No corrections yet." />
    </div>
  );
}

function ItemTable({ title, items, empty, count }: { title: string; items: Item[]; empty: string; count?: boolean }) {
  return (
    <section className="mt-14">
      <h2 className="mb-3 flex items-baseline gap-3 font-serif text-xl">
        {title}
        {count ? <span className="num mono text-sm text-ink-3">{items.length}</span> : null}
      </h2>
      {items.length ? (
        <ul className="border-t border-ink">
          {items.map((i) => (
            <li key={i.attemptId}>
              <Link
                href={`/teacher/${i.attemptId}`}
                className="grid gap-x-6 gap-y-2 border-b border-rule py-4 no-underline hover:bg-paper-raised md:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1.1fr)_5rem]"
              >
                <span className="mono text-sm">{i.studentCode}</span>
                <span className="min-w-0">
                  <span className="block truncate font-serif text-md">{i.articleTitle}</span>
                  <span className="text-xs text-ink-3">
                    <span className="mono">{i.articleId}</span> · attempt {i.attemptNo} · {formatDateTime(i.createdAt)}
                  </span>
                </span>
                <span className="flex flex-wrap items-start gap-1.5">
                  {i.reasons.length ? (
                    i.reasons.map((r) => (
                      <Tag key={r} tone={/grader|stuffing|failed/i.test(r) ? "bad" : "warn"}>
                        {r}
                      </Tag>
                    ))
                  ) : (
                    <span className="text-xs text-ink-3">No flags</span>
                  )}
                  {i.reviewed ? <Tag tone="signal">Corrected</Tag> : null}
                </span>
                <span className="num text-right font-serif text-xl leading-none">
                  {i.currentScore?.toFixed(1) ?? "—"}
                  {i.reviewed && i.systemScore !== null ? <span className="block text-xs text-ink-3">was {i.systemScore.toFixed(1)}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-ink py-6 text-[0.9375rem] text-ink-3">{empty}</p>
      )}
    </section>
  );
}
