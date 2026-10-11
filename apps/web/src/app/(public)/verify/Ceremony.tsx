"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  RECEIPT_SCHEMA,
  STATUS_COPY,
  canonicalReceiptJson,
  runChecks,
  sha256Hex,
  type Receipt,
  type VerificationCheck,
  type VerificationStatus,
} from "@graspchain/shared";
import { ReceiptSlip } from "@/components/assessment/ReceiptSlip";
import { Beams } from "@/components/fx/Beams";
import { CurvedSeal } from "@/components/fx/CurvedSeal";
import { DecryptText } from "@/components/fx/DecryptText";
import { useCalm } from "@/components/fx/hooks";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";
import { CHECK, Mark } from "@/components/ui/Status";
import { call } from "@/lib/http";
import { readChain } from "@/lib/rpc";
import type { Verification } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Mode = "ours" | "independent";
type StepState = "idle" | "active" | "done" | "fail";
type Outcome = "verified" | "mismatch" | "unreachable" | "pending";

const OUTCOME: Record<VerificationStatus, Outcome> = {
  verified: "verified",
  superseded: "verified",
  tampered: "mismatch",
  unavailable: "unreachable",
  pending: "pending",
  not_found: "pending",
};

interface ChainOpts {
  rpcUrl: string;
  registry: string | null;
  chainId: number;
  chainName: string;
  verifierUrl: string;
}

interface Done {
  status: VerificationStatus;
  checks: VerificationCheck[];
  assessmentId: string;
  hash: string;
  score: number;
  detail: string | null;
  supersededBy: string | null;
}

