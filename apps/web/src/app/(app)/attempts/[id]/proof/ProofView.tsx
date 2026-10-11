"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDateTime } from "@graspchain/shared";
import { ReceiptSlip } from "@/components/assessment/ReceiptSlip";
import { ChainFlowMini } from "@/components/fx/ChainFlow";
import { CurvedSeal } from "@/components/fx/CurvedSeal";
import { JourneySteps, JourneyThread } from "@/components/fx/JourneyThread";
import { TiltCard } from "@/components/fx/TiltCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { CHAIN } from "@/components/ui/Status";
import { call } from "@/lib/http";
import { verifierLink } from "@/lib/links";
import type { Result, Role } from "@/lib/types";

/**
 * Proof: the receipt as a printed slip on Abyss — 3D tilt (a few degrees), a curved seal around
 * the Verified mark once the commitment is mined, and the hash resolving on first view.
 * Actions: copy, download (the student's own copy), verify independently.
 */
export function ProofView({
  initial,
  viewer,
  verifierUrl,
  publicWebUrl,
  explorerUrl,
  chainName,
}: {
  initial: Result;
  viewer: Role;
  verifierUrl: string;
  publicWebUrl: string;
  explorerUrl: string | null;
  chainName: string;
}) {
  const [r, setR] = useState(initial);
  const [copied, setCopied] = useState(false);
  const qr = useRef<HTMLDialogElement>(null);
  const id = r.attemptId;
  const rec = r.record;

  const refresh = useCallback(async () => {
    const res = await call<Result>(`/api/result/${id}`);
    if (res.ok) setR(res.data);
  }, [id]);
  useEffect(() => {
    if (!rec || rec.chainStatus === "mined" || rec.chainStatus === "failed") return;
    const i = window.setInterval(refresh, 3000);
    return () => window.clearInterval(i);
  }, [rec, refresh]);

  if (!rec)
    return (
      <div className="frame-narrow py-20">
        <p className="display text-3xl">No receipt yet.</p>
        <p className="mt-3 text-ink-2">The receipt is created as soon as the result is scored.</p>
        <Link href={`/attempts/${id}`} className="link mt-6 inline-block">
          Back to the result
        </Link>
      </div>
    );

  const mined = rec.chainStatus === "mined";
  const spec = CHAIN[rec.chainStatus] ?? CHAIN.queued;
  const independent = verifierLink(verifierUrl, publicWebUrl, rec.assessmentId);

  return (
    <>
      <JourneyThread stage="proof" tone="dark" />
      <section className="on-abyss relative isolate overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{ background: "radial-gradient(50% 50% at 50% 30%, rgb(18 112 138 / 0.45), transparent 70%)" }}
        />
        <div className="frame-narrow py-12 md:py-16">
          <JourneySteps stage="proof" tone="dark" className="mb-8" />
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-aqua">Proof</p>
              <h1 className="display mt-3 text-[clamp(2.25rem,5vw,3.5rem)] text-on-dark">{mined ? "Sealed on-chain." : "Being sealed…"}</h1>
              <p className="mt-2 max-w-md text-on-dark-2">
                {mined ? "Anyone can check this receipt without trusting Graspchain." : "The receipt exists; its hash is on its way into a block."}
              </p>
            </div>
            <Link href={`/attempts/${id}`} className="text-sm text-on-dark-2 underline decoration-white/25 underline-offset-4 hover:text-on-dark">
              ← Back to the result
            </Link>
          </div>

          <TiltCard max={4} className="mt-10">
            <ReceiptSlip
              assessmentId={rec.assessmentId}
              hash={rec.recordHash}
              decrypt
              state={{ tone: spec.tone, label: spec.word }}
              rows={[
                { k: "Article", v: `${r.attempt.articleId} · attempt ${r.attempt.attemptNo}` },
                { k: "Score", v: r.score ? r.score.finalScore.toFixed(1) : r.researchHidden ? "hidden (research mode)" : "—" },
                { k: "Created", v: formatDateTime(r.attempt.createdAt) },
                { k: "Chain", v: chainName },
                ...(rec.ethTx ? [{ k: "Transaction", v: `${rec.ethTx.slice(0, 18)}…${rec.blockNumber ? ` · block ${rec.blockNumber}` : ""}` }] : []),
              ]}
              seal={
                <CurvedSeal
                  size={150}
                  surface="dark"
                  tone={mined ? "ok" : "dark"}
                  spin={mined}
                  text={mined ? "VERIFIED ON-CHAIN · GRASPCHAIN · " : "AWAITING A BLOCK · GRASPCHAIN · "}
                  label={mined ? "Recorded on-chain" : "Awaiting a block"}
                >
                  {mined ? undefined : (
                    <span className="h-3 w-3 rounded-full bg-warn-mark" style={{ animation: "ticker 1.6s var(--ease-in-out) infinite" }} aria-hidden />
                  )}
                </CurvedSeal>
              }
            />
          </TiltCard>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <a
              href={independent}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-[14px] bg-teal px-5 font-medium text-white no-underline hover:bg-[#0e5f75]"
            >
              Verify independently <Icon name="external" size={13} />
            </a>
            <Button
              variant="secondary"
              icon={copied ? "check" : "copy"}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `Graspchain receipt ${rec.assessmentId}\nsha256 ${rec.recordHash}\n${publicWebUrl.replace(/\/$/, "")}/verify/${rec.assessmentId}`,
                  );
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1600);
                } catch {
                  /* clipboard blocked */
                }
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
            {viewer === "student" ? (
              <a
                href={`/api/result/${id}/receipt`}
                download
                className="inline-flex h-11 items-center gap-2 rounded-[14px] border border-aqua/70 px-5 font-medium text-aqua no-underline hover:bg-abyss-2"
              >
                <Icon name="download" /> Download
              </a>
            ) : null}
            <Button variant="quiet" icon="qr" onClick={() => qr.current?.showModal()}>
              QR code
            </Button>
            <span className="sr-only" aria-live="polite">
              {copied ? "Copied to the clipboard" : ""}
            </span>
          </div>

          <ChainFlowMini
            tone="dark"
            className="mt-10"
            current="proof"
            items={[
              { key: "source", value: <span className="mono">{r.attempt.articleId}</span> },
              { key: "claim", value: r.score?.claimSummary.count ?? "—" },
              { key: "evidence", value: r.score ? `${r.score.claimSummary.supported} supported` : "—" },
              { key: "decision", value: r.score?.band ?? "—" },
              { key: "proof", value: mined ? "mined" : rec.chainStatus },
            ]}
          />

          <dl className="mt-10 grid gap-4 border-t border-white/10 pt-6 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-on-dark-2">Check on Graspchain</dt>
              <dd className="mt-1">
                <Link href={`/verify/${rec.assessmentId}`} className="text-aqua underline decoration-aqua/40 underline-offset-4">
                  Open the verification
                </Link>
              </dd>
            </div>
            {rec.ethTx && explorerUrl ? (
              <div>
                <dt className="text-on-dark-2">Transaction</dt>
                <dd className="mt-1">
                  <a href={`${explorerUrl}/tx/${rec.ethTx}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-aqua">
                    Explorer <Icon name="external" size={12} />
                  </a>
                </dd>
              </div>
            ) : null}
            {r.lineage.length > 1 ? (
              <div className="sm:col-span-2">
                <dt className="text-on-dark-2">Versions</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {r.lineage.map((l, i) => (
                    <span key={l.assessmentId} className="inline-flex items-center gap-2">
                      {i ? <span className="text-on-dark-2">→</span> : null}
                      <Link href={`/verify/${l.assessmentId}`} className="mono text-on-dark underline decoration-white/25 underline-offset-4">
                        {l.assessmentId.slice(0, 8)}
                      </Link>
                      <span className="num text-on-dark-2">{l.finalScore?.toFixed(1) ?? ""}</span>
                    </span>
                  ))}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </section>

      <dialog
        ref={qr}
        className="gc-sheet gc-sheet-bottom m-auto bg-paper text-ink sm:inset-auto sm:max-w-sm sm:rounded-[24px]"
        aria-labelledby="qr-title"
        onClick={(e) => e.target === qr.current && qr.current?.close()}
      >
        <div className="p-6">
          <h2 id="qr-title" className="font-serif text-xl">
            Scan to verify independently
          </h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/qr/${rec.assessmentId}`}
            alt="QR code linking to the independent verifier for this receipt"
            width={256}
            height={256}
            className="mx-auto mt-4 h-64 w-64 rounded-[12px]"
          />
          <p className="mt-4 text-xs text-ink-3">
            Opens the static verifier, which recomputes the hash in the browser and asks the chain directly — no request to Graspchain&rsquo;s API is needed.
          </p>
          <div className="mt-5 flex items-center justify-between">
            <a href={independent} target="_blank" rel="noreferrer" className="link text-sm">
              Open verifier
            </a>
            <form method="dialog">
              <Button size="sm" variant="secondary">
                Close
              </Button>
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}
