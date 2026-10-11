"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClaimDecision, EvidenceDecision, Feedback, FeedbackRecord, KeyPointDecision } from "@graspchain/shared";
import { useCalm } from "@/components/fx/hooks";
import { ButtonLink } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { KP, TONE_MARK, TONE_TEXT, TONE_WASH, type Tone } from "@/components/ui/Status";

type KpInfo = { id: string; concept: string; label: string; weight: number };
type Link = { voice: "student" | "source" | "judge" | "bad" | "ok"; label: string; text: string; quote?: boolean };

/** Node colours on the evidence thread: Lavender is the student's voice, Aqua the source, Ink the judge. */
const NODE: Record<Link["voice"], string> = {
  student: "bg-lavender",
  source: "bg-aqua",
  judge: "bg-ink",
  bad: "bg-bad-mark",
  ok: "bg-ok-mark",
};

/**
 * The feedback half of the Result (PRD §9.2.8), arranged as evidence to explore rather than a report
 * to read: a key-idea map that doubles as navigation, three clearly separated groups, and for every
 * item the source → claim → decision thread one click away. Quotes are exact substrings of the answer.
 */
export function ComprehensionReport({
  f,
  record,
  keyPoints,
  evidence,
  fallbackSummary,
  retryHref,
}: {
  f: Partial<Feedback> | null;
  record: FeedbackRecord | null;
  keyPoints: KpInfo[];
  evidence: EvidenceDecision | null | undefined;
  fallbackSummary: string;
  retryHref?: string;
}) {
  const { still } = useCalm();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const kpById = useMemo(() => new Map(keyPoints.map((k) => [k.id, k])), [keyPoints]);
  const kpDecision = useMemo(() => new Map<string, KeyPointDecision>((evidence?.keyPoints ?? []).map((k) => [k.id, k])), [evidence]);
  const claimById = useMemo(() => new Map<string, ClaimDecision>((evidence?.claims ?? []).map((c) => [c.claimId, c])), [evidence]);
  const claimsOf = useCallback((kpId: string) => (evidence?.claims ?? []).filter((c) => c.keyPointIds.includes(kpId)), [evidence]);
  const concept = (id?: string | null) => (id ? (kpById.get(id)?.concept ?? id) : "");

  // Until the feedback arrives, the judge's labels already say which group each idea belongs to.
  const understood = f ? (f.understood ?? []) : keyPoints.filter((k) => k.label === "correct").map((k) => ({ keyPointId: k.id, evidence: "" }));
  const missed = f
    ? (f.missed ?? [])
    : keyPoints.filter((k) => k.label === "absent" || k.label === "vague").map((k) => ({ keyPointId: k.id, whatToAdd: "" }));
  const misread = f?.misunderstood ?? [];
  const steps = f?.couldBeBetter ?? [];

  // Where each key idea is discussed below, so the map can jump to it.
  const targetOf = (kpId: string) => {
    if (understood.some((u) => u.keyPointId === kpId)) return `u-${kpId}`;
    if (missed.some((m) => m.keyPointId === kpId)) return `x-${kpId}`;
    const i = misread.findIndex((m) => claimById.get(m.claimId)?.keyPointIds.includes(kpId));
    if (i >= 0) return `m-${i}`;
    return kpById.get(kpId)?.label === "correct" ? "g-understood" : "g-missed";
  };

  const jump = (target: string) => {
    const el = document.getElementById(target);
    if (!el) return;
    el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "center" });
    el.focus({ preventScroll: true });
    setOpen((s) => new Set(s).add(target));
    setFlash(target);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1400);
  };
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // The single strongest piece of evidence: a supported claim that explains how or why, with its source quote.
  const strongest = useMemo(() => {
    const claims = evidence?.claims ?? [];
    const pick =
      claims.find((c) => c.classification === "UNDERSTOOD" && c.explainsHowOrWhy && c.evidence.length) ??
      claims.find((c) => c.classification === "UNDERSTOOD" && c.evidence.length);
    return pick ? { claim: pick.text, quote: pick.evidence[0].quote, sentence: pick.evidence[0].sentence } : null;
  }, [evidence]);

  const nCorrect = keyPoints.filter((k) => k.label === "correct").length;
  const nPartly = keyPoints.filter((k) => k.label === "vague").length;
  const toWorkOn = misread.length + missed.length;
  const streaming = !record;

  return (
    <div className="mt-12">
      {/* ── The headline insight ── */}
      <section aria-label="Explanation">
        <p className="display max-w-[30ch] text-[clamp(1.5rem,3.2vw,2.125rem)] leading-[1.18] tracking-[-0.02em]">{f?.oneLineSummary ?? fallbackSummary}</p>
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-ink-3">
          {streaming ? (
            <>
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" style={{ animation: "ticker 1.2s var(--ease-in-out) infinite" }} />
              Feedback is being written…
            </>
          ) : (
            <>
              <Icon name={record.source === "llm" ? "check" : "info"} size={13} className="mt-px shrink-0 text-teal" />
              <span className="max-w-[60ch]" title={record.source === "llm" ? undefined : (record.fallbackReason ?? undefined)}>
                {record.source === "llm"
                  ? `Written by ${record.model}, then checked: every quote is your exact words and agrees with the judge${record.dropped ? ` (${record.dropped} unsupported item${record.dropped > 1 ? "s" : ""} removed)` : ""}.`
                  : // The raw provider error stays in the tooltip; the line itself says what happened.
                    `Feedback (basic) · ${record.fallbackReason?.replace(/\s*\(.*\)/s, "") ?? "Built from the judge's results."}`}
              </span>
            </>
          )}
        </p>
      </section>

      {/* ── Key-idea map: progress at a glance, and a way in ── */}
      {keyPoints.length ? (
        <nav aria-label="Key ideas in this article" className="mt-10">
          <div className="flex items-baseline justify-between gap-4">
            <p className="eyebrow">Key ideas in this article</p>
            <p className="text-xs text-ink-3">
              <span className="num mono text-ink">{nCorrect}</span> of <span className="num mono">{keyPoints.length}</span> understood
              {nPartly ? (
                <>
                  {" "}
                  · <span className="num mono">{nPartly}</span> partly
                </>
              ) : null}
            </p>
          </div>
          <ul
            className="-mx-2.5 mt-3 grid gap-1.5 sm:[grid-template-columns:var(--cols)]"
            style={{ "--cols": keyPoints.length <= 5 ? keyPoints.map((k) => `minmax(0,${Math.max(1, k.weight)}fr)`).join(" ") : "repeat(3,minmax(0,1fr))" } as React.CSSProperties}
          >
            {keyPoints.map((k) => {
              const spec = KP[k.label] ?? KP.absent;
              return (
                <li key={k.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => jump(targetOf(k.id))}
                    aria-label={`${k.concept}: ${spec.word}. Show in feedback`}
                    className="group flex h-full w-full items-start gap-3 rounded-[12px] px-2.5 pb-3 pt-2.5 text-left transition-colors duration-200 hover:bg-paper-sunk sm:flex-col sm:gap-2.5"
                  >
                    <span
                      aria-hidden
                      className={`mt-1 h-auto w-1 shrink-0 self-stretch rounded-full transition-[opacity,transform] duration-300 group-hover:opacity-100 sm:mt-0 sm:h-1 sm:w-full sm:group-hover:scale-y-150 ${TONE_MARK[spec.tone]} ${k.label === "absent" ? "opacity-70" : ""}`}
                    />
                    <span className="min-w-0">
                      <span className={`flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.12em] ${TONE_TEXT[spec.tone]}`}>
                        <Icon name={spec.icon} size={12} />
                        {spec.word}
                      </span>
                      <span className="mt-1 line-clamp-2 block text-sm leading-snug text-ink group-hover:underline group-hover:decoration-rule-strong group-hover:underline-offset-4">
                        {k.concept}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      <div className="mt-14 space-y-16">
        {/* ── What you understood ── */}
        <Group id="g-understood" tone="ok" icon="check" title="What you understood" meta={keyPoints.length ? `${nCorrect} of ${keyPoints.length} key ideas` : undefined}>
          {understood.length ? (
            <ul className="[&>li:first-child>div]:border-t-0">
              {understood.map((u) => {
                const id = `u-${u.keyPointId}`;
                const links = understoodThread(claimsOf(u.keyPointId), kpDecision.get(u.keyPointId));
                return (
                  <Item
                    key={id}
                    id={id}
                    tone="ok"
                    icon="check"
                    title={concept(u.keyPointId)}
                    weight={kpById.get(u.keyPointId)?.weight}
                    flash={flash === id}
                    open={open.has(id)}
                    onToggle={links.length ? () => toggle(id) : undefined}
                    thread={links}
                  >
                    {u.evidence ? (
                      <p className="font-serif text-[1.0625rem] italic leading-relaxed text-ink-2">
                        <span className="voice-student">“{u.evidence}”</span>
                      </p>
                    ) : null}
                  </Item>
                );
              })}
            </ul>
          ) : (
            <p className="py-4 text-[0.9375rem] text-ink-2">
              None of the key ideas came through in full yet
              {nPartly ? `; ${nPartly} ${nPartly > 1 ? "are" : "is"} partly there` : ""}.{" "}
              {toWorkOn ? (
                <button type="button" onClick={() => jump("g-missed")} className="link text-ink">
                  See what to work on
                </button>
              ) : null}
            </p>
          )}

          {strongest && understood.length ? (
            <figure className="mt-6">
              <figcaption className="eyebrow">Your strongest evidence</figcaption>
              <div className="group mt-3 grid items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)]">
                <blockquote className="rounded-[18px] bg-lavender/15 p-5 transition-colors duration-300 group-hover:bg-lavender/20">
                  <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-3">You wrote</p>
                  <p className="mt-2 font-serif text-[1.0625rem] leading-relaxed text-ink">“{strongest.claim}”</p>
                </blockquote>
                <span aria-hidden className="flex items-center justify-center text-ink-3">
                  <Icon name="link" size={16} className="transition-transform duration-300 group-hover:scale-110 sm:rotate-0" />
                </span>
                <blockquote className="rounded-[18px] bg-aqua/15 p-5 transition-colors duration-300 group-hover:bg-aqua/25">
                  <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-3">The source · sentence {strongest.sentence + 1}</p>
                  <p className="mt-2 font-serif text-[1.0625rem] leading-relaxed text-ink">“{strongest.quote}”</p>
                </blockquote>
              </div>
            </figure>
          ) : null}
        </Group>

        {/* ── What you missed or misread ── */}
        {toWorkOn ? (
          <Group id="g-missed" tone="bad" icon="missed" title="What you missed or misread" meta={`${toWorkOn} to work on`}>
            <ul className="[&>li:first-child>div]:border-t-0">
              {misread.map((m, i) => {
                const id = `m-${i}`;
                const claim = claimById.get(m.claimId);
                const kp = claim?.keyPointIds[0];
                const sources = (claim?.evidence ?? []).map<Link>((e) => ({ voice: "source", label: `The source · sentence ${e.sentence + 1}`, text: e.quote, quote: true }));
                const judge: Link[] = claim ? [{ voice: "judge", label: `Judge · ${ruleOf(claim.rule)}`, text: plain(claim.note || claim.reasons[0] || "") }] : [];
                return (
                  <Item
                    key={id}
                    id={id}
                    tone="bad"
                    icon="cross"
                    title={kp ? concept(kp) : "A claim the source does not support"}
                    weight={kp ? kpById.get(kp)?.weight : undefined}
                    flash={flash === id}
                    open={open.has(id)}
                    onToggle={sources.length || judge.length ? () => toggle(id) : undefined}
                    thread={[...sources, ...judge].filter((l) => l.text)}
                  >
                    <Thread
                      links={[
                        { voice: "student", label: "You wrote", text: m.studentQuote, quote: true },
                        { voice: "bad", label: "Why it’s off", text: m.why },
                        { voice: "ok", label: "The source says", text: m.correctVersion },
                      ]}
                    />
                  </Item>
                );
              })}
              {missed.map((m) => {
                const id = `x-${m.keyPointId}`;
                const k = kpById.get(m.keyPointId);
                const spec = KP[k?.label ?? "absent"] ?? KP.absent;
                const links = missedThread(claimsOf(m.keyPointId), kpDecision.get(m.keyPointId));
                return (
                  <Item
                    key={id}
                    id={id}
                    tone={spec.tone}
                    icon={spec.icon}
                    status={k?.label === "vague" ? spec.word : undefined}
                    title={concept(m.keyPointId)}
                    weight={k?.weight}
                    flash={flash === id}
                    open={open.has(id)}
                    onToggle={links.length ? () => toggle(id) : undefined}
                    thread={links}
                  >
                    {m.whatToAdd ? <p className="text-[0.9375rem] leading-relaxed text-ink-2">{m.whatToAdd}</p> : null}
                  </Item>
                );
              })}
            </ul>
          </Group>
        ) : null}

        {/* ── What to improve ── */}
        {steps.length || f?.nextStep ? (
          <Group id="g-improve" tone="signal" icon="pen" title="What to improve" meta={steps.length ? `${steps.length} step${steps.length > 1 ? "s" : ""}` : undefined}>
            {steps.length ? (
              <ol className="pt-5">
                {steps.map((c, i) => (
                  <li key={i} className="group relative grid animate-fade grid-cols-[2rem_minmax(0,1fr)] gap-x-4 pb-7 last:pb-0">
                    {i < steps.length - 1 ? <span aria-hidden className="absolute bottom-0 left-4 top-9 w-px bg-rule" /> : null}
                    <span className="num mono grid h-8 w-8 place-items-center rounded-full border border-rule-strong text-sm text-ink-2 transition-colors duration-200 group-hover:border-teal group-hover:bg-mint group-hover:text-ink">
                      {i + 1}
                    </span>
                    <div className="min-w-0 pt-1">
                      <p className="text-[0.9375rem] font-medium leading-snug text-ink">{c.action}</p>
                      {c.exampleSentence ? (
                        <p className="mt-2.5 border-l-2 border-aqua/70 pl-3 text-sm leading-relaxed text-ink-3 transition-colors duration-200 group-hover:text-ink-2">
                          <span className="mr-1.5 text-2xs font-semibold uppercase tracking-[0.12em]">e.g.</span>
                          <span className="font-serif text-[0.9375rem] italic">“{c.exampleSentence}”</span>
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}
            {f?.nextStep ? (
              <div className="mt-8 flex flex-col gap-4 rounded-[18px] bg-mint px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="eyebrow text-teal">Next step</p>
                  <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink">{f.nextStep}</p>
                </div>
                {retryHref ? (
                  <ButtonLink href={retryHref} variant="secondary" size="sm" iconAfter="arrow" className="shrink-0 self-start sm:self-center">
                    Retry this article
                  </ButtonLink>
                ) : null}
              </div>
            ) : null}
          </Group>
        ) : null}
      </div>
    </div>
  );
}

/** Supported claims about an understood idea, each with the source sentence it matched, then the judge's rule. */
function understoodThread(claims: ClaimDecision[], d: KeyPointDecision | undefined): Link[] {
  const links: Link[] = [];
  for (const c of claims.filter((x) => x.classification === "UNDERSTOOD" || x.classification === "PARTIALLY_UNDERSTOOD").slice(0, 2)) {
    links.push({ voice: "student", label: "Your claim", text: c.text, quote: true });
    const e = c.evidence[0];
    if (e) links.push({ voice: "source", label: `Matched to the source · sentence ${e.sentence + 1}`, text: e.quote, quote: true });
  }
  if (d) links.push({ voice: "judge", label: `Judge · ${ruleOf(d.rule)}`, text: plain(d.reason) });
  return links.filter((l) => l.text);
}

/** Why an idea counts as missed: the nearest attempt (if any) and the judge's reason. */
function missedThread(claims: ClaimDecision[], d: KeyPointDecision | undefined): Link[] {
  const links: Link[] = [];
  const near = claims.find((c) => c.evidence.length);
  if (d?.studentQuote) links.push({ voice: "student", label: "Closest you came", text: d.studentQuote, quote: true });
  else if (near) links.push({ voice: "student", label: "Closest you came", text: near.text, quote: true });
  if (near?.evidence[0]) links.push({ voice: "source", label: `The source · sentence ${near.evidence[0].sentence + 1}`, text: near.evidence[0].quote, quote: true });
  if (d) links.push({ voice: "judge", label: `Judge · ${ruleOf(d.rule)}`, text: plain(d.reason) });
  return links.filter((l) => l.text);
}

const ruleOf = (rule: string) => rule.split(/[;\s]/)[0] || rule;
/** The judge writes "c2 is supported by s2"; say it in the student's terms, with 1-based sentence numbers. */
const plain = (reason: string) => reason.replace(/\bs(\d+)\b/g, (_, n: string) => `sentence ${Number(n) + 1}`).replace(/\bc\d+\b/g, "your claim");

function Group({ id, tone, icon, title, meta, children }: { id: string; tone: Tone; icon: IconName; title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section id={id} tabIndex={-1} aria-labelledby={`${id}-h`} className="scroll-mt-24 outline-none">
      <header className="flex items-center justify-between gap-4 border-b border-rule-strong pb-3">
        <h2 id={`${id}-h`} className="flex items-center gap-3 font-serif text-[1.375rem] leading-tight text-ink">
          <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${TONE_WASH[tone]} ${TONE_TEXT[tone]}`}>
            <Icon name={icon} size={15} />
          </span>
          {title}
        </h2>
        {meta ? <span className="shrink-0 text-xs text-ink-3">{meta}</span> : null}
      </header>
      {children}
    </section>
  );
}

function Item({
  id,
  tone,
  icon,
  title,
  status,
  weight,
  flash,
  open,
  onToggle,
  thread,
  children,
}: {
  id: string;
  tone: Tone;
  icon: IconName;
  title: string;
  status?: string;
  weight?: number;
  flash: boolean;
  open: boolean;
  onToggle?: () => void;
  thread: Link[];
  children?: React.ReactNode;
}) {
  return (
    <li
      id={id}
      tabIndex={-1}
      className={`-mx-3 animate-fade scroll-mt-24 rounded-[16px] px-3 outline-none transition-colors duration-700 ${flash ? "bg-mint" : "bg-transparent"}`}
    >
      <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3 border-t border-rule py-5">
        <Icon name={icon} size={15} className={`mt-1 ${TONE_TEXT[tone]}`} />
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-4">
            <p className="font-medium leading-snug text-ink">
              {title}
              {status ? <span className={`ml-2 text-xs font-medium ${TONE_TEXT[tone]}`}>· {status}</span> : null}
            </p>
            {weight ? <Weight value={weight} /> : null}
          </div>
          {children ? <div className="mt-2">{children}</div> : null}
          {onToggle ? (
            <>
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                aria-controls={`${id}-ev`}
                className="group mt-3 inline-flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-2 text-xs font-medium text-teal transition-colors duration-200 hover:bg-mint"
              >
                <Icon name="nodes" size={12} />
                {open ? "Hide evidence" : "Show evidence"}
                <Icon name="down" size={12} className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence initial={false}>
                {open ? (
                  <motion.div
                    id={`${id}-ev`}
                    key="ev"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3">
                      <Thread links={thread} />
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** A vertical source → claim → decision thread; each node is coloured by whose voice it is. */
function Thread({ links }: { links: Link[] }) {
  return (
    <ol className="relative space-y-3.5">
      {links.length > 1 ? <span aria-hidden className="thread-v absolute bottom-2 left-[3px] top-2 w-px opacity-60" /> : null}
      {links.map((l, i) => (
        <li key={i} className="relative grid grid-cols-[7px_minmax(0,1fr)] gap-x-3">
          <span aria-hidden className={`relative mt-[5px] h-[7px] w-[7px] rounded-full ring-2 ring-paper ${NODE[l.voice]}`} />
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-3">{l.label}</p>
            {l.quote ? (
              <p className="mt-1 font-serif text-[1rem] italic leading-relaxed text-ink">
                <span className={l.voice === "student" ? "voice-student" : ""}>“{l.text}”</span>
              </p>
            ) : (
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{l.text}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** How much the idea counts in the rubric (1–3). */
function Weight({ value }: { value: number }) {
  const max = Math.max(3, value);
  return (
    <span role="img" aria-label={`Weight ${value} of ${max}`} title="How much this idea counts" className="flex shrink-0 items-end gap-[3px]">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`w-[3px] rounded-full ${i < value ? "bg-ink-3" : "bg-rule-strong"}`} style={{ height: 6 + i * 3 }} />
      ))}
    </span>
  );
}
