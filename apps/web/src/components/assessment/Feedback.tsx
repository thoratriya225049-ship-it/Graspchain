import type { Feedback, FeedbackRecord } from "@graspchain/shared";
import { Icon } from "../ui/Icon";
import { KP, Mark } from "../ui/Status";

type KpInfo = { id: string; concept: string; label: string; weight: number; p?: number };

/** Key ideas of the article with the judge's label for each; weight shown as ticks. */
export function KeyIdeas({ keyPoints }: { keyPoints: KpInfo[] }) {
  return (
    <ul className="divide-y divide-rule">
      {keyPoints.map((k) => (
        <li key={k.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 py-3">
          <div className="min-w-0">
            <p className="text-[0.9375rem]">{k.concept}</p>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-3">
              <span className="mono">{k.id}</span>
              <span aria-label={`weight ${k.weight}`} className="tracking-[0.2em]">
                {"▮".repeat(k.weight)}
                <span className="text-ink-3/30">{"▮".repeat(Math.max(0, 3 - k.weight))}</span>
              </span>
            </p>
          </div>
          <Mark spec={KP[k.label] ?? KP.absent} compact />
        </li>
      ))}
    </ul>
  );
}

const quote = "border-l-2 border-lavender/60 pl-3 font-serif text-[1.0625rem] italic leading-relaxed text-ink";

/** Grounded feedback (PRD §9.2.8). Quotes are exact substrings of the student's answer. */
export function FeedbackView({ record, partial, keyPoints }: { record: FeedbackRecord | null; partial?: Partial<Feedback> | null; keyPoints: KpInfo[] }) {
  const f = (record?.feedback ?? partial ?? null) as Partial<Feedback> | null;
  const concept = (id: string) => keyPoints.find((k) => k.id === id)?.concept ?? id;
  if (!f)
    return (
      <div aria-busy="true" className="space-y-3">
        <div className="skeleton h-6 w-3/4" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-5/6" />
        <p className="sr-only">Writing feedback</p>
      </div>
    );
  const streaming = !record;
  return (
    <div className={streaming ? "opacity-80" : "animate-fade"}>
      {f.oneLineSummary ? <p className="font-serif text-lg leading-snug md:text-xl">{f.oneLineSummary}</p> : null}
      <p className="mt-3 text-xs text-ink-3">
        {streaming
          ? "Writing feedback…"
          : record!.source === "llm"
            ? `Written by ${record!.model}, then checked: every quote is your exact words and agrees with the judge${record!.dropped ? ` (${record!.dropped} unsupported item${record!.dropped > 1 ? "s" : ""} removed)` : ""}.`
            : `Feedback (basic) · ${record!.fallbackReason ?? "Built from the judge’s results."}`}
      </p>

      {f.understood?.length ? (
        <Section title="What you understood" count={f.understood.length}>
          {f.understood.map((u, i) => (
            <li key={i} className="py-3">
              <p className="text-sm font-medium text-ok">
                <Icon name="check" size={13} className="mr-1.5 inline align-[-2px]" />
                {concept(u.keyPointId ?? "")}
              </p>
              {u.evidence ? <p className={`mt-2 ${quote}`}>“{u.evidence}”</p> : null}
            </li>
          ))}
        </Section>
      ) : null}

      {f.misunderstood?.length ? (
        <Section title="What to correct" count={f.misunderstood.length}>
          {f.misunderstood.map((m, i) => (
            <li key={i} className="grid gap-2 py-4">
              <p className={quote.replace("border-rule-strong", "border-bad-mark")}>“{m.studentQuote}”</p>
              <p className="text-sm text-ink-2">
                <span className="font-semibold text-bad">Why it&rsquo;s off · </span>
                {m.why}
              </p>
              <p className="text-sm text-ink-2">
                <span className="font-semibold text-ok">Correct version · </span>
                {m.correctVersion}
              </p>
            </li>
          ))}
        </Section>
      ) : null}

      {f.missed?.length ? (
        <Section title="What you missed" count={f.missed.length}>
          {f.missed.map((m, i) => (
            <li key={i} className="py-3">
              <p className="text-sm font-medium text-ink-3">
                <Icon name="missed" size={13} className="mr-1.5 inline align-[-2px]" />
                {concept(m.keyPointId ?? "")}
              </p>
              <p className="mt-1 text-[0.9375rem] text-ink-2">{m.whatToAdd}</p>
            </li>
          ))}
        </Section>
      ) : null}

      {f.couldBeBetter?.length ? (
        <Section title="How to make it better" count={f.couldBeBetter.length}>
          {f.couldBeBetter.map((c, i) => (
            <li key={i} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2 py-3">
              <span className="mono text-sm text-ink-3">{i + 1}.</span>
              <div>
                <p className="text-[0.9375rem]">{c.action}</p>
                {c.exampleSentence ? <p className="mt-1.5 text-sm italic text-ink-3">e.g. “{c.exampleSentence}”</p> : null}
              </div>
            </li>
          ))}
        </Section>
      ) : null}

      {f.nextStep ? (
        <div className="mt-8 rounded-[14px] bg-mint px-4 py-3">
          <p className="eyebrow">Next step</p>
          <p className="mt-2 text-[0.9375rem]">{f.nextStep}</p>
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h3 className="flex items-baseline justify-between border-b border-rule pb-2">
        <span className="eyebrow text-ink">{title}</span>
        <span className="num mono text-xs text-ink-3">{count}</span>
      </h3>
      <ul className="divide-y divide-rule">{children}</ul>
    </section>
  );
}
