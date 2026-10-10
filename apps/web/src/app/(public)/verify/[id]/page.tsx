import type { Metadata } from "next";
import Link from "next/link";
import { STATUS_COPY, formatDateTime } from "@graspchain/shared";
import { Shell } from "@/components/shell/Shell";
import { Hash } from "@/components/ui/Bits";
import { Icon } from "@/components/ui/Icon";
import { CHECK, Mark, TONE_TEXT, type Tone } from "@/components/ui/Status";
import { ApiError, api, getConfig, getMe } from "@/lib/api";
import { verifierLink } from "@/lib/links";
import type { Verification } from "@/lib/types";

export const metadata: Metadata = { title: "Verify" };

const STATUS_TONE: Record<string, Tone> = { verified: "ok", superseded: "ok", pending: "warn", not_found: "warn", tampered: "bad", unavailable: "none" };
const STATUS_ICON = { verified: "check", superseded: "check", pending: "vague", not_found: "vague", tampered: "cross", unavailable: "alert" } as const;

/** S9: our server's copy of a receipt, checked against AssessmentRegistry (V1–V4). Public; no PII. */
export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [me, config] = await Promise.all([getMe().catch(() => null), getConfig()]);
  let v: Verification | null = null;
  let error: string | null = null;
  try {
    v = await api<Verification>(`/api/verify/${id}`);
  } catch (e) {
    error = e instanceof ApiError && e.status === 404 ? "No receipt with this assessment id is held by this deployment." : (e as Error).message;
  }

  return (
    <Shell me={me}>
      <div className="frame pt-10 md:pt-14">
        <p className="eyebrow">Verification · server copy</p>
        {!v ? (
          <div className="mt-6">
            <h1 className="font-serif text-2xl">Nothing to verify</h1>
            <p className="mt-3 text-ink-2">{error}</p>
            <Link href="/verify" className="link mt-6 inline-block">
              Look up another id
            </Link>
          </div>
        ) : (
          <VerifyBody
            v={v}
            verifier={config ? verifierLink(config.verifierUrl, config.publicWebUrl, v.assessmentId) : null}
            chainName={config?.chain.name ?? `Chain ${v.chain.chainId}`}
          />
        )}
      </div>
    </Shell>
  );
}

