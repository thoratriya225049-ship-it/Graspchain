"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INTEGRITY_LIMITS, createSseParser, wordCount } from "@graspchain/shared";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Bits";
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
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [windowActive, setWindowActive] = useState(true);

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
      window.setTimeout(() => setNotices((xs) => xs.filter((x) => x.id !== n.id)), 7000);
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
        <p className="eyebrow">Session expired</p>
        <h1 className="mt-3 font-serif text-2xl">This session is no longer open.</h1>
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
        <div className="sticky top-0 z-20 border-b border-rule bg-paper">
          <div className="h-[3px] w-full bg-paper-deep" aria-hidden>
            <div
              className={`h-full origin-left ${low ? "bg-signal" : "bg-ink"} transition-[width] duration-200 ease-linear`}
              style={{ width: `${frac * 100}%` }}
            />
          </div>
          <div className="frame flex h-14 items-center justify-between gap-4">
            <div className="flex items-baseline gap-3" role="timer" aria-live="off">
              <span className={`num mono text-xl ${low ? "text-signal-ink" : "text-ink"}`}>{remaining === null ? "–:––" : clock(remaining)}</span>
              <span className="hidden text-sm text-ink-3 sm:inline">left to read</span>
            </div>
            <p className="hidden text-xs text-ink-3 md:block">
              {session.clockMode === "fair"
                ? acked
                  ? `Fair clock · delivery delay of ${((session.latencyCompMs ?? 0) / 1000).toFixed(1)} s added back`
                  : "Fair clock · measuring delivery…"
                : "Server clock only (comparison mode)"}
            </p>
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
          {low && phase === "reading" ? (
            <p className="frame pb-2 text-xs text-signal-ink" role="status">
              The article closes in {Math.ceil((remaining ?? 0) / 1000)} seconds.
            </p>
          ) : null}
        </div>
        {article ? (
          <article
            className="gc-protected frame-narrow relative pb-32 pt-12 md:pt-16"
            style={phase === "closing" ? { animation: "article-out 600ms var(--ease-in-out) forwards" } : undefined}
            aria-label="Article"
          >
            <p className="eyebrow">Read carefully · it won&rsquo;t come back</p>
            <h1 className="mt-4 font-serif text-2xl leading-[1.1] md:text-[2.625rem]">{article.title}</h1>
            <p className="mt-3 text-sm text-ink-3">{article.wordCount} words</p>
            <div className={`prose-article mt-10 transition-[filter] duration-150 ${windowActive ? "" : "blur-md"}`}>
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <Watermark text={`${studentCode} · ${sessionId.slice(0, 8)}`} />
            {!windowActive && phase === "reading" ? (
              <div className="absolute inset-0 z-10 flex items-start justify-center bg-paper/70 pt-40" role="status">
                <p className="max-w-sm border-l-2 border-warn-mark bg-paper px-4 py-2 text-sm text-ink-2">
                  The article is hidden while this window is not active. Click here to continue — the clock keeps running.
                </p>
              </div>
            ) : null}
            <MonitorNote />
          </article>
        ) : null}
        <Notices notices={notices} />
      </div>
    );

  // Writing and submitting
  return (
    <div className="frame-narrow pb-24 pt-12 md:pt-16">
      <Notices notices={notices} />
      {fullscreenSupported && !fullscreen && phase === "writing" ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-l-2 border-rule-strong py-1 pl-4 text-sm text-ink-2">
          <span>You are not in full screen. Leaving the window or tab while writing is recorded.</span>
          <Button size="sm" variant="quiet" onClick={() => void requestFullscreen()}>
            Return to full screen
          </Button>
        </div>
      ) : null}
      {notice ? (
        <div className="mb-8">
          <Notice tone="ink">{notice}</Notice>
        </div>
      ) : null}
      <p className="eyebrow">The article has closed</p>
      <h1 className="mt-4 font-serif text-2xl leading-[1.12] md:text-[2.375rem]">What is this article about, and why does it matter?</h1>
      <p className="mt-3 text-md text-ink-2">Explain it in your own words, as if to someone who hasn&rsquo;t read it.</p>

      <div className="mt-10">
        <label htmlFor="answer" className="sr-only">
          Your explanation
        </label>
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
          className="block w-full resize-y border-0 border-y border-ink bg-transparent px-0 py-6 font-serif text-[1.1875rem] leading-[1.7] text-ink placeholder:text-ink-3/60 focus:outline-none focus-visible:outline-none"
          placeholder="Start with the article's central idea, then explain how it works and why it matters…"
        />
        <WordMeter words={words} min={minWords} max={maxWords} />
        {touched && wordError ? (
          <p className="mt-2 text-sm text-bad" role="alert">
            {wordError}
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
        <p className="max-w-sm text-xs text-ink-3">
          Pasting is disabled. Leaving the tab or window, clipboard use and similar events are recorded. They never change your comprehension score, but long or
          repeated absences can mean a teacher must review your result before it counts.
        </p>
        <Button size="lg" onClick={submit} busy={phase === "submitting"} disabled={!!wordError && touched} iconAfter="arrow">
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
        <span className="text-xs text-ink-3">· the time you are away is recorded</span>
      </p>
      <div className="mt-8">
        <MonitorNote />
      </div>
    </div>
  );
}

/** Faint, repeated identity mark over the article: a screenshot or photo stays attributable. */
function Watermark({ text }: { text: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden select-none">
      <div className="absolute -inset-1/4 flex rotate-[-24deg] flex-wrap content-start gap-x-16 gap-y-20 opacity-[0.06]">
        {Array.from({ length: 60 }, (_, i) => (
          <span key={i} className="mono whitespace-nowrap text-sm text-ink">
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
          className={`max-w-md border-l-2 bg-paper-raised px-4 py-2 text-sm shadow-doc ${n.tone === "bad" ? "border-bad-mark text-bad" : n.tone === "warn" ? "border-warn-mark text-ink" : "border-ink text-ink"}`}
        >
          {n.message}
        </p>
      ))}
    </div>
  );
}

/** What is recorded, and — stated plainly — what a browser cannot see. */
function MonitorNote() {
  return (
    <details className="relative z-[2] mt-12 border-t border-rule pt-4 text-xs text-ink-3">
      <summary className="cursor-pointer">What this assessment records</summary>
      <p className="mt-3">
        While this page is open it records: leaving the tab or window (and for how long), leaving full screen, copy, paste and print attempts (all blocked),
        screenshot and developer-tool shortcuts, reloads, a second tab with this session, and device-clock jumps. A blocked paste is compared with the article
        on the server and then discarded. The server separately records requests for the article after it closes and any time the page is out of contact.
      </p>
      <p className="mt-2">Each event is rated by published rules. One accidental event never invalidates a result.</p>
      <p className="mt-2">A browser cannot detect:</p>
      <ul className="mt-1 list-disc pl-5">
        {INTEGRITY_LIMITS.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </details>
  );
}

function WordMeter({ words, min, max }: { words: number; min: number; max: number }) {
  const pct = Math.min(100, (words / max) * 100);
  const ok = words >= min && words <= max;
  return (
    <div id="wc" className="mt-3">
      <div className="relative h-1 bg-paper-deep" aria-hidden>
        <div className={`h-full ${ok ? "bg-ink" : words > max ? "bg-bad-mark" : "bg-ink-3"}`} style={{ width: `${pct}%` }} />
        <div className="absolute -top-1 h-3 w-px bg-ink-2" style={{ left: `${(min / max) * 100}%` }} />
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
