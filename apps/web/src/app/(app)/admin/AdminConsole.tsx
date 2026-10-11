"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@graspchain/shared";
import { Button } from "@/components/ui/Button";
import { Field, Notice, inputClass } from "@/components/ui/Bits";
import { CHAIN, Dot, Mark, Tag } from "@/components/ui/Status";
import { Segmented } from "@/components/ui/Segmented";
import { Reveal } from "@/components/ui/Sheet";
import { call, store } from "@/lib/http";

interface Settings {
  researchMode: boolean;
  clockMode: "fair" | "naive";
  fairMode: "fair" | "fifo";
  readSecondsOverride: number | null;
  demoLoad: boolean;
}
interface Status {
  config: {
    judge: { kind: string; model: string };
    llm: { enabled: boolean; provider: string | null; model: string | null };
    demoMode: string;
    chain: { name: string; chainId: number };
  };
  settings: Settings;
  jev: { tokensToday: number; cap: number; callsToday: number; cacheHitsToday: number };
  llm: { provider: string; tokensToday: number; callsToday: number; cacheHitsToday: number } | null;
  cacheHitRate: number | null;
  outbox: Record<"queued" | "sent" | "retry" | "failed" | "mined", number>;
  writerLastError: string | null;
  queue: Record<string, number>;
  attempts: Record<string, number>;
  latency: { p50ScoreMs: number | null; p95ScoreMs: number | null; n: number };
  chain: {
    reachable: boolean;
    blockNumber: number | null;
    registry: string | null;
    registryDeployed: boolean | null;
    writer: string | null;
    writerBalanceEth: string | null;
    gasPriceGwei: string | null;
    canWrite: boolean;
    error: string | null;
  };
}
interface ReceiptRow {
  assessmentId: string;
  attemptId: string;
  studentCode: string;
  articleId: string;
  finalScore: number;
  chainStatus: string;
  tamperedField: string | null;
  supersedes: string | null;
  createdAt: string;
}

/** S12: system status, live mode switches, and the demo-only tamper tool. Every call is audit-logged. */
export function AdminConsole({ demoTools }: { demoTools: boolean }) {
  const ss = store("session");
  const [secret, setSecret] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"status" | "modes" | "integrity" | "audit">("status");
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (h === "modes" || h === "integrity" || h === "audit" || h === "status") setTab(h);
  }, []);

  useEffect(() => setSecret(ss.get("gc-admin-secret")), []); // eslint-disable-line react-hooks/exhaustive-deps

  const headers = useCallback(() => ({ "x-admin-secret": secret ?? "" }), [secret]);
  const load = useCallback(async () => {
    if (!secret) return;
    const r = await call<Status>("/api/admin/status", { headers: headers() });
    if (!r.ok) {
      if (r.error!.code === "ADMIN_SECRET") {
        ss.set("gc-admin-secret", null);
        setSecret(null);
      }
      return setError(r.error!.message);
    }
    setError(null);
    setStatus(r.data);
  }, [secret, headers]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load();
    const i = window.setInterval(load, 5000);
    return () => window.clearInterval(i);
  }, [load]);

  if (!secret)
    return (
      <div className="frame-narrow pt-14 md:pt-20">
        <p className="eyebrow">Integrity</p>
        <h1 className="mt-3 font-serif text-2xl">Admin tools are double-gated</h1>
        <p className="mt-3 text-ink-2">
          Your admin role is confirmed. Enter the deployment&rsquo;s admin secret as well. It is kept in this tab only and sent as a header on admin calls.
        </p>
        <form
          className="mt-8 max-w-sm space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            ss.set("gc-admin-secret", draft);
            setSecret(draft);
          }}
        >
          <Field label="Admin secret" htmlFor="sec" error={error} hint="Printed by `pnpm run setup:env`, or ADMIN_SECRET in apps/api/.env.">
            <input id="sec" type="password" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} className={`${inputClass} mono`} />
          </Field>
          <Button type="submit">Unlock</Button>
        </form>
      </div>
    );

  return (
    <div className="frame pt-10 md:pt-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="display mt-3 text-[clamp(2.25rem,5vw,3.25rem)]">This deployment</h1>
        </div>
        <button
          className="link text-sm text-ink-3"
          onClick={() => {
            ss.set("gc-admin-secret", null);
            setSecret(null);
            setStatus(null);
          }}
        >
          Lock
        </button>
      </header>
      <div className="mt-8 overflow-x-auto pb-1">
        <Segmented
          label="Admin sections"
          value={tab}
          onChange={(v) => {
            setTab(v);
            try {
              history.replaceState(null, "", `#${v}`);
            } catch {
              /* ignore */
            }
          }}
          options={[
            { value: "status", label: "System status" },
            { value: "modes", label: "Live modes" },
            { value: "integrity", label: "Integrity tools" },
            { value: "audit", label: "Audit log" },
          ]}
        />
      </div>
      {error ? (
        <div className="mt-6">
          <Notice tone="bad">{error}</Notice>
        </div>
      ) : null}
      <div className="mt-8">
        {tab === "status" ? status ? <Readouts s={status} /> : <div className="skeleton h-48" aria-busy="true" /> : null}
        {tab === "modes" ? (
          status ? (
            <Modes initial={status.settings} headers={headers} demoTools={demoTools} onSaved={load} />
          ) : (
            <div className="skeleton h-48" aria-busy="true" />
          )
        ) : null}
        {tab === "integrity" ? (
          demoTools ? (
            <Tamper headers={headers} />
          ) : (
            <section>
              <h2 className="font-serif text-xl">Tamper test</h2>
              <p className="mt-2 text-ink-3">Disabled: ADMIN_DEMO_TOOLS=0 on this deployment.</p>
            </section>
          )
        ) : null}
        {tab === "audit" ? <Audit headers={headers} /> : null}
      </div>
    </div>
  );
}