function VerifyBody({ v, verifier, chainName }: { v: Verification; verifier: string | null; chainName: string }) {
  const tone = STATUS_TONE[v.status];
  const copy = STATUS_COPY[v.status];
  const r = v.receipt;
  const fields: [string, React.ReactNode][] = [
    ["Assessment id", <Hash key="a" value={r.assessmentId} label="assessment id" />],
    [
      "Article",
      <span key="b" className="mono">
        {r.articleId} · attempt {r.attemptNo}
      </span>,
    ],
    [
      "Final score",
      <span key="c" className="num font-serif text-lg">
        {r.assessment.finalScore.toFixed(1)}
      </span>,
    ],
    [
      "Judge · LLM",
      <span key="d" className="mono text-sm">
        {r.assessment.models.jev} · {r.assessment.models.llm}
      </span>,
    ],
    [
      "Rubric",
      <span key="e" className="mono text-sm">
        v{r.assessment.rubricVersion} · {r.assessment.segmentation}
      </span>,
    ],
    ["Student ref", <Hash key="f" value={r.studentRef} short label="student reference" />],
    ["Answer hash", <Hash key="g" value={r.answerHash} short label="answer hash" />],
    ["Article hash", <Hash key="h" value={r.articleHash} short label="article hash" />],
    ["Created", <span key="i">{formatDateTime(r.createdAt)}</span>],
  ];
  return (
    <>
      <header className="mt-6 grid gap-6 border-b border-ink pb-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <h1 className={`flex items-center gap-3 font-serif text-2xl md:text-3xl ${TONE_TEXT[tone]}`}>
            <Icon name={STATUS_ICON[v.status]} size={34} />
            {copy.title}
          </h1>
          <p className="mt-3 max-w-2xl text-md text-ink-2">{copy.body}</p>
          {v.tampered ? (
            <p className="mt-3 text-sm text-bad">
              The server copy was altered by the admin Tamper tool ({v.tampered.field}). The student&rsquo;s downloaded receipt is unaffected and still
              verifies.
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 text-sm md:items-end">
          {verifier ? (
            <a href={verifier} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium">
              Check independently, without Graspchain <Icon name="external" size={13} />
            </a>
          ) : null}
          <a href={`/api/receipts/${v.assessmentId}`} className="link text-ink-3">
            Server copy (JSON)
          </a>
        </div>
      </header>

      <div className="grid gap-14 pt-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-20">
        <section aria-labelledby="checks">
          <h2 id="checks" className="eyebrow">
            Checks against {chainName}
          </h2>
          <ol className="mt-4 border-t border-ink">
            {v.checks.map((c) => (
              <li key={c.id} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-3 border-b border-rule py-5">
                <span className="mono pt-0.5 text-sm text-ink-3">{c.id}</span>
                <div>
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h3 className="text-[0.9375rem] font-semibold">{c.title}</h3>
                    <Mark spec={CHECK[c.state]} />
                  </div>
                  <p className="mt-1 text-sm text-ink-3">{c.meaning}</p>
                  <p className="mt-2 text-sm text-ink-2">{c.detail}</p>
                </div>
              </li>
            ))}
          </ol>

          <h2 className="eyebrow mt-12">Hashes</h2>
          <dl className="mt-4 grid gap-4 border-t border-ink pt-4 text-sm">
            <div>
              <dt className="text-ink-3">Recomputed from this copy (JCS + SHA-256)</dt>
              <dd className="mt-1">
                <Hash value={v.computedHash} label="recomputed hash" />
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">On-chain recordHash</dt>
              <dd className="mt-1">
                {v.chain.record ? (
                  <Hash value={v.chain.record.recordHash.replace(/^0x/, "")} label="on-chain hash" />
                ) : (
                  <span className="text-ink-3">no record yet</span>
                )}
              </dd>
            </div>
            {v.chain.record ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-ink-3">On-chain score</dt>
                  <dd className="num mono mt-1">{(v.chain.record.scoreX10 / 10).toFixed(1)}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">Block time</dt>
                  <dd className="mt-1">{formatDateTime(v.chain.record.timestamp * 1000)}</dd>
                </div>
              </div>
            ) : null}
            {v.tx ? (
              <div>
                <dt className="text-ink-3">Transaction</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-3">
                  <Hash value={v.tx.hash} short label="transaction" />
                  <span className="text-ink-3">
                    block {v.tx.blockNumber} · {v.tx.gasUsed?.toLocaleString()} gas
                  </span>
                  {v.tx.url ? (
                    <a className="link" href={v.tx.url} target="_blank" rel="noreferrer">
                      Explorer
                    </a>
                  ) : null}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-ink-3">Registry</dt>
              <dd className="mt-1">{v.chain.registry ? <Hash value={v.chain.registry} label="registry address" /> : "not configured"}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="doc">
          <h2 id="doc" className="eyebrow">
            The receipt
          </h2>
          <div className="mt-4 border border-ink bg-paper-raised p-6 shadow-doc">
            <p className="mono text-xs text-ink-3">{r.schema}</p>
            <dl className="mt-4">
              {fields.map(([k, val]) => (
                <div key={k} className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-baseline gap-3 border-b border-rule py-2.5 text-sm last:border-0">
                  <dt className="text-ink-3">{k}</dt>
                  <dd className="min-w-0">{val}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 border-t border-ink pt-4 text-sm">
              <p className="eyebrow">Fairness on record</p>
              <p className="mt-2 text-ink-2">
                {r.fairness.admissionMode === "fair" ? "Windowed random entry" : "Arrival-order entry"}
                {r.fairness.admissionWindowId ? <span className="mono"> · {r.fairness.admissionWindowId}</span> : null} ·{" "}
                {r.fairness.clockMode === "fair" ? "fair clock" : "server clock"} · {r.fairness.readSecondsGranted} s granted · +
                {(r.fairness.latencyCompMs / 1000).toFixed(1)} s compensated
              </p>
            </div>
            {r.assessment.review ? (
              <div className="mt-5 border-t border-ink pt-4 text-sm">
                <p className="eyebrow text-signal-ink">Teacher correction</p>
                <p className="mt-2 text-ink-2">
                  {r.assessment.review.previousScore.toFixed(1)} → {r.assessment.finalScore.toFixed(1)} · “{r.assessment.review.reason}”
                </p>
              </div>
            ) : null}
          </div>

          {v.lineage.length > 1 ? (
            <div className="mt-10">
              <h2 className="eyebrow">Versions of this assessment</h2>
              <ol className="mt-4 border-l border-ink pl-5">
                {v.lineage.map((l, i) => (
                  <li key={l.assessmentId} className="relative pb-5 last:pb-0">
                    <span
                      className={`absolute -left-[25px] top-1.5 h-2 w-2 rounded-full ${l.assessmentId === v.assessmentId ? "bg-signal" : "bg-ink"}`}
                      aria-hidden
                    />
                    <p className="text-sm">
                      <span className="font-medium">{i === 0 ? "Original" : `Correction ${i}`}</span> · <span className="num">{l.finalScore?.toFixed(1)}</span>{" "}
                      ·{" "}
                      <Link href={`/verify/${l.assessmentId}`} className="mono link">
                        {l.assessmentId.slice(0, 8)}
                      </Link>
                      {l.assessmentId === v.assessmentId ? <span className="text-ink-3"> · this record</span> : null}
                    </p>
                    {l.review ? <p className="mt-1 text-xs text-ink-3">“{l.review.reason}”</p> : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
