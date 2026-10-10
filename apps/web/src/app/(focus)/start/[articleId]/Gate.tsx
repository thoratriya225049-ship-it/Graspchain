"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ArticleSummary } from "@graspchain/shared";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Bits";
import { call, store } from "@/lib/http";
import type { SessionView, TicketView } from "@/lib/types";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.round(s)) % 60).padStart(2, "0")}`;

type Phase = { k: "brief" } | { k: "queue"; t: TicketView } | { k: "starting" } | { k: "expired" } | { k: "error"; message: string };

/** S3: brief → FairGate ticket → admission → session. Under no load, admission is near-instant. */
export function Gate({ article, capS, windowS }: { article: ArticleSummary; capS: number; windowS: number }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ k: "brief" });
  const [busy, setBusy] = useState(false);
  const poll = useRef<number | null>(null);
  const ss = store("session");
  const key = `gc-ticket-${article.id}`;

  const stop = () => {
    if (poll.current) window.clearInterval(poll.current);
    poll.current = null;
  };

  const admit = useCallback(
    async (t: TicketView) => {
      stop();
      setPhase({ k: "starting" });
      const r = await call<SessionView>("/api/session", { method: "POST", json: { articleId: article.id, admissionToken: t.admissionToken } });
      if (!r.ok) {
        ss.set(key, null);
        if (r.error!.code === "ADMISSION_EXPIRED") return setPhase({ k: "expired" });
        return setPhase({ k: "error", message: r.error!.message });
      }
      ss.set(key, null);
      router.replace(`/session/${r.data.sessionId}`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [article.id, router],
  );

  const watch = useCallback(
    (ticketId: string) => {
      stop();
      const tick = async () => {
        const r = await call<TicketView>(`/api/queue/${ticketId}`);
        if (!r.ok) {
          stop();
          ss.set(key, null);
          return setPhase(r.status === 404 ? { k: "brief" } : { k: "error", message: r.error!.message });
        }
        const t = r.data;
        if (t.state === "admitted" && t.admissionToken) return admit(t);
        if (t.state === "expired") {
          stop();
          ss.set(key, null);
          return setPhase({ k: "expired" });
        }
        setPhase({ k: "queue", t });
      };
      void tick();
      poll.current = window.setInterval(tick, 1000);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [admit],
  );

  useEffect(() => {
    const saved = ss.get(key);
    if (saved) watch(saved);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function join() {
    setBusy(true);
    const r = await call<TicketView & { details?: { ticketId: string } }>("/api/queue/join", { method: "POST", json: { articleId: article.id } });
    setBusy(false);
    const id = r.ok ? r.data.ticketId : r.error?.code === "TICKET_OPEN" ? (r.data as { details?: { ticketId: string } }).details?.ticketId : null;
    if (!id) return setPhase({ k: "error", message: r.error?.message ?? "Couldn't join the queue." });
    ss.set(key, id);
    watch(id);
  }

  async function leave() {
    if (phase.k === "queue") await call(`/api/queue/${phase.t.ticketId}/leave`, { method: "POST" });
    stop();
    ss.set(key, null);
    setPhase({ k: "brief" });
  }

  return (
    <div className="frame grid gap-14 pb-24 pt-12 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-20 md:pt-20">
      <section className="animate-rise">
        <p className="eyebrow">
          <span className="mono normal-case tracking-normal">{article.id}</span> · {article.topic}
        </p>
        <h1 className="mt-3 font-serif text-2xl leading-[1.08] md:text-[2.75rem]">{article.title}</h1>
        <ol className="mt-10 border-t border-ink">
          {[
            [
              "Read",
              `You have ${mmss(article.readSeconds)} with the article (${article.wordCount} words). The clock starts when it has arrived on your screen.`,
            ],
            ["It closes", "When time is up — or when you say you are done — the article is removed. The server refuses to send it again."],
            ["Explain", "Write what it is about and why it matters, in your own words: 30 to 300 words."],
            ["See exactly why", "A score in about two seconds, then feedback, then an X-Ray of the article showing what you understood, missed and got wrong."],
          ].map(([h, b], i) => (
            <li key={h} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-4 border-b border-rule py-5">
              <span className="mono pt-0.5 text-sm text-ink-3">0{i + 1}</span>
              <div>
                <h2 className="text-[0.9375rem] font-semibold">{h}</h2>
                <p className="mt-1 text-[0.9375rem] text-ink-2">{b}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-6 max-w-xl text-sm text-ink-3">
          Fair clock: up to {capS} s of delivery delay is added back to your reading time, so a slow connection does not cost you reading time.
        </p>
      </section>

      <section aria-live="polite" className="animate-rise self-start [animation-delay:80ms] md:sticky md:top-10">
        {phase.k === "brief" || phase.k === "error" ? (
          <div>
            <p className="eyebrow">Ready when you are</p>
            <p className="mt-3 max-w-sm text-[0.9375rem] text-ink-2">
              Find a quiet moment. Once the article opens, the clock runs on the server — refreshing does not give you more time.
            </p>
            {phase.k === "error" ? (
              <div className="mt-6">
                <Notice tone="bad" title="Couldn't start">
                  {phase.message}
                </Notice>
              </div>
            ) : null}
            <div className="mt-8 flex flex-wrap items-center gap-6">
              <Button size="lg" onClick={join} busy={busy} iconAfter="arrow">
                Open the article
              </Button>
              <Link href="/library" className="link text-[0.9375rem]">
                Not now
              </Link>
            </div>
          </div>
        ) : phase.k === "queue" ? (
          <Ticket t={phase.t} windowS={windowS} onLeave={leave} />
        ) : phase.k === "starting" ? (
          <div className="border-t border-ink pt-6">
            <p className="eyebrow text-signal-ink">Admitted</p>
            <p className="mt-2 font-serif text-xl">Opening the article…</p>
          </div>
        ) : (
          <div>
            <Notice tone="warn" title="Your slot expired">
              Admission is held for 30 seconds. Rejoin to get a new place — you keep nothing and lose nothing.
            </Notice>
            <Button className="mt-6" onClick={join} busy={busy}>
              Rejoin the queue
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

function Ticket({ t, windowS, onLeave }: { t: TicketView; windowS: number; onLeave: () => void }) {
  const closesIn = t.windowClosesAt ? Math.max(0, (t.windowClosesAt - t.serverNow) / 1000) : 0;
  const ordering = t.position === null;
  return (
    <div>
      <p className="eyebrow">Fair entry · ticket</p>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] border border-ink bg-paper-raised shadow-doc">
        <div className="p-6">
          <p className="eyebrow">{ordering ? "Window open" : "Your place"}</p>
          <p className="num mono mt-2 text-[4.5rem] leading-none tracking-[-0.04em]">{ordering ? "—" : t.ahead === 0 ? "Next" : `#${(t.ahead ?? 0) + 1}`}</p>
          <p className="mt-3 text-sm text-ink-2">
            {ordering
              ? `Everyone joining in this ${t.mode === "fair" ? `${windowS}-second window` : "moment"} is being ordered — ${closesIn.toFixed(1)} s left.`
              : t.ahead === 0
                ? `You're next — admitted as soon as one of the ${t.concurrency} sessions in progress finishes (about ${mmss(t.estWaitSec)}).`
                : `${t.ahead} ahead of you · about ${mmss(t.estWaitSec)}`}
          </p>
        </div>
        <dl className="w-36 space-y-3 border-l border-dashed border-rule-strong p-5 text-xs">
          <div>
            <dt className="eyebrow">Ticket</dt>
            <dd className="mono mt-0.5">{t.ticketId.slice(0, 8)}</dd>
          </div>
          <div>
            <dt className="eyebrow">Window</dt>
            <dd className="mono mt-0.5 break-all">{t.windowId ?? "—"}</dd>
          </div>
          <div>
            <dt className="eyebrow">In session</dt>
            <dd className="num mono mt-0.5">
              {t.inService}/{t.concurrency}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Order</dt>
            <dd className="mt-0.5">{t.mode === "fair" ? "Shuffled" : "Arrival"}</dd>
          </div>
        </dl>
      </div>
      <p className="mt-5 max-w-md text-sm text-ink-2">
        {t.mode === "fair"
          ? `Everyone who joins within the same ${windowS}-second window is placed in a random, seeded order, so a faster connection doesn't get you in first. There are no priority tickets.`
          : "This queue is in arrival-order mode (the comparison baseline), so the fastest connection is served first."}
      </p>
      {t.demoLoad ? <p className="mt-3 text-xs text-warn">Demo load is on: simulated classmates are in this queue.</p> : null}
      <button onClick={onLeave} className="link mt-6 text-sm text-ink-3">
        Leave the queue
      </button>
    </div>
  );
}