export function Ceremony({ chain }: { chain: ChainOpts | null }) {
  const { still } = useCalm();
  const [mode, setMode] = useState<Mode>("ours");
  const [id, setId] = useState("");
  const [file, setFile] = useState<{ name: string; receipt: Receipt } | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [howOpen, setHowOpen] = useState(false);

  const [steps, setSteps] = useState<StepState[]>(["idle", "idle", "idle"]);
  const [hash, setHash] = useState<string | null>(null);
  const [slipId, setSlipId] = useState<string | null>(null);
  const [collide, setCollide] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [landed, setLanded] = useState(false);
  const pending = useRef<Done | null>(null);
  const target = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const running = steps.some((s) => s === "active") || (collide && !landed);
  const failed = landed && done ? OUTCOME[done.status] !== "verified" : false;

  function reset() {
    setSteps(["idle", "idle", "idle"]);
    setHash(null);
    setSlipId(null);
    setCollide(false);
    setDone(null);
    setLanded(false);
    pending.current = null;
  }

  async function readFile(f: File | undefined) {
    setInputError(null);
    if (!f) return;
    try {
      const r = JSON.parse(await f.text()) as Receipt;
      if (r.schema !== RECEIPT_SCHEMA || !r.assessmentId || !UUID.test(r.assessmentId)) throw new Error();
      setFile({ name: f.name, receipt: r });
      setId(r.assessmentId);
      reset();
    } catch {
      setFile(null);
      setInputError('That file isn\'t a Graspchain receipt (it needs "schema": "graspchain.receipt/1").');
    }
  }

  const wait = (ms: number) => new Promise((r) => setTimeout(r, still ? 0 : ms));

  async function start(e?: React.FormEvent) {
    e?.preventDefault();
    setInputError(null);
    if (mode === "independent" && !file) return setInputError("Choose your receipt file — the independent check hashes the file itself.");
    const aid = (file?.receipt.assessmentId ?? id).trim().toLowerCase();
    if (!UUID.test(aid)) return setInputError("An assessment ID looks like 3f1c2b9e-4a7d-4c1e-9b2a-7d6e5f4a3b21.");
    reset();
    setSlipId(aid);
    setSteps(["active", "idle", "idle"]);

    let result: Done;
    if (mode === "ours") {
      const r = await call<Verification>(`/api/verify/${aid}`);
      if (!r.ok) {
        setSteps(["fail", "idle", "idle"]);
        result = {
          status: r.status === 404 ? "not_found" : "unavailable",
          checks: [],
          assessmentId: aid,
          hash: "",
          score: 0,
          detail: r.status === 404 ? "This deployment holds no receipt with that ID." : r.error!.message,
          supersededBy: null,
        };
        pending.current = result;
        setDone(result);
        setLanded(true);
        return;
      }
      setHash(r.data.computedHash);
      await wait(1100);
      setSteps(["done", "active", "idle"]);
      await wait(900);
      setSteps(["done", "done", "active"]);
      result = {
        status: r.data.status,
        checks: r.data.checks,
        assessmentId: aid,
        hash: r.data.computedHash,
        score: r.data.receipt.assessment.finalScore,
        detail: r.data.tampered
          ? `Graspchain's copy was altered by the admin tamper tool (${r.data.tampered.field}). Your own downloaded receipt is unaffected.`
          : null,
        supersededBy: r.data.chain.supersededBy,
      };
    } else {
      const receipt = file!.receipt;
      const h = await sha256Hex(canonicalReceiptJson(receipt));
      setHash(h);
      await wait(1100);
      setSteps(["done", "active", "idle"]);
      const view = chain ? await readChain(chain, receipt, h) : null;
      await wait(500);
      setSteps(["done", view?.reachable ? "done" : "fail", "active"]);
      const { status, checks } = view ? runChecks(receipt, h, view) : { status: "unavailable" as const, checks: [] };
      result = {
        status,
        checks,
        assessmentId: aid,
        hash: h,
        score: receipt.assessment.finalScore,
        detail: view?.error ?? null,
        supersededBy: view?.supersededBy ?? null,
      };
    }
    pending.current = result;
    setDone(result);
    if (OUTCOME[result.status] === "unreachable") {
      setSteps((s) => [s[0], "fail", "fail"]);
      setLanded(true);
    } else setCollide(true);
  }

  const onCollide = useCallback(() => {
    setSteps((s) => [s[0], s[1], pending.current && OUTCOME[pending.current.status] === "verified" ? "done" : "fail"]);
    setLanded(true);
  }, []);

  useEffect(() => {
    reset();
    setInputError(null);
  }, [mode]);

  const outcome = done && landed ? OUTCOME[done.status] : null;

  return (
    <div className="on-abyss relative isolate overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(55% 50% at 70% 30%, rgb(18 112 138 / 0.45), transparent 70%), radial-gradient(40% 40% at 10% 90%, rgb(174 223 247 / 0.08), transparent 70%)",
        }}
      />
      <Beams running={running} collide={collide} stopped={failed} targetRef={target} onCollide={onCollide} />

      <div className="frame relative grid gap-12 py-14 md:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16">
        <section aria-labelledby="v-title">
          <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-aqua">Verify</p>
          <h1 id="v-title" className="display mt-4 text-[clamp(2.25rem,5vw,3.75rem)] text-on-dark">
            Was this result ever quietly changed?
          </h1>
          <p className="mt-4 max-w-lg text-md text-on-dark-2">Drop a receipt or enter its ID. Three steps, one clear answer.</p>

          <div className="mt-8">
            <Segmented
              label="How to check"
              tone="dark"
              value={mode}
              onChange={setMode}
              options={[
                { value: "ours", label: "Check against Graspchain" },
                { value: "independent", label: "Check independently" },
              ]}
            />
            <p className="mt-3 flex items-start gap-2 text-sm text-on-dark-2">
              <Icon name={mode === "independent" ? "lock" : "info"} size={15} className="mt-0.5 shrink-0" />
              {mode === "independent"
                ? "Runs entirely in this browser: your file is hashed here and the registry is asked over public RPC. It never contacts Graspchain's API."
                : "We recompute the hash of the copy Graspchain holds and ask the chain whether it matches."}
            </p>
          </div>

          <form onSubmit={start} noValidate className="mt-8 space-y-5">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                void readFile(e.dataTransfer.files?.[0]);
              }}
              className={`flex flex-col items-center justify-center gap-3 rounded-[28px] border-[1.5px] border-dashed px-6 py-9 text-center transition-colors duration-300 ${
                drag ? "border-aqua bg-aqua/10" : file ? "border-aqua/60 bg-white/5" : "border-white/25 hover:border-white/40"
              }`}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/8 text-aqua">
                <Icon name={file ? "file" : "upload"} size={20} />
              </span>
              {file ? (
                <p className="text-sm text-on-dark">
                  <span className="font-medium">{file.name}</span> <span className="text-on-dark-2">· read on this device, not uploaded</span>
                </p>
              ) : (
                <p className="text-sm text-on-dark">Drop your receipt file here</p>
              )}
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="text-sm font-medium text-aqua underline decoration-aqua/40 underline-offset-4 hover:decoration-aqua"
              >
                {file ? "Choose another file" : "Choose file"}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                tabIndex={-1}
                aria-label="Receipt file"
                onChange={(e) => void readFile(e.target.files?.[0])}
              />
            </div>

            {mode === "ours" ? (
              <div>
                <label htmlFor="aid" className="block text-sm font-medium text-on-dark">
                  Or enter an assessment ID
                </label>
                <input
                  id="aid"
                  value={id}
                  onChange={(e) => {
                    setId(e.target.value);
                    setFile(null);
                  }}
                  spellCheck={false}
                  placeholder="3f1c2b9e-…"
                  aria-invalid={!!inputError}
                  className="mono mt-2 h-12 w-full rounded-[12px] border border-white/20 bg-abyss-2 px-3.5 text-[0.9375rem] text-on-dark placeholder:text-on-dark-2/70 focus:border-aqua focus:shadow-[0_0_0_4px_rgb(106_204_198/0.3)] focus:outline-none"
                />
              </div>
            ) : null}
            {inputError ? (
              <p role="alert" className="flex items-center gap-2 text-sm text-warn">
                <Icon name="alert" size={15} /> {inputError}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-5">
              <Button type="submit" size="lg" busy={running} busyLabel="Checking…" iconAfter="arrow">
                Verify
              </Button>
              <button
                type="button"
                onClick={() => setHowOpen(true)}
                className="text-sm text-on-dark-2 underline decoration-white/25 underline-offset-4 hover:text-on-dark"
              >
                How does this work?
              </button>
            </div>
          </form>
        </section>

        <section aria-label="Verification" aria-live="polite" className="lg:pt-6">
          <ol className="space-y-3">
            {[
              { t: "Hashing the receipt", d: hash ? <DecryptText value={`${hash.slice(0, 32)}…`} className="text-aqua" /> : "JCS canonical form → SHA-256" },
              { t: "Asking the registry", d: chain ? `${chain.chainName} · AssessmentRegistry` : "AssessmentRegistry" },
              { t: "Comparing", d: "recomputed hash vs. the hash on-chain" },
            ].map((s, i) => (
              <li
                key={s.t}
                className={`flex items-start gap-3 rounded-[16px] px-4 py-3 transition-colors duration-300 ${steps[i] === "active" ? "bg-white/8" : ""}`}
              >
                <StepMark state={steps[i]} n={i + 1} />
                <div className="min-w-0">
                  <p className={`text-[0.9375rem] font-medium ${steps[i] === "idle" ? "text-on-dark-2" : "text-on-dark"}`}>{s.t}</p>
                  <div className="mt-0.5 truncate text-xs text-on-dark-2">{s.d}</div>
                </div>
              </li>
            ))}
          </ol>

          <div ref={target} className="mt-8">
            <ReceiptSlip
              compact
              assessmentId={slipId}
              hash={hash}
              state={
                outcome === "verified"
                  ? { tone: "ok", label: "Matches the chain" }
                  : outcome === "mismatch"
                    ? { tone: "bad", label: "Doesn't match" }
                    : outcome
                      ? { tone: "warn", label: outcome === "pending" ? "Not on-chain yet" : "Unreachable" }
                      : null
              }
              rows={done && done.score ? [{ k: "Score", v: done.score.toFixed(1) }] : []}
            />
          </div>

          <AnimatePresence>
            {outcome && done ? (
              <Result key={done.assessmentId + outcome} done={done} outcome={outcome} mode={mode} verifierUrl={chain?.verifierUrl ?? null} />
            ) : null}
          </AnimatePresence>
        </section>
      </div>

      <Sheet open={howOpen} onClose={() => setHowOpen(false)} title="How verification works" tone="dark">
        <ol className="space-y-6 text-[0.9375rem] text-on-dark-2">
          <li>
            <p className="font-medium text-on-dark">1 · One fingerprint per receipt</p>
            <p className="mt-1">
              The receipt is put in a canonical form (RFC 8785) and hashed with SHA-256. Change one character and the hash changes completely.
            </p>
          </li>
          <li>
            <p className="font-medium text-on-dark">2 · The chain keeps the fingerprint</p>
            <p className="mt-1">
              When the result was made, only that hash — with a salted student reference and the score — was written to a public registry. No names, no answers.
            </p>
          </li>
          <li>
            <p className="font-medium text-on-dark">3 · Compare</p>
            <p className="mt-1">
              If the recomputed hash equals the one on-chain, the receipt hasn&rsquo;t changed since. The independent check does all of this in your browser,
              without Graspchain.
            </p>
          </li>
          <li className="border-t border-white/10 pt-5 text-sm">
            Teacher corrections never edit a record: they add a new one linked to the original, so both still verify.
          </li>
        </ol>
      </Sheet>
    </div>
  );
}

