import type { Metadata } from "next";
import Link from "next/link";
import { STATUS_COPY, formatDateTime } from "@graspchain/shared";
import { ReceiptSlip } from "@/components/assessment/ReceiptSlip";
import { CurvedSeal } from "@/components/fx/CurvedSeal";
import { Shell } from "@/components/shell/Shell";
import { Hash } from "@/components/ui/Bits";
import { Icon } from "@/components/ui/Icon";
import { CHECK, Mark, type Tone } from "@/components/ui/Status";
import { ApiError, api, getConfig, getMe } from "@/lib/api";
import { verifierLink } from "@/lib/links";
import type { Verification } from "@/lib/types";

export const metadata: Metadata = { title: "Verify" };

const STATUS_TONE: Record<string, Tone> = { verified: "ok", superseded: "ok", pending: "warn", not_found: "warn", tampered: "bad", unavailable: "warn" };

/** S9: our server's copy of a receipt, checked against AssessmentRegistry (V1–V4). Public; no PII. */
export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [me, config] = await Promise.all([getMe().catch(() => null), getConfig()]);
  let v: Verification | null = null;
  let error: string | null = null;
  try {
    v = await api<Verification>(`/api/verify/${id}`);
  } catch (e) {
    error = e instanceof ApiError && e.status === 404 ? "This deployment holds no receipt with that assessment ID." : (e as Error).message;
  }

  if (!v)
    return (
      <Shell me={me} bare>
        <section className="on-abyss">
          <div className="frame py-20">
            <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-aqua">Verification</p>
            <h1 className="display mt-4 text-[clamp(2rem,4vw,3rem)] text-on-dark">Nothing to verify</h1>
            <p className="mt-3 max-w-lg text-on-dark-2">{error}</p>
            <Link href="/verify" className="mt-8 inline-flex items-center gap-1 font-medium text-aqua underline decoration-aqua/40 underline-offset-4">
              Check another receipt <Icon name="arrow" size={14} />
            </Link>
          </div>
        </section>
      </Shell>
    );

  return (
    <Shell me={me}>
      <VerifyBody
        v={v}
        verifier={config ? verifierLink(config.verifierUrl, config.publicWebUrl, v.assessmentId) : null}
        chainName={config?.chain.name ?? `Chain ${v.chain.chainId}`}
      />
    </Shell>
  );
}

function VerifyBody({ v, verifier, chainName }: { v: Verification; verifier: string | null; chainName: string }) {
  const tone = STATUS_TONE[v.status];
  const copy = STATUS_COPY[v.status];
  const r = v.receipt;
  const ok = tone === "ok";
  const integrity = r.assessment.integrity
    ? `${r.assessment.integrity.status.replace(/_/g, " ").toLowerCase()} · ${r.assessment.integrity.outcome.replace(/_/g, " ").toLowerCase()} · ${r.assessment.integrity.rulesVersion}${r.assessment.review?.integrityDecision ? ` · teacher ${r.assessment.review.integrityDecision.toLowerCase()}` : ""}`
    : "not recorded (receipt predates integrity monitoring)";
  return (
    <>
      <section className="on-abyss">
        <div className="frame flex flex-col gap-8 py-14 md:flex-row md:items-center md:justify-between md:py-16">
          <div className="flex items-start gap-6">
            {ok ? (
              <CurvedSeal size={120} spin surface="dark" label={copy.title} />
            ) : (
              <span
                className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full ${tone === "bad" ? "bg-bad-mark/20 text-bad-glow" : "bg-warn-mark/15 text-warn"}`}
              >
                <Icon name={tone === "bad" ? "cross" : "alert"} size={28} />
              </span>
            )}
            <div>
              <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-aqua">Verification · Graspchain&rsquo;s copy</p>
              <h1 className={`display mt-3 text-[clamp(2rem,4.5vw,3.25rem)] ${ok ? "text-ok-glow" : tone === "bad" ? "text-bad-glow" : "text-warn"}`}>
                {copy.title}
              </h1>
              <p className="mt-2 max-w-xl text-on-dark-2">{copy.body}</p>
              {v.tampered ? (
                <p className="mt-3 max-w-xl text-sm text-bad-glow">
                  The server copy was altered by the admin tamper tool ({v.tampered.field}). The student&rsquo;s downloaded receipt is unaffected and still
                  verifies.
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-3 text-sm md:items-end">
            {verifier ? (
              <a
                href={verifier}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-[14px] bg-teal px-5 font-medium text-white no-underline hover:bg-[#0e5f75]"
              >
                Check independently, without Graspchain <Icon name="external" size={13} />
              </a>
            ) : null}
            <a href={`/api/receipts/${v.assessmentId}`} className="text-on-dark-2 underline decoration-white/25 underline-offset-4 hover:text-on-dark">
              Server copy (JSON)
            </a>
          </div>
        </div>
      </section>

      <div className="frame grid gap-14 pt-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16">
        <section aria-labelledby="checks">
          <h2 id="checks" className="eyebrow">
            Checks against {chainName}
          </h2>
          <ol className="mt-4 space-y-2">
            {v.checks.map((c) => (
              <li key={c.id} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-3 rounded-[16px] bg-paper-raised p-4 ring-1 ring-rule">
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
          <dl className="mt-4 grid gap-4 text-sm">
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
          <ReceiptSlip
            className="mt-4"
            assessmentId={r.assessmentId}
            hash={v.computedHash}
            state={{ tone, label: ok ? "Matches the chain" : copy.title }}
            rows={[
              { k: "Article", v: `${r.articleId} · attempt ${r.attemptNo}` },
              { k: "Score", v: r.assessment.finalScore.toFixed(1) },
              { k: "Integrity", v: integrity },
              { k: "Judge · LLM", v: `${r.assessment.models.jev} · ${r.assessment.models.llm}` },
              { k: "Rubric", v: `v${r.assessment.rubricVersion} · ${r.assessment.segmentation}` },
              { k: "Student ref", v: `${r.studentRef.slice(0, 14)}…` },
              { k: "Answer hash", v: `${r.answerHash.slice(0, 14)}…` },
              { k: "Article hash", v: `${r.articleHash.slice(0, 14)}…` },
              { k: "Created", v: formatDateTime(r.createdAt) },
              {
                k: "Fairness",
                v: `${r.fairness.admissionMode === "fair" ? "windowed random entry" : "arrival-order entry"}${r.fairness.admissionWindowId ? ` · ${r.fairness.admissionWindowId}` : ""} · ${r.fairness.clockMode === "fair" ? "fair clock" : "server clock"} · ${r.fairness.readSecondsGranted} s · +${(r.fairness.latencyCompMs / 1000).toFixed(1)} s`,
              },
              ...(r.assessment.review
                ? [
                    {
                      k: "Correction",
                      v: `${r.assessment.review.previousScore.toFixed(1)} → ${r.assessment.finalScore.toFixed(1)} · “${r.assessment.review.reason}”`,
                    },
                  ]
                : []),
            ]}
          />

          {v.lineage.length > 1 ? (
            <div className="mt-10">
              <h2 className="eyebrow">Versions of this assessment</h2>
              <ol className="relative mt-4 pl-6">
                <span aria-hidden className="absolute bottom-2 left-[5px] top-2 w-px" style={{ background: "var(--thread)" }} />
                {v.lineage.map((l, i) => (
                  <li key={l.assessmentId} className="relative pb-5 last:pb-0">
                    <span
                      className={`absolute -left-6 top-1.5 h-[11px] w-[11px] rounded-full border-2 ${l.assessmentId === v.assessmentId ? "border-teal bg-teal" : "border-teal bg-paper"}`}
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
