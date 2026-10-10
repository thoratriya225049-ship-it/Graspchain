import {
  EVIDENCE_RULES,
  INTEGRITY_LIMITS,
  LOW_POINTS_CAP,
  OUTCOME_COPY,
  SEVERITY_POINTS,
  STATUS_THRESHOLDS,
  type EvidenceDecision,
  type IntegrityAssessment,
  type IntegrityStatus,
  findingTitle,
  type Severity,
} from "@graspchain/shared";
import { Notice } from "@/components/ui/Bits";
import { TONE_TEXT, Tag, type Tone } from "@/components/ui/Status";
import type { TimelineEvent } from "@/lib/types";

export const STATUS_TONE: Record<IntegrityStatus, Tone> = {
  NORMAL: "ok",
  WARNING: "none",
  SUSPICIOUS: "warn",
  INTEGRITY_RISK: "bad",
  COMPROMISED: "bad",
};
const SEVERITY_TONE: Record<Severity, Tone> = { INFO: "none", LOW: "none", MEDIUM: "warn", HIGH: "bad", CRITICAL: "bad" };
export const STATUS_WORD: Record<IntegrityStatus, string> = {
  NORMAL: "Normal",
  WARNING: "Warning",
  SUSPICIOUS: "Suspicious",
  INTEGRITY_RISK: "Integrity risk",
  COMPROMISED: "Compromised",
};

/** Above the score, when the conditions affect whether the score counts. */
export function IntegrityBanner({ integrity }: { integrity: IntegrityAssessment | null | undefined }) {
  if (!integrity || integrity.outcome === "CERTIFIED") return null;
  const copy = OUTCOME_COPY[integrity.outcome];
  const tone: Tone = integrity.outcome === "NOT_CERTIFIED" ? "bad" : "warn";
  return (
    <div className="mt-8">
      <Notice tone={tone} title={`Integrity: ${STATUS_WORD[integrity.status]} · ${copy.title}`}>
        {copy.body}
        {integrity.review ? (
          <>
            {" "}
            A teacher reviewed this record ({integrity.review.decision === "CLEARED" ? "cleared" : "upheld"}): “{integrity.review.reason}”
          </>
        ) : null}
      </Notice>
    </div>
  );
}

export function IntegrityTag({ integrity }: { integrity: IntegrityAssessment | null | undefined }) {
  if (!integrity) return null;
  return (
    <Tag tone={STATUS_TONE[integrity.status]} icon={integrity.status === "NORMAL" ? "check" : "alert"}>
      Integrity: {STATUS_WORD[integrity.status]}
    </Tag>
  );
}

