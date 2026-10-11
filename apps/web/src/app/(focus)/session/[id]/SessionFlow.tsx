"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INTEGRITY_LIMITS, createSseParser, wordCount } from "@graspchain/shared";
import { motion, useScroll, useSpring } from "motion/react";
import { JourneySteps, JourneyThread } from "@/components/fx/JourneyThread";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Bits";
import { Icon } from "@/components/ui/Icon";
import { Reveal, Sheet } from "@/components/ui/Sheet";
import { call, newKey, store } from "@/lib/http";
import { IntegrityMonitor, requestFullscreen, type MonitorNotice } from "@/lib/integrity";
import type { SessionView } from "@/lib/types";

interface ArticlePayload {
  title: string;
  sentences: string[];
  breaks: number[];
  wordCount: number;
  sentAt: number;
  readDeadline: number;
  readSeconds: number;
  clockMode: "fair" | "naive";
  serverNow: number;
}

type Phase = "loading" | "reading" | "closing" | "writing" | "submitting" | "expired" | "error";

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function SessionFlow({
  sessionId,
  initial,
  demoTools,
  minWords,
  maxWords,
  studentCode,
}: {
  sessionId: string;
  initial: SessionView;
  demoTools: boolean;
  minWords: number;
  maxWords: number;
  studentCode: string;
}) {
  const router = useRouter();
  const ss = store("session");
  const draftKey = `gc-draft-${sessionId}`;
  const idemKey = `gc-idem-${sessionId}`;

  const [phase, setPhase] = useState<Phase>("loading");
  const [article, setArticle] = useState<ArticlePayload | null>(null);
  const [session, setSession] = useState<SessionView>(initial);
  const [acked, setAcked] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const offset = useRef(0); // server − client clock
  const closing = useRef(false);

  // Integrity monitor: one per page instance (the ref survives StrictMode's double effects).
  const monitorRef = useRef<IntegrityMonitor | null>(null);
  monitorRef.current ??= new IntegrityMonitor(sessionId);
  const monitor = monitorRef.current;
  const [notices, setNotices] = useState<MonitorNotice[]>([]);
  const [noted, setNoted] = useState<{ id: MonitorNotice["id"]; message: string }[]>([]);
  const [tipsOpen, setTipsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [windowActive, setWindowActive] = useState(true);
  const [screenshotMask, setScreenshotMask] = useState(false);
  const screenshotTimer = useRef<number | null>(null);

  const [answer, setAnswer] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [samples, setSamples] = useState<{ label: string; text: string }[]>([]);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const internalPaste = useRef(false);

  const toWriting = useCallback(
    (message?: string) => {
      setArticle(null); // the text leaves React state and the DOM
      monitorRef.current?.setPhase("writing");
      if (message) setNotice(message);
      const saved = ss.get(draftKey);
      if (saved) setAnswer(saved);
      setPhase("writing");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftKey],
  );

  const close = useCallback(
    async (early: boolean) => {
      if (closing.current) return;
      closing.current = true;
      if (early) await call(`/api/session/${sessionId}/finish-reading`, { method: "POST" });
      setPhase("closing");
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.setTimeout(() => toWriting(early ? undefined : "Time is up — the article has closed."), reduce ? 0 : 620);
    },
    [sessionId, toWriting],
  );

  // Load: the server's *current* state decides between reading and writing. It is re-read here
  // (not taken from possibly cached page props), so this page never asks for an article that has
  // closed — any such request is recorded as an integrity event by the server.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fresh = await call<SessionView>(`/api/session/${sessionId}`);
      const state = fresh.ok ? fresh.data.state : initial.state;
      if (cancelled) return;
      if (fresh.ok) setSession(fresh.data);
      if ((state === "EVALUATING" || state === "DONE") && fresh.ok && fresh.data.attemptId) return router.replace(`/attempts/${fresh.data.attemptId}`);
      if (state === "EXPIRED") return setPhase("expired");
      if (state === "WRITING") return toWriting();
      const r = await call<ArticlePayload>(`/api/session/${sessionId}/article`);
      if (cancelled) return;
      if (r.status === 403) return toWriting("The reading period has ended, so the article is closed.");
      if (!r.ok) {
        setError(r.error!.message);
        return setPhase("error");
      }
      offset.current = r.data.serverNow - Date.now();
      setArticle(r.data);
      setSession((s) => ({ ...s, readDeadline: r.data.readDeadline, sentAt: r.data.sentAt, state: "READING" }));
      setPhase("reading");
      // FairClock: acknowledge once the article has painted (two frames).
      requestAnimationFrame(() =>
        requestAnimationFrame(async () => {
          const ack = await call<SessionView>(`/api/session/${sessionId}/render-ack`, { method: "POST" });
          if (cancelled) return;
          if (ack.ok) {
            offset.current = ack.data.serverNow - Date.now();
            setSession(ack.data);
          }
          setAcked(true); // without an ack the server's provisional deadline (send time + cap) still applies
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "reading") return;
    const i = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(i);
  }, [phase]);

  // Integrity monitoring for the whole page life. Its reports are also the heartbeat: a closed
  // tab stops reporting, so its FairGate slot is freed for the next student.
  const monitoring = phase !== "expired" && phase !== "error";
  useEffect(() => {
    if (!monitoring) return;
    monitor.onNotice = (n) => {
      setNotices((xs) => [...xs.slice(-2), n]);
      setNoted((xs) => [...xs, { id: n.id, message: n.message }]);
      window.setTimeout(() => setNotices((xs) => xs.filter((x) => x.id !== n.id)), 7000);
    };
    monitor.onScreenshotAttempt = () => {
      setScreenshotMask(true);
      if (screenshotTimer.current) window.clearTimeout(screenshotTimer.current);
      screenshotTimer.current = window.setTimeout(() => setScreenshotMask(false), 3500);
    };
    monitor.onFullscreenChange = setFullscreen;
    monitor.onActiveChange = setWindowActive;
    setFullscreenSupported(!!document.fullscreenEnabled);
    setFullscreen(!!document.fullscreenElement);
    setWindowActive(document.visibilityState === "visible" && document.hasFocus());
    monitor.attach(phase === "writing" || phase === "submitting" ? "writing" : "reading");
    // A page restored from the back/forward cache re-checks the server before showing anything.
    const onShow = (e: PageTransitionEvent) => e.persisted && window.location.reload();
    window.addEventListener("pageshow", onShow);
    return () => {
      if (screenshotTimer.current) window.clearTimeout(screenshotTimer.current);
      window.removeEventListener("pageshow", onShow);
      monitor.detach();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitoring, monitor]);

  const remaining = session.readDeadline ? session.readDeadline - (now + offset.current) : null;
  useEffect(() => {
    if (phase === "reading" && acked && remaining !== null && remaining <= 0) void close(false);
  }, [phase, acked, remaining, close]);

  // Writing: focus, sample answers on demo deployments.
  useEffect(() => {
    if (phase !== "writing") return;
    textRef.current?.focus();
    if (demoTools)
      void call<{ samples: { label: string; text: string }[] }>(`/api/session/${sessionId}/samples`).then((r) => r.ok && setSamples(r.data.samples));
  }, [phase, demoTools, sessionId]);

  useEffect(() => {
    if (phase !== "writing") return;
    const t = window.setTimeout(() => ss.set(draftKey, answer), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer, phase]);

  const words = wordCount(answer);
  const wordError =
    words < minWords
      ? `At least ${minWords} words — ${minWords - words} to go.`
      : words > maxWords
        ? `At most ${maxWords} words — ${words - maxWords} over.`
        : null;

  async function submit() {
    setTouched(true);
    if (wordError) return;
    setPhase("submitting");
    setSubmitError(null);
    const key = ss.get(idemKey) ?? newKey();
    ss.set(idemKey, key); // a refresh or double click re-sends the same key and re-attaches
    await monitor.flushNow(); // integrity events up to this moment reach the server before the answer
    const ac = new AbortController();
    let attemptId: string | null = null;
    try {
      const res = await fetch(`/api/session/${sessionId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        // No integrity counts here: the server counts only the events it recorded itself.
        body: JSON.stringify({ answer, idempotencyKey: key }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Submission failed (${res.status}).`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      const feed = createSseParser((type, data) => {
        if (type === "accepted" && !attemptId) attemptId = (data as { attemptId: string }).attemptId;
      });
      while (!attemptId) {
        const { value, done } = await reader.read();
        if (done) break;
        feed(dec.decode(value, { stream: true }));
      }
      ac.abort(); // the result page re-attaches to the same evaluation
      if (!attemptId) throw new Error("The server closed the connection before accepting the answer. Your draft is saved — try again.");
      ss.set(draftKey, null);
      router.replace(`/attempts/${attemptId}`);
    } catch (e) {
      if (attemptId) return router.replace(`/attempts/${attemptId}`);
      const m = (e as Error).message;
      setSubmitError(m === "Failed to fetch" ? "Couldn't reach Graspchain. Your draft is saved on this device — try again." : m);
      setPhase("writing");
    }
  }

  const paragraphs = useMemo(() => {
    if (!article) return [];
    const starts = [0, ...article.breaks.filter((b) => b > 0 && b < article.sentences.length)];
    return starts.map((s, i) => article.sentences.slice(s, starts[i + 1] ?? article.sentences.length).join(" "));
  }, [article]);

  const totalMs = (session.readSeconds ?? 60) * 1000 + (session.latencyCompMs ?? 0);
  const frac = remaining === null ? 1 : Math.max(0, Math.min(1, remaining / totalMs));
  const low = remaining !== null && remaining < 15_000;

  if (phase === "loading")
    return (
      <div className="frame-narrow pt-24" aria-busy="true">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton mt-6 h-10 w-4/5" />
        <div className="mt-10 space-y-3">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="skeleton h-4" style={{ width: `${92 - (i % 3) * 9}%` }} />
          ))}
        </div>
        <p className="sr-only">Loading the article</p>
      </div>
    );

  if (phase === "error")
    return (
      <div className="frame-narrow pt-24">
        <Notice tone="bad" title="This session couldn't load">
          {error}
        </Notice>
        <ButtonLink href="/library" variant="secondary" className="mt-8">
          Back to the library
        </ButtonLink>
      </div>
    );

  if (phase === "expired")
    return (
      <div className="frame-narrow pt-24">
        <p className="eyebrow">Session closed</p>
        <h1 className="display mt-3 text-[clamp(2rem,4vw,2.75rem)]">This session is no longer open.</h1>
        <p className="mt-4 text-ink-2">
          Sessions close if the article is never opened, or if no answer arrives within the writing window. Start again for a fresh session.
        </p>
        <ButtonLink href={`/start/${session.articleId}`} className="mt-8">
          Start again
        </ButtonLink>
      </div>
    );

  if (phase === "reading" || phase === "closing")
    return (
      <div>
        <JourneyThread stage="understand" />
        <div className="sticky top-0 z-20 border-b border-rule bg-paper/95">
          <div className="frame flex h-16 items-center justify-between gap-4">
            <FairClock remaining={remaining} frac={frac} low={low} acked={acked} mode={session.clockMode} compMs={session.latencyCompMs ?? 0} />
            <div className="flex items-center gap-2">
              {fullscreenSupported && !fullscreen ? (
                <Button size="sm" variant="quiet" onClick={() => void requestFullscreen()}>
                  Full screen
                </Button>
              ) : null}
              <Button size="sm" variant="secondary" onClick={() => close(true)} disabled={phase === "closing"}>
                I&rsquo;m done reading
              </Button>
            </div>
          </div>
          <ReadProgress />
        </div>
        {article ? (
          <article
            className="gc-protected frame-narrow relative pb-32 pt-12 md:pt-16"
            style={phase === "closing" ? { animation: "article-out 600ms var(--ease-in-out) forwards" } : undefined}
            aria-label="Article"
          >
            <JourneySteps stage="understand" className="mb-8" />
            <p className="eyebrow">Read carefully · it won&rsquo;t come back</p>
            <h1 className="display mt-4 text-[clamp(2rem,4.5vw,2.75rem)] leading-[1.08]">{article.title}</h1>
            <p className="mt-3 text-sm text-ink-3">{article.wordCount} words</p>
            <div
              className={`prose-article mt-10 transition-[filter,opacity] duration-150 ${
                !windowActive || (fullscreenSupported && !fullscreen) || screenshotMask ? "pointer-events-none select-none opacity-10 blur-2xl" : ""
              }`}
            >
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <Watermark text={`${studentCode} · ${sessionId.slice(0, 8)}`} />
            {screenshotMask && phase === "reading" ? (
              <Overlay role="alert" title="The article is hidden for a moment" tone="warn">
                Screen-capture shortcuts aren&rsquo;t allowed while reading, so the text is covered briefly. This was noted in your assessment record.
              </Overlay>
            ) : null}
            {fullscreenSupported && !fullscreen && phase === "reading" && !screenshotMask ? (
              <Overlay role="alert" title="Full screen to read" tone="ink">
                The article only shows in full screen. Leaving full screen is noted in your record — one accident never invalidates a result.
                <Button size="md" className="mt-5 w-full" onClick={() => void requestFullscreen()}>
                  Return to full screen
                </Button>
              </Overlay>
            ) : null}
            {!windowActive && fullscreen && phase === "reading" && !screenshotMask ? (
              <div className="absolute inset-0 z-10 flex items-start justify-center bg-paper/70 pt-40" role="status">
                <p className="max-w-sm rounded-[14px] bg-paper-raised px-4 py-3 text-sm text-ink-2 shadow-lift ring-1 ring-rule">
                  The article is hidden while this window isn&rsquo;t active. Click here to continue — the clock keeps running.
                </p>
              </div>
            ) : null}
            <IntegrityTimeline noted={noted} />
          </article>
        ) : null}
        <Notices notices={notices} />
      </div>
    );

  // Writing and submitting
  return (
    <>
      <JourneyThread stage="evidence" />
      <div className="frame-narrow pb-24 pt-10 md:pt-14">
        <Notices notices={notices} />
        <JourneySteps stage="evidence" className="mb-8" />
        {fullscreenSupported && !fullscreen && phase === "writing" ? (
          <div className="mb-6">
            <Notice
              tone="none"
              action={
                <Button size="sm" variant="quiet" onClick={() => void requestFullscreen()}>
                  Return to full screen
                </Button>
              }
            >
              You&rsquo;re not in full screen. Leaving the window or tab while writing is noted.
            </Notice>
          </div>
        ) : null}
        {notice ? (
          <div className="mb-8">
            <Notice tone="ink">{notice}</Notice>
          </div>
        ) : null}
        <div className="flex items-start justify-between gap-4">
          <p className="eyebrow">The article has closed</p>
          <button
            type="button"
            onClick={() => setTipsOpen(true)}
            className="-mt-1.5 inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-teal hover:bg-mint"
          >
            <Icon name="info" size={15} /> How to answer well
          </button>
        </div>
        <h1 className="display mt-3 text-[clamp(2rem,4.5vw,2.625rem)] leading-[1.1]">What is it about, and why does it matter?</h1>
        <p className="mt-3 text-md text-ink-2">Explain it in your own words, as if to someone who hasn&rsquo;t read it.</p>

        <div className="mt-10">
          <label htmlFor="answer" className="sr-only">
            Your explanation
          </label>
          <div className="rounded-[24px] bg-paper-raised p-1 ring-1 ring-rule transition-shadow duration-300 focus-within:shadow-[0_0_0_4px_rgb(171_155_203/0.35)] focus-within:ring-lavender">
            <textarea
              id="answer"
              ref={textRef}
              value={answer}
              onChange={(e) => {
                const added = e.target.value.length - answer.length;
                if (!internalPaste.current) monitor.inputDelta(added, (e.nativeEvent as InputEvent).inputType ?? null);
                internalPaste.current = false;
                setAnswer(e.target.value);
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text/plain");
                if (monitor.pasteAttempt(text, "paste")) internalPaste.current = true;
                else e.preventDefault();
              }}
              onDrop={(e) => {
                const text = e.dataTransfer.getData("text/plain");
                if (monitor.pasteAttempt(text, "drop")) internalPaste.current = true;
                else e.preventDefault();
              }}
              disabled={phase === "submitting"}
              rows={12}
              aria-invalid={touched && !!wordError}
              aria-describedby="wc"
              className="block w-full resize-y rounded-[20px] border-0 border-l-[3px] border-lavender bg-lavender/[0.06] px-5 py-5 font-serif text-[1.1875rem] leading-[1.75] text-ink caret-[#7e6aa8] placeholder:text-ink-3/60 focus:outline-none focus-visible:shadow-none focus-visible:outline-none"
              placeholder="Start with the central idea, then explain how it works and why it matters…"
            />
          </div>
          <WordMeter words={words} min={minWords} max={maxWords} />
          {touched && wordError ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-bad" role="alert">
              <Icon name="alert" size={14} /> {wordError}
            </p>
          ) : null}
        </div>

        {submitError ? (
          <div className="mt-6">
            <Notice tone="bad" title="Not submitted">
              {submitError}
            </Notice>
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-6">
          <p className="max-w-sm text-xs text-ink-3">Pasting is off. Events like leaving the tab are noted; they never change your comprehension score.</p>
          <Button size="lg" onClick={submit} busy={phase === "submitting"} busyLabel="Sending…" disabled={!!wordError && touched} iconAfter="arrow">
            Submit for assessment
          </Button>
        </div>

        {samples.length && phase === "writing" ? (
          <details className="mt-14 border-t border-rule pt-4">
            <summary className="cursor-pointer text-sm text-ink-3">Demo helper · insert a prepared answer (demo deployments only)</summary>
            <div className="mt-4 flex flex-wrap gap-3">
              {samples.map((s) => (
                <Button
                  key={s.label}
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    monitor.record("BULK_INSERT", { chars: s.text.length, inputType: "demo-sample" });
                    setAnswer(s.text);
                  }}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </details>
        ) : null}
        <p className="mt-10 text-sm">
          <Link href="/home" className="link text-ink-3">
            Save draft and leave
          </Link>{" "}
          <span className="text-xs text-ink-3">· the time you are away is noted</span>
        </p>
        <IntegrityTimeline noted={noted} />
      </div>

      <Sheet
        open={tipsOpen}
        onClose={() => setTipsOpen(false)}
        title="How to answer well"
        description="The article stays closed — that is what makes every result comparable."
      >
        <ol className="space-y-6">
          {[
            ["Start with the central idea", "One sentence: what is the article mostly about?"],
            ["Explain how it works", "Link two ideas with because, so, which means. Mechanisms count more than terms."],
            ["Say why it matters", "What changes, or what goes wrong without it?"],
            ["Use your own words", "Phrases reproduced word for word from the article earn no credit."],
          ].map(([h, b], i) => (
            <li key={h} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-lavender/25 text-sm font-semibold text-ink">{i + 1}</span>
              <div>
                <p className="font-medium text-ink">{h}</p>
                <p className="mt-1 text-sm text-ink-2">{b}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-8 rounded-[14px] bg-mint px-4 py-3 text-sm text-ink-2">
          {minWords}–{maxWords} words. Your draft is saved on this device as you type.
        </p>
      </Sheet>
    </>
  );
}

/** FairClock: a thin ring and plain words. Calm by design — it never turns red. */
function FairClock({
  remaining,
  frac,
  low,
  acked,
  mode,
  compMs,
}: {
  remaining: number | null;
  frac: number;
  low: boolean;
  acked: boolean;
  mode: "fair" | "naive";
  compMs: number;
}) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="flex items-center gap-3"
      role="timer"
      aria-live="off"
      aria-label={remaining === null ? "Measuring delivery" : `${clock(remaining)} left to read`}
    >
      <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden className="-rotate-90">
        <circle cx="19" cy="19" r={r} fill="none" stroke="var(--color-mint)" strokeWidth="3" />
        <circle
          cx="19"
          cy="19"
          r={r}
          fill="none"
          stroke={low ? "#6ACCC6" : "#12708A"}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: "stroke-dashoffset 200ms linear" }}
        />
      </svg>
      <div className="leading-tight">
        <p className="num mono text-lg text-ink">{remaining === null ? "–:––" : clock(remaining)}</p>
        <p className="text-xs text-ink-3" role={low ? "status" : undefined}>
          {low
            ? `Closes in ${Math.ceil((remaining ?? 0) / 1000)} s — finish your sentence`
            : mode === "fair"
              ? acked
                ? compMs > 0
                  ? `Time left · adjusted +${(compMs / 1000).toFixed(1)} s for delivery`
                  : "Time left · fair clock"
                : "Measuring delivery…"
              : "Time left · server clock (comparison mode)"}
        </p>
      </div>
    </div>
  );
}

/** Slim reading-progress line in the thread gradient. */
function ReadProgress() {
  const { scrollYProgress } = useScroll();
  const x = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  return <motion.div aria-hidden className="h-[2px] origin-left" style={{ scaleX: x, background: "var(--thread-x)" }} />;
}

function Overlay({ title, children, tone, role }: { title: string; children: React.ReactNode; tone: "warn" | "ink"; role: "alert" | "status" }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-start bg-paper/92 p-6 pt-32 text-center" role={role}>
      <div className="max-w-md rounded-[24px] bg-paper-raised p-7 shadow-doc ring-1 ring-rule">
        <span className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full ${tone === "warn" ? "bg-warn-wash text-warn" : "bg-mint text-teal"}`}>
          <Icon name={tone === "warn" ? "eye" : "lock"} size={18} />
        </span>
        <h2 className="mt-4 font-serif text-xl text-ink">{title}</h2>
        <div className="mt-2 text-sm text-ink-2">{children}</div>
      </div>
    </div>
  );
}

/** Faint, repeated identity mark over the article: a screenshot or photo stays attributable. */
function Watermark({ text }: { text: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] select-none overflow-hidden">
      <div className="absolute -inset-1/4 flex rotate-[-24deg] flex-wrap content-start gap-x-12 gap-y-16 opacity-[0.09]">
        {Array.from({ length: 72 }, (_, i) => (
          <span key={i} className="mono whitespace-nowrap text-xs font-semibold text-ink">
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}

function Notices({ notices }: { notices: MonitorNotice[] }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex flex-col items-center gap-2 px-4">
      {notices.map((n) => (
        <p
          key={n.id}
          className="flex max-w-md animate-rise items-center gap-2.5 rounded-full bg-paper-raised px-4 py-2 text-sm text-ink shadow-lift ring-1 ring-rule"
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${n.tone === "bad" || n.tone === "warn" ? "bg-warn-mark" : "bg-teal"}`} aria-hidden />
          {n.message}
        </p>
      ))}
    </div>
  );
}