function Readout({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "bad" | "warn" }) {
  return (
    <div className="grid gap-1 px-5 py-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6">
      <dt className="flex items-center gap-2 text-sm text-ink-2">
        <Dot tone={tone === "bad" ? "bad" : tone === "warn" ? "warn" : "ok"} />
        {label}
      </dt>
      <dd>
        <span className={`num text-base font-medium leading-snug ${tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink"}`}>{value}</span>
        {sub ? <span className="mt-1 block text-xs text-ink-3">{sub}</span> : null}
      </dd>
    </div>
  );
}

function Readouts({ s }: { s: Status }) {
  const pctCap = Math.min(1, s.jev.tokensToday / s.jev.cap);
  const backlog = s.outbox.queued + s.outbox.sent + s.outbox.retry;
  return (
    <section aria-label="System status" className="space-y-4">
      <Reveal summary="Components" meta="judge · LLM · chain · registry · API" defaultOpen>
        <dl className="divide-y divide-rule rounded-[20px] bg-paper-raised ring-1 ring-rule">
          <Readout
            label="Judge"
            value={<span className="mono text-base">{s.config.judge.model}</span>}
            tone={s.config.judge.kind === "local" ? "warn" : undefined}
            sub={
              s.config.judge.kind === "local"
                ? "Local demo judge — no Jev calls are made."
                : s.config.judge.kind === "evidence"
                  ? "Evidence judge: the LLM extracts evidence; rules decide."
                  : "Jev"
            }
          />
          <Readout
            label="LLM"
            value={s.llm ? <span className="mono text-base">{`${s.config.llm.provider}/${s.config.llm.model}`}</span> : "off"}
            tone={s.llm ? undefined : "warn"}
            sub={s.llm ? `${s.llm.tokensToday.toLocaleString()} tokens · ${s.llm.callsToday} calls today` : "Sentence split + template feedback"}
          />
          <Readout
            label="Chain"
            value={s.chain.reachable ? `${s.config.chain.name} · block ${s.chain.blockNumber}` : "offline"}
            tone={s.chain.reachable ? undefined : "bad"}
            sub={`chain ${s.config.chain.chainId} · gas ${s.chain.gasPriceGwei ?? "—"} gwei${s.chain.error ? ` · ${s.chain.error}` : ""}`}
          />
          <Readout
            label="Registry"
            value={<span className="mono break-all text-base">{s.chain.registry ?? "not configured"}</span>}
            tone={s.chain.registryDeployed ? undefined : "warn"}
            sub={s.chain.registryDeployed ? "deployed" : "missing on this chain"}
          />
          <Readout
            label="Chain writer"
            value={s.chain.canWrite ? "on" : "off"}
            tone={s.chain.canWrite ? undefined : "warn"}
            sub={
              s.chain.writer ? (
                <>
                  balance {s.chain.writerBalanceEth} ETH{s.writerLastError ? <span className="mt-1 block text-bad">{s.writerLastError}</span> : null}
                </>
              ) : (
                "No DEPLOYER_PRIVATE_KEY"
              )
            }
          />
          <Readout label="API" value="reachable" sub={`demo mode ${s.config.demoMode} · refreshes every 5 s`} />
        </dl>
      </Reveal>
      <Reveal summary="Load and throughput" meta={`${backlog} in the outbox`}>
        <dl className="divide-y divide-rule rounded-[20px] bg-paper-raised ring-1 ring-rule">
          <Readout
            label="Jev tokens today"
            value={s.jev.tokensToday.toLocaleString()}
            tone={pctCap > 0.9 ? "bad" : undefined}
            sub={
              <>
                of {s.jev.cap.toLocaleString()} cap · {s.jev.callsToday} calls
                <span className="mt-2 block h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-mint">
                  <span className={`block h-full rounded-full ${pctCap > 0.9 ? "bg-bad-mark" : "bg-teal"}`} style={{ width: `${pctCap * 100}%` }} />
                </span>
              </>
            }
          />
          <Readout
            label="Outbox backlog"
            value={backlog}
            tone={s.outbox.failed ? "bad" : backlog > 5 ? "warn" : undefined}
            sub={`${s.outbox.mined} mined · ${s.outbox.retry} retrying · ${s.outbox.failed} failed`}
          />
          <Readout label="Queue" value={s.queue.waiting ?? 0} sub={`waiting · ${(s.queue.admitted ?? 0) + (s.queue.used ?? 0)} holding a slot`} />
          <Readout label="Cache hit rate" value={s.cacheHitRate === null ? "—" : `${Math.round(s.cacheHitRate * 100)}%`} sub="Jev + LLM, all time" />
          <Readout
            label="Time to score"
            value={s.latency.p50ScoreMs === null ? "—" : `${s.latency.p50ScoreMs} ms`}
            sub={`p50 · p95 ${s.latency.p95ScoreMs ?? "—"} ms · last ${s.latency.n}`}
          />
          <Readout
            label="Attempts"
            value={Object.values(s.attempts).reduce((a, b) => a + b, 0)}
            tone={s.attempts.failed ? "warn" : undefined}
            sub={Object.entries(s.attempts)
              .map(([k, v]) => `${v} ${k}`)
              .join(" · ")}
          />
        </dl>
      </Reveal>
      <div className="border-t border-rule" />
    </section>
  );
}

