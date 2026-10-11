"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ArticleSummary } from "@graspchain/shared";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Bits";
import { Icon } from "@/components/ui/Icon";
import { JourneySteps, JourneyThread } from "@/components/fx/JourneyThread";
import { call, store } from "@/lib/http";
import { requestFullscreen } from "@/lib/integrity";
import type { SessionView, TicketView } from "@/lib/types";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.round(s)) % 60).padStart(2, "0")}`;

type Phase = { k: "brief" } | { k: "queue"; t: TicketView } | { k: "starting" } | { k: "expired" } | { k: "error"; message: string };

/** S3: brief → FairGate ticket → admission → session. Under no load, admission is near-instant. */
export function Gate({ article, capS, windowS, active }: { article: ArticleSummary; capS: number; windowS: number; active: SessionView | null }) {
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
    // Full screen needs this click (a user gesture); declining or an unsupported browser is fine.
    void requestFullscreen();
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
    <>
      <JourneyThread stage="understand" />
      <div className="frame-narrow pb-24 pt-10 md:pt-16">
        <JourneySteps stage="understand" className="mb-8" />
        <p className="eyebrow">
          <span className="mono normal-case tracking-normal">{article.id}</span> · {article.topic}
        </p>
        <h1 className="display mt-3 text-[clamp(2.25rem,5vw,3.25rem)] leading-[1.05]">{article.title}</h1>
        <p className="mt-4 max-w-xl text-md text-ink-2">{article.dek}</p>

        <ol className="mt-10 grid gap-3 sm:grid-cols-4">
          {[
            { icon: "book" as const, h: `Read · ${mmss(article.readSeconds)}`, b: "The clock starts once it has arrived." },
            { icon: "lock" as const, h: "It closes", b: "For good — it can't be opened again." },
            { icon: "pen" as const, h: "Explain", b: "30–300 words, your own words." },
            { icon: "eye" as const, h: "See why", b: "Score, feedback, then an X-Ray." },
          ].map((s) => (
            <li key={s.h} className="rounded-[18px] bg-mint/60 p-4">
              <Icon name={s.icon} size={18} className="text-teal" />
              <p className="mt-3 text-[0.9375rem] font-medium text-ink">{s.h}</p>
              <p className="mt-1 text-sm text-ink-2">{s.b}</p>
            </li>
          ))}
        </ol>

        <section aria-live="polite" className="mt-10">
          {phase.k === "brief" || phase.k === "error" ? (
            <div>
              {active ? (
                <div className="mb-6">
                  <Notice tone="warn" title="You have an assessment in progress">
                    {active.articleId === article.id ? "This article" : `Article ${active.articleId}`} is still open ({active.state.toLowerCase()}). Starting
                    now closes it for good.{" "}
                    <Link href={`/session/${active.sessionId}`} className="link">
                      Resume it instead
                    </Link>
                  </Notice>
                </div>
              ) : null}
              {phase.k === "error" ? (
                <div className="mb-6">
                  <Notice tone="bad" title="Couldn't start">
                    {phase.message}
                  </Notice>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-6">
                <Button size="lg" onClick={join} busy={busy} busyLabel="Joining…" iconAfter="arrow">
                  Open the article
                </Button>
                <Link href="/library" className="link text-[0.9375rem] text-ink-3">
                  Not now
                </Link>
              </div>
              <p className="mt-5 max-w-xl text-sm text-ink-3">
                It asks for full screen. Leaving the tab or window is noted under published rules — one accident never invalidates a result. Up to {capS} s of
                delivery delay is given back.
              </p>
            </div>
          ) : phase.k === "queue" ? (
            <Ticket t={phase.t} windowS={windowS} onLeave={leave} />
          ) : phase.k === "starting" ? (
            <div className="flex items-center gap-3 rounded-[18px] bg-mint px-5 py-4">
              <span className="h-2 w-2 rounded-full bg-teal" style={{ animation: "ticker 1.2s infinite" }} aria-hidden />
              <p className="font-serif text-xl">Admitted — opening the article…</p>
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
    </>
  );
}

function Ticket({ t, windowS, onLeave }: { t: TicketView; windowS: number; onLeave: () => void }) {
  const closesIn = t.windowClosesAt ? Math.max(0, (t.windowClosesAt - t.serverNow) / 1000) : 0;
  const ordering = t.position === null;
  return (
    <div>
      <p className="eyebrow">Fair entry · ticket</p>
      <div className="on-abyss mt-4 grid grid-cols-[minmax(0,1fr)_auto] overflow-hidden rounded-[24px] shadow-doc">
        <div className="p-6">
          <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-sky">{ordering ? "Window open" : "Your place"}</p>
          <p className="num mono mt-2 text-[4rem] leading-none tracking-[-0.04em] text-on-dark">
            {ordering ? "—" : t.ahead === 0 ? "Next" : `#${(t.ahead ?? 0) + 1}`}
          </p>
          <p className="mt-3 text-sm text-on-dark-2">
            {ordering
              ? `Everyone joining in this ${t.mode === "fair" ? `${windowS}-second window` : "moment"} is being ordered — ${closesIn.toFixed(1)} s left.`
              : t.ahead === 0
                ? `You're next — admitted as soon as one of the ${t.concurrency} sessions in progress finishes (about ${mmss(t.estWaitSec)}).`
                : `${t.ahead} ahead of you · about ${mmss(t.estWaitSec)}`}
          </p>
        </div>
        <dl className="w-36 space-y-3 border-l border-dashed border-white/20 p-5 text-xs">
          <div>
            <dt className="text-2xs uppercase tracking-[0.14em] text-on-dark-2">Ticket</dt>
            <dd className="mono mt-0.5 text-on-dark">{t.ticketId.slice(0, 8)}</dd>
          </div>
          <div>
            <dt className="text-2xs uppercase tracking-[0.14em] text-on-dark-2">Window</dt>
            <dd className="mono mt-0.5 break-all text-on-dark">{t.windowId ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-2xs uppercase tracking-[0.14em] text-on-dark-2">In session</dt>
            <dd className="num mono mt-0.5 text-on-dark">
              {t.inService}/{t.concurrency}
            </dd>
          </div>
          <div>
            <dt className="text-2xs uppercase tracking-[0.14em] text-on-dark-2">Order</dt>
            <dd className="mt-0.5 text-on-dark">{t.mode === "fair" ? "Shuffled" : "Arrival"}</dd>
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
