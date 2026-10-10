import Link from "next/link";
import { formatDate } from "@graspchain/shared";
import type { AttemptListItem } from "@/lib/types";
import { CHAIN, Mark, Tag } from "../ui/Status";

/** Attempts as a ledger: one ruled row each, newest first. */
export function AttemptLedger({ attempts, empty }: { attempts: AttemptListItem[]; empty?: React.ReactNode }) {
  if (!attempts.length) return <div className="border-t border-ink py-8 text-ink-3">{empty ?? "No attempts yet."}</div>;
  const rows = [...attempts].reverse();
  return (
    <div className="border-t border-ink">
      <div className="hidden grid-cols-[6rem_minmax(0,1fr)_5rem_11rem_1.5rem] gap-4 border-b border-rule py-2 md:grid">
        <span className="eyebrow">Date</span>
        <span className="eyebrow">Article</span>
        <span className="eyebrow text-right">Score</span>
        <span className="eyebrow">Record</span>
        <span />
      </div>
      <ul>
        {rows.map((a) => (
          <li key={a.attemptId}>
            <Link
              href={`/attempts/${a.attemptId}`}
              className="group grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 border-b border-rule py-4 no-underline transition-colors hover:bg-paper-raised md:grid-cols-[6rem_minmax(0,1fr)_5rem_11rem_1.5rem] md:px-0"
            >
              <span className="num text-sm text-ink-3 md:order-none">{formatDate(a.createdAt)}</span>
              <span className="order-first col-span-2 min-w-0 md:order-none md:col-span-1">
                <span className="block truncate font-serif text-md text-ink group-hover:underline group-hover:decoration-rule-strong group-hover:underline-offset-4">
                  {a.articleTitle}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-3">
                  <span className="mono">{a.articleId}</span>
                  <span>attempt {a.attemptNo}</span>
                  {a.reviewed ? <Tag tone="signal">Teacher-corrected</Tag> : null}
                  {a.lowConfidence ? <Tag tone="warn">Under review</Tag> : null}
                  {a.seeded ? <span className="italic">seeded demo</span> : null}
                </span>
              </span>
              <span className="num text-right font-serif text-xl leading-none text-ink">
                {a.status !== "done" ? (
                  <span className="text-sm text-ink-3">{a.status}</span>
                ) : a.finalScore === null ? (
                  <span className="text-sm text-ink-3">hidden</span>
                ) : (
                  a.finalScore.toFixed(1)
                )}
              </span>
              <span className="hidden md:block">
                {a.chainStatus ? <Mark spec={CHAIN[a.chainStatus] ?? CHAIN.queued} compact /> : <span className="text-xs text-ink-3">—</span>}
              </span>
              <span className="hidden text-ink-3 transition-transform group-hover:translate-x-0.5 md:block" aria-hidden>
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