function StepMark({ state, n }: { state: StepState; n: number }) {
  return (
    <span
      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-300 ${
        state === "done"
          ? "bg-aqua text-abyss"
          : state === "fail"
            ? "bg-white/10 text-warn"
            : state === "active"
              ? "bg-sky text-abyss"
              : "bg-white/8 text-on-dark-2"
      }`}
      aria-label={state === "done" ? "done" : state === "fail" ? "stopped" : state === "active" ? "in progress" : "waiting"}
    >
      {state === "done" ? (
        <Icon name="check" size={13} />
      ) : state === "fail" ? (
        <Icon name="alert" size={13} />
      ) : state === "active" ? (
        <span className="h-1.5 w-1.5 rounded-full bg-abyss" style={{ animation: "ticker 1s infinite" }} />
      ) : (
        n
      )}
    </span>
  );
}

function Result({ done, outcome, mode, verifierUrl }: { done: Done; outcome: Outcome; mode: Mode; verifierUrl: string | null }) {
  const copy = STATUS_COPY[done.status];
  const next =
    outcome === "verified"
      ? done.supersededBy
        ? { href: `/verify/${done.supersededBy}`, label: "Check the newer receipt" }
        : { href: `/verify/${done.assessmentId}`, label: "See the full record" }
      : outcome === "mismatch"
        ? { href: `/verify/${done.assessmentId}`, label: "See which check failed" }
        : outcome === "pending"
          ? { href: `/verify/${done.assessmentId}`, label: "Open the record and check again shortly" }
          : null;
  const line =
    outcome === "verified"
      ? "This receipt is exactly what was committed. Nobody has changed it since."
      : outcome === "mismatch"
        ? "This copy differs from what was committed on-chain."
        : outcome === "pending"
          ? "There is no commitment for this ID yet. New receipts are mined within seconds."
          : "The chain couldn't be reached, so nothing has been verified.";
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 0.8, 0.2, 1] }}
      className="mt-8 rounded-[24px] bg-abyss-2 p-6 ring-1 ring-white/10"
    >
      <div className="flex items-start gap-5">
        {outcome === "verified" ? (
          <CurvedSeal size={104} spin surface="dark" label={copy.title} />
        ) : (
          <span
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${outcome === "mismatch" ? "bg-bad-mark/20 text-bad-glow" : "bg-warn-mark/15 text-warn"}`}
          >
            <Icon name={outcome === "mismatch" ? "cross" : "alert"} size={24} />
          </span>
        )}
        <div className="min-w-0">
          <p
            className={`font-serif text-2xl leading-tight ${outcome === "verified" ? "text-ok-glow" : outcome === "mismatch" ? "text-bad-glow" : "text-warn"}`}
          >
            {outcome === "verified"
              ? done.status === "superseded"
                ? "Verified · superseded"
                : "Verified"
              : outcome === "mismatch"
                ? "Not matching"
                : outcome === "pending"
                  ? "Not on-chain yet"
                  : "Unreachable"}
          </p>
          <p className="mt-1.5 text-sm text-on-dark">{line}</p>
          {done.detail ? <p className="mt-2 text-xs text-on-dark-2">{done.detail}</p> : null}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {next ? (
              <Link
                href={next.href}
                className="inline-flex items-center gap-1 font-medium text-aqua underline decoration-aqua/40 underline-offset-4 hover:decoration-aqua"
              >
                {next.label} <Icon name="arrow" size={13} />
              </Link>
            ) : (
              <span className="text-on-dark-2">Try again in a moment, or use another RPC in the full independent verifier.</span>
            )}
            {mode === "ours" && verifierUrl ? (
              <a href={verifierUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-on-dark-2 hover:text-on-dark">
                Full independent verifier <Icon name="external" size={12} />
              </a>
            ) : null}
          </div>
        </div>
      </div>
      {done.checks.length ? (
        <details className="mt-5 border-t border-white/10 pt-4 text-sm">
          <summary className="cursor-pointer text-on-dark-2 hover:text-on-dark">The four checks</summary>
          <ul className="mt-3 space-y-2.5">
            {done.checks.map((c) => (
              <li key={c.id} className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-baseline gap-2">
                <span className="mono text-xs text-on-dark-2">{c.id}</span>
                <span className="text-on-dark">{c.title}</span>
                <Mark spec={CHECK[c.state]} compact />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </motion.div>
  );
}