/** Integrity, on demand: a quiet timeline of what this page has noted, plus what it records and cannot see. */
function IntegrityTimeline({ noted }: { noted: { id: MonitorNotice["id"]; message: string }[] }) {
  return (
    <div className="relative z-[2] mt-14">
      <Reveal summary="Assessment conditions" meta={noted.length ? `${noted.length} noted` : "nothing noted"}>
        <ol className="relative space-y-4 pl-6">
          <span aria-hidden className="absolute bottom-1 left-[5px] top-1 w-px bg-rule" />
          <li className="relative text-sm">
            <span className="absolute -left-6 top-1.5 h-[11px] w-[11px] rounded-full bg-ok-mark" aria-hidden />
            <span className="font-medium text-ok">Monitoring on</span>{" "}
            <span className="text-ink-3">· tab and window focus, full screen, clipboard, print, reloads</span>
          </li>
          {noted.map((n) => (
            <li key={n.id} className="relative text-sm">
              <span className="absolute -left-6 top-1.5 h-[11px] w-[11px] rounded-full bg-warn-mark" aria-hidden />
              <span className="font-medium text-warn">Noted</span> <span className="text-ink-2">· {n.message}</span>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-xs text-ink-3">
          Each event is rated by published rules, separately from comprehension. One accident never invalidates a result. A blocked paste is compared with the
          article on the server, then discarded.
        </p>
        <p className="mt-3 text-xs text-ink-3">A browser cannot detect:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink-3">
          {INTEGRITY_LIMITS.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Reveal>
    </div>
  );
}

function WordMeter({ words, min, max }: { words: number; min: number; max: number }) {
  const pct = Math.min(100, (words / max) * 100);
  const ok = words >= min && words <= max;
  return (
    <div id="wc" className="mt-4">
      <div className="relative h-1.5 rounded-full bg-mint" aria-hidden>
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${ok ? "bg-lavender" : words > max ? "bg-warn-mark" : "bg-peri"}`}
          style={{ width: `${pct}%` }}
        />
        <div className="absolute -top-1 h-3.5 w-px bg-ink-3" style={{ left: `${(min / max) * 100}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs">
        <span className={`num mono ${ok ? "text-ink" : "text-ink-3"}`}>
          {words} {words === 1 ? "word" : "words"}
        </span>
        <span className="text-ink-3">
          {min}–{max}
        </span>
      </div>
    </div>
  );
}
