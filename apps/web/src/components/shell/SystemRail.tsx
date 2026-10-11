"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Dot, type Tone } from "@/components/ui/Status";
import type { PublicConfig } from "@/lib/types";

/**
 * What is actually doing the work in this deployment, one click away instead of a permanent
 * dark strip. The dot is green when real components run, amber when a stand-in is in use
 * (local judge, no LLM, replay mode, chain writer off) or the server can't be reached.
 */
export function systemItems(config: PublicConfig) {
  const items: { k: string; v: string; warn?: boolean }[] = [
    config.judge.kind === "jev"
      ? { k: "Judge", v: `Jev ${config.judge.model}` }
      : config.judge.kind === "evidence"
        ? { k: "Judge", v: `${config.judge.model} · the LLM extracts evidence, rules decide` }
        : { k: "Judge", v: `${config.judge.model} · local demo stand-in, not Jev`, warn: true },
    config.llm.enabled
      ? { k: "LLM", v: `${config.llm.provider}/${config.llm.model}` }
      : { k: "LLM", v: "off · sentence split + template feedback", warn: true },
    { k: "Chain", v: `${config.chain.name} · ${config.chain.chainId}${config.chain.canWrite ? "" : " · writer off"}`, warn: !config.chain.canWrite },
    { k: "Registry", v: config.chain.registry ?? "not configured", warn: !config.chain.registry },
  ];
  if (config.demoMode === "replay") items.push({ k: "Mode", v: "replay · cached answers only", warn: true });
  if (config.researchMode) items.push({ k: "Research", v: "on · scores hidden from students", warn: true });
  return items;
}

export function SystemStatus({ config, tone = "light" }: { config: PublicConfig | null; tone?: "light" | "dark" }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState<{ ok: boolean; block?: number | null } | null>(null);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const items = config ? systemItems(config) : [];
  const dotTone: Tone = !config ? "warn" : items.some((i) => i.warn) ? "warn" : "ok";

  useEffect(() => {
    if (!open) return;
    let off = false;
    fetch("/readyz", { cache: "no-store" })
      .then((r) =>
        r
          .json()
          .then(
            (j: { ready?: boolean; chain?: { blockNumber?: number | null } }) =>
              !off && setReady({ ok: r.ok && !!j.ready, block: j.chain?.blockNumber ?? null }),
          ),
      )
      .catch(() => !off && setReady({ ok: false }));
    const onDoc = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      off = true;
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const dark = tone === "dark";
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex h-9 items-center gap-2 rounded-full px-2.5 text-sm font-medium transition-colors duration-200 min-[400px]:px-3.5 ${dark ? "text-on-dark-2 hover:bg-white/8 hover:text-on-dark" : "bg-mint text-ink-2 hover:bg-sky/45 hover:text-ink"}`}
      >
        <Dot tone={dotTone} />
        System
        <span className="sr-only">{dotTone === "ok" ? "(all real components running)" : "(stand-ins or problems — open for details)"}</span>
      </button>
      {open ? (
        <div
          id={id}
          role="dialog"
          aria-label="System status"
          className="absolute right-0 top-10 z-50 w-[min(22rem,calc(100vw-2rem))] animate-rise rounded-[18px] bg-paper-raised p-5 text-ink shadow-float ring-1 ring-rule"
        >
          <p className="eyebrow">This deployment</p>
          {config ? (
            <dl className="mt-3 space-y-2.5 text-sm">
              {items.map((i) => (
                <div key={i.k} className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-3">
                  <dt className="text-ink-3">{i.k}</dt>
                  <dd className={`mono break-words text-[0.8125rem] ${i.warn ? "text-warn" : "text-ink"}`}>{i.v}</dd>
                </div>
              ))}
              <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-3">
                <dt className="text-ink-3">API</dt>
                <dd className="flex items-center gap-2 text-[0.8125rem]">
                  {ready === null ? (
                    <span className="text-ink-3">checking…</span>
                  ) : ready.ok ? (
                    <>
                      <Dot tone="ok" /> reachable{ready.block != null ? <span className="mono text-ink-3">· block {ready.block}</span> : null}
                    </>
                  ) : (
                    <>
                      <Dot tone="warn" /> not ready
                    </>
                  )}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-ink-2">Can&rsquo;t reach the Graspchain server, so nothing here can be confirmed.</p>
          )}
          <p className="mt-4 border-t border-rule pt-3 text-xs text-ink-3">Stand-ins are named here and inside every receipt.</p>
        </div>
      ) : null}
    </div>
  );
}

/** Inline, recoverable: replaces the old full-width crimson banner. */
export function ServerUnreachable() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div role="status" className="frame flex items-center gap-3 py-2 text-sm text-ink-2">
      <Dot tone="warn" pulse />
      <span>Can&rsquo;t reach the server.</span>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-medium text-teal underline decoration-teal/30 underline-offset-4 hover:decoration-teal"
        onClick={() => {
          setBusy(true);
          router.refresh();
          window.setTimeout(() => setBusy(false), 1200);
        }}
      >
        <Icon name="replay" size={14} className={busy ? "animate-spin" : ""} /> Retry
      </button>
    </div>
  );
}