/** Time into the session (+m:ss). Deterministic, so server and browser render the same text. */
const since = (ms: number, t0: number) => {
  const s = Math.max(0, Math.round((ms - t0) / 1000));
  return `+${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** What the conditions were, how they were rated, and what could not be observed. */
export function IntegrityPanel({ integrity, events }: { integrity: IntegrityAssessment | null | undefined; events: TimelineEvent[] }) {
  if (!integrity) return null;
  const weighed = integrity.findings.filter((f) => f.severity !== "INFO");
  return (
    <section aria-labelledby="conditions" className="mt-16 border-t border-ink pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 id="conditions" className="eyebrow text-ink">
          Assessment conditions
        </h2>
        <p className="text-xs text-ink-3">Judged separately from comprehension · never deducted from the score</p>
      </div>
      <div className="mt-5 grid gap-10 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <p className={`font-serif text-2xl ${TONE_TEXT[STATUS_TONE[integrity.status]]}`}>{STATUS_WORD[integrity.status]}</p>
          <p className="mt-1 text-sm text-ink-2">
            {OUTCOME_COPY[integrity.outcome].title} · <span className="num mono">{integrity.points}</span> integrity points
          </p>
          <p className="mt-3 text-sm text-ink-2">{STATUS_THRESHOLDS.find((t) => t.status === integrity.status)?.meaning}</p>
          {integrity.writing.wordsPerMinute !== null ? (
            <p className="mt-3 text-xs text-ink-3">
              Writing time {Math.round((integrity.writing.ms ?? 0) / 1000)} s · {integrity.writing.wordsPerMinute} words/min
            </p>
          ) : null}
          {!integrity.monitored && !integrity.seeded ? (
            <p className="mt-3 text-xs text-bad">The monitored assessment page never reported for this attempt.</p>
          ) : null}
        </div>
        <div>
          {weighed.length ? (
            <ul className="divide-y divide-rule border-y border-rule">
              {weighed.map((f, i) => (
                <li key={i} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-baseline gap-3 py-2.5 text-sm">
                  <span className={`mono text-xs ${TONE_TEXT[SEVERITY_TONE[f.severity]]}`}>{f.severity}</span>
                  <span>
                    <span className="font-medium">{findingTitle(f.code)}</span>
                    {f.count > 1 ? <span className="text-ink-3"> ×{f.count}</span> : null}
                    <span className="block text-ink-2">{f.explanation}</span>
                  </span>
                  <span className="num mono text-xs text-ink-3">+{f.points}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">No events that carry weight were recorded.</p>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-4 text-sm md:grid-cols-3">
        <details className="border-t border-rule pt-3">
          <summary className="cursor-pointer text-ink-2">How integrity is rated</summary>
          <p className="mt-2 text-xs text-ink-3">
            Each event has a published severity:{" "}
            {Object.entries(SEVERITY_POINTS)
              .map(([s, p]) => `${s} ${p}`)
              .join(" · ")}{" "}
            points. Low-severity points are capped at {LOW_POINTS_CAP}, so accidents alone never pass “Suspicious”. Any critical event means “Compromised”.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-ink-3">
            {STATUS_THRESHOLDS.map((t) => (
              <li key={t.status}>
                <span className="font-medium text-ink-2">
                  {STATUS_WORD[t.status]} (≥ {t.from})
                </span>{" "}
                — {t.meaning}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-3">Rules {integrity.rulesVersion}</p>
        </details>
        <details className="border-t border-rule pt-3">
          <summary className="cursor-pointer text-ink-2">All recorded events ({events.length})</summary>
          {events.length ? (
            <ol className="mt-2 space-y-1 text-xs">
              {events.map((e, i) => (
                <li key={i} className="grid grid-cols-[4.5rem_3.5rem_minmax(0,1fr)] gap-2">
                  <span className="mono text-ink-3">{since(e.at, events[0].at)}</span>
                  <span className={`mono ${TONE_TEXT[SEVERITY_TONE[e.severity]]}`}>{e.severity}</span>
                  <span>
                    {findingTitle(e.type)}{" "}
                    <span className="text-ink-3">
                      · {e.phase} · {e.source === "server" ? "seen by the server" : "reported by the page"}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-xs text-ink-3">None.</p>
          )}
        </details>
        <details className="border-t border-rule pt-3">
          <summary className="cursor-pointer text-ink-2">What a browser cannot see</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-ink-3">
            {INTEGRITY_LIMITS.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}

const CLASS_TONE: Record<string, Tone> = {
  UNDERSTOOD: "ok",
  PARTIALLY_UNDERSTOOD: "warn",
  MISUNDERSTOOD: "bad",
  MISSED: "none",
  UNSUPPORTED: "none",
};
const CLASS_WORD: Record<string, string> = {
  UNDERSTOOD: "Understood",
  PARTIALLY_UNDERSTOOD: "Partly understood",
  MISUNDERSTOOD: "Misunderstood",
  MISSED: "Missed",
  UNSUPPORTED: "Unsupported",
};

/** The evidence the decision engine used, and the rule that produced each classification. */
export function EvidenceTrail({ evidence }: { evidence: EvidenceDecision | null | undefined }) {
  if (!evidence) return null;
  return (
    <section aria-labelledby="evidence" className="mt-16 border-t border-ink pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 id="evidence" className="eyebrow text-ink">
          Evidence trail
        </h2>
        <p className="text-xs text-ink-3">
          {evidence.extractor} extracted the evidence · {evidence.version} judged it · checked against the article only
        </p>
      </div>
      <ul className="mt-5 divide-y divide-rule border-y border-rule">
        {evidence.keyPoints.map((k) => (
          <li key={k.id} className="grid gap-2 py-3 text-sm md:grid-cols-[12rem_minmax(0,1fr)]">
            <span>
              <span className={`font-medium ${TONE_TEXT[CLASS_TONE[k.classification]]}`}>{CLASS_WORD[k.classification]}</span>
              <span className="block text-ink-3">{k.concept}</span>
            </span>
            <span className="text-ink-2">
              {k.reason} <span className="mono text-xs text-ink-3">({k.rule})</span>
              {k.studentQuote ? <span className="mt-1 block text-ink-3">You wrote: “{k.studentQuote}”</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-ink-2">Every claim and its article evidence ({evidence.claims.length})</summary>
        <ul className="mt-3 space-y-3">
          {evidence.claims.map((c) => (
            <li key={c.claimId} className="border-l-2 border-rule pl-3">
              <p>
                <span className="mono text-xs text-ink-3">{c.claimId}</span>{" "}
                <span className={`font-medium ${TONE_TEXT[CLASS_TONE[c.classification]]}`}>{CLASS_WORD[c.classification]}</span>{" "}
                <span className="text-ink-3">· {c.relation.replace(/_/g, " ").toLowerCase()}</span>
              </p>
              <p className="mt-0.5 text-ink-2">“{c.text}”</p>
              {c.evidence.map((e) => (
                <p key={e.sentence} className="mt-0.5 text-xs text-ink-3">
                  Article s{e.sentence}: “{e.quote}”
                </p>
              ))}
              {c.reasons.map((r) => (
                <p key={r} className="mt-0.5 text-xs text-warn">
                  {r}
                </p>
              ))}
            </li>
          ))}
        </ul>
        {evidence.validation.rejected.length ? (
          <p className="mt-3 text-xs text-ink-3">
            {evidence.validation.rejected.length} extracted item(s) failed validation and were discarded before any rule ran.
          </p>
        ) : null}
      </details>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-ink-2">The decision rules</summary>
        <ul className="mt-2 space-y-1 text-xs text-ink-3">
          {EVIDENCE_RULES.map((r) => (
            <li key={r.id}>
              <span className="mono">{r.id}</span> {r.text}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