function Toggle({ label, on, onChange, hint }: { label: string; on: boolean; onChange: (v: boolean) => void; hint: string }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-rule py-4">
      <div>
        <p className="text-[0.9375rem] font-medium">{label}</p>
        <p className="mt-0.5 text-sm text-ink-3">{hint}</p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-teal" : "bg-mint ring-1 ring-rule-strong"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${on ? "left-[1.375rem]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  hint: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-rule py-4">
      <div>
        <p className="text-[0.9375rem] font-medium">{label}</p>
        <p className="mt-0.5 text-sm text-ink-3">{hint}</p>
      </div>
      <div className="flex rounded-full bg-mint p-1" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button
            key={v}
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`h-8 rounded-full px-3.5 text-sm transition-colors ${value === v ? "bg-teal text-white" : "text-ink-2 hover:text-ink"}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Modes({
  initial,
  headers,
  demoTools,
  onSaved,
}: {
  initial: Settings;
  headers: () => Record<string, string>;
  demoTools: boolean;
  onSaved: () => void;
}) {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  async function save() {
    setBusy(true);
    const r = await call<{ settings: Settings }>("/api/admin/mode", { method: "POST", headers: headers(), json: s });
    setBusy(false);
    setMsg(r.ok ? { tone: "ok", text: "Saved. New sessions use these settings." } : { tone: "bad", text: r.error!.message });
    if (r.ok) onSaved();
  }
  return (
    <section aria-labelledby="modes">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id="modes" className="font-serif text-xl">
          Live modes
        </h2>
        <Button onClick={save} busy={busy} disabled={!dirty || !demoTools}>
          Save changes
        </Button>
      </div>
      {!demoTools ? <p className="mt-2 text-sm text-ink-3">Mode switches are demo tools and are disabled on this deployment.</p> : null}
      <div className="mt-4 grid gap-x-16 lg:grid-cols-2">
        <div>
          <Toggle
            label="Research mode"
            on={s.researchMode}
            onChange={(v) => setS({ ...s, researchMode: v })}
            hint="Students see “Thanks, recorded” instead of scores (blind data collection)."
          />
          <Choice
            label="Reading clock"
            value={s.clockMode}
            options={[
              ["fair", "Fair clock"],
              ["naive", "Server only"],
            ]}
            onChange={(v) => setS({ ...s, clockMode: v })}
            hint="Naive mode is the comparison baseline for the split-screen demo."
          />
          <Choice
            label="Entry order"
            value={s.fairMode}
            options={[
              ["fair", "Shuffled windows"],
              ["fifo", "Arrival order"],
            ]}
            onChange={(v) => setS({ ...s, fairMode: v })}
            hint="Arrival order is the baseline that favours fast connections."
          />
        </div>
        <div>
          <Toggle
            label="Simulated load"
            on={s.demoLoad}
            onChange={(v) => setS({ ...s, demoLoad: v })}
            hint="Each join also adds nine simulated classmates, so the queue is visible. Labelled in the queue."
          />
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-rule py-4">
            <div>
              <p className="text-[0.9375rem] font-medium">Reading time override</p>
              <p className="mt-0.5 text-sm text-ink-3">Shorten every article&rsquo;s reading time for a demo. Empty = computed from length.</p>
            </div>
            <input
              type="number"
              min={15}
              max={600}
              value={s.readSecondsOverride ?? ""}
              onChange={(e) => setS({ ...s, readSecondsOverride: e.target.value ? Number(e.target.value) : null })}
              placeholder="auto"
              aria-label="Reading time override in seconds"
              className={`${inputClass} num mono w-28`}
            />
          </div>
        </div>
      </div>
      {msg ? (
        <div className="mt-4">
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      ) : null}
    </section>
  );
}

function Tamper({ headers }: { headers: () => Record<string, string> }) {
  const [data, setData] = useState<{ fields: { id: string; label: string }[]; receipts: ReceiptRow[] } | null>(null);
  const [pick, setPick] = useState("");
  const [field, setField] = useState("finalScore");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: React.ReactNode } | null>(null);
  const load = useCallback(async () => {
    const r = await call<{ fields: { id: string; label: string }[]; receipts: ReceiptRow[] }>("/api/admin/receipts", { headers: headers() });
    if (r.ok) {
      setData(r.data);
      setPick((p) => p || r.data.receipts[0]?.assessmentId || "");
    }
  }, [headers]);
  useEffect(() => {
    void load();
  }, [load]);

  async function tamper() {
    if (!window.confirm("Alter one field of the server's copy of this receipt? The chain and the student's downloaded file are not touched.")) return;
    const r = await call<{ label: string }>("/api/admin/tamper", { method: "POST", headers: headers(), json: { assessmentId: pick, field } });
    setMsg(
      r.ok
        ? {
            tone: "ok",
            text: (
              <>
                Server copy altered ({r.data.label}).{" "}
                <Link className="link" href={`/verify/${pick}`}>
                  Open its Verify page
                </Link>{" "}
                — V1 should now fail, while the student&rsquo;s own receipt still verifies in the independent verifier.
              </>
            ),
          }
        : { tone: "bad", text: r.error!.message },
    );
    void load();
  }
  async function restore(id: string) {
    const r = await call("/api/admin/restore", { method: "POST", headers: headers(), json: { assessmentId: id } });
    setMsg(r.ok ? { tone: "ok", text: "Restored the original server copy." } : { tone: "bad", text: r.error!.message });
    void load();
  }

  return (
    <section aria-labelledby="tamper">
      <h2 id="tamper" className="font-serif text-xl">
        Tamper test
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-3">
        Mutates one field in the database copy of a receipt — the attack the chain exists to expose. Demo deployments only; audit-logged.
      </p>
      {data ? (
        <>
          <div className="mt-6 flex flex-wrap items-end gap-4">
            <div className="w-full max-w-md">
              <Field label="Receipt" htmlFor="tr">
                <select id="tr" value={pick} onChange={(e) => setPick(e.target.value)} className={`${inputClass} mono text-sm`}>
                  {data.receipts.map((r) => (
                    <option key={r.assessmentId} value={r.assessmentId}>
                      {r.assessmentId.slice(0, 8)} · {r.studentCode} · {r.articleId} · {r.finalScore.toFixed(1)}
                      {r.tamperedField ? " · TAMPERED" : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="w-64">
              <Field label="Field" htmlFor="tf">
                <select id="tf" value={field} onChange={(e) => setField(e.target.value)} className={`${inputClass} text-sm`}>
                  {data.fields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Button variant="danger" onClick={tamper} disabled={!pick}>
              Tamper server copy
            </Button>
          </div>
          {msg ? (
            <div className="mt-4">
              <Notice tone={msg.tone}>{msg.text}</Notice>
            </div>
          ) : null}
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-rule-strong text-left">
                  {["Assessment", "Student", "Article", "Score", "Chain", "Server copy", ""].map((h) => (
                    <th key={h} className="eyebrow py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.receipts.slice(0, 12).map((r) => (
                  <tr key={r.assessmentId} className="border-b border-rule">
                    <td className="py-2.5">
                      <Link className="mono link" href={`/verify/${r.assessmentId}`}>
                        {r.assessmentId.slice(0, 8)}
                      </Link>
                      {r.supersedes ? <span className="ml-2 text-xs text-ink-3">correction</span> : null}
                    </td>
                    <td className="mono py-2.5">{r.studentCode}</td>
                    <td className="mono py-2.5">{r.articleId}</td>
                    <td className="num mono py-2.5">{r.finalScore.toFixed(1)}</td>
                    <td className="py-2.5">
                      <Mark spec={CHAIN[r.chainStatus] ?? CHAIN.queued} compact />
                    </td>
                    <td className="py-2.5">
                      {r.tamperedField ? <Tag tone="bad">altered: {r.tamperedField}</Tag> : <span className="text-ink-3">original</span>}
                    </td>
                    <td className="py-2.5 text-right">
                      {r.tamperedField ? (
                        <button className="link text-sm" onClick={() => restore(r.assessmentId)}>
                          Restore
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="skeleton mt-6 h-24" />
      )}
    </section>
  );
}

function Audit({ headers }: { headers: () => Record<string, string> }) {
  const [rows, setRows] = useState<{ id: number; actor: string; action: string; target: string | null; detail: string | null; at: string }[] | null>(null);
  useEffect(() => {
    void call<{ entries: NonNullable<typeof rows> }>("/api/admin/audit", { headers: headers() }).then((r) => r.ok && setRows(r.data.entries));
  }, [headers]);
  return (
    <section aria-labelledby="audit">
      <h2 id="audit" className="font-serif text-xl">
        Audit log
      </h2>
      {rows ? (
        <ul className="mt-4 max-h-[32rem] overflow-y-auto rounded-[20px] bg-paper-raised px-5 text-sm ring-1 ring-rule">
          {rows.slice(0, 40).map((r) => (
            <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-rule py-2 sm:grid-cols-[9.5rem_6rem_minmax(0,1fr)]">
              <span className="num text-xs text-ink-3">{formatDateTime(r.at)}</span>
              <span className="mono text-xs sm:order-none">{r.actor}</span>
              <span className="col-span-2 min-w-0 break-words sm:col-span-1">
                {r.action}
                {r.target ? <span className="mono ml-2 text-xs text-ink-3">{r.target.length > 18 ? `${r.target.slice(0, 8)}…` : r.target}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="skeleton mt-4 h-24" />
      )}
    </section>
  );
}
