"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSseParser, wordCount } from "@graspchain/shared";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Bits";
import { call, newKey, store } from "@/lib/http";
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
}: {
  sessionId: string;
  initial: SessionView;
  demoTools: boolean;
  minWords: number;
  maxWords: number;
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
  const copies = useRef(0);

  const [answer, setAnswer] = useState("");
  const [pastes, setPastes] = useState(0);
  const [blurs, setBlurs] = useState(0);
  const [touched, setTouched] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [samples, setSamples] = useState<{ label: string; text: string }[]>([]);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const toWriting = useCallback(
    (message?: string) => {
      setArticle(null); // the text leaves React state and the DOM
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

  // Load: the server's state decides between reading and writing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (initial.state === "EXPIRED") return setPhase("expired");
      if (initial.state === "WRITING") return toWriting();
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
    const onCopy = () => (copies.current += 1);
    document.addEventListener("copy", onCopy);
    return () => {
      window.clearInterval(i);
      document.removeEventListener("copy", onCopy);
    };
  }, [phase]);

  // Heartbeat: a closed tab stops pinging, so its FairGate slot is freed for the next student.
  useEffect(() => {
    if (phase !== "reading" && phase !== "writing") return;
    const beat = () => void call(`/api/session/${sessionId}/heartbeat`, { method: "POST" });
    beat();
    const i = window.setInterval(beat, 30_000);
    return () => window.clearInterval(i);
  }, [phase, sessionId]);

  const remaining = session.readDeadline ? session.readDeadline - (now + offset.current) : null;
  useEffect(() => {
    if (phase === "reading" && acked && remaining !== null && remaining <= 0) void close(false);
  }, [phase, acked, remaining, close]);

  // Writing: counters, draft persistence, sample answers on demo deployments.
  useEffect(() => {
    if (phase !== "writing") return;
    const onBlur = () => setBlurs((b) => b + 1);
    window.addEventListener("blur", onBlur);
    textRef.current?.focus();
    if (demoTools)
      void call<{ samples: { label: string; text: string }[] }>(`/api/session/${sessionId}/samples`).then((r) => r.ok && setSamples(r.data.samples));
    return () => window.removeEventListener("blur", onBlur);
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
    const ac = new AbortController();
    let attemptId: string | null = null;
    try {
      const res = await fetch(`/api/session/${sessionId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ answer, idempotencyKey: key, pasteCount: pastes, blurCount: blurs, copyCount: copies.current }),
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
            <Button size="sm" variant="secondary" onClick={() => close(true)} disabled={phase === "closing"}>
              I&rsquo;m done reading
            </Button>
          </div>
          {low && phase === "reading" ? (
            <p className="frame pb-2 text-xs text-signal-ink" role="status">
              The article closes in {Math.ceil((remaining ?? 0) / 1000)} seconds.
            </p>
          ) : null}
        </div>
        {article ? (
          <article
            className="frame-narrow pb-32 pt-12 md:pt-16"
            style={phase === "closing" ? { animation: "article-out 600ms var(--ease-in-out) forwards" } : undefined}
            aria-label="Article"
          >
            <p className="eyebrow">Read carefully · it won&rsquo;t come back</p>
            <h1 className="mt-4 font-serif text-2xl leading-[1.1] md:text-[2.625rem]">{article.title}</h1>
            <p className="mt-3 text-sm text-ink-3">{article.wordCount} words</p>
            <div className="prose-article mt-10">
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </article>
        ) : null}
      </div>
    );

  // Writing and submitting
  return (
    <div className="frame-narrow pb-24 pt-12 md:pt-16">
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
          onChange={(e) => setAnswer(e.target.value)}
          onPaste={() => setPastes((p) => p + 1)}
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
          Pasting and switching away are counted and shown to your teacher as neutral notes. They never change your score.
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
              <Button key={s.label} variant="secondary" size="sm" onClick={() => setAnswer(s.text)}>
                {s.label}
              </Button>
            ))}
          </div>
        </details>
      ) : null}
      <p className="mt-10 text-sm">
        <Link href="/home" className="link text-ink-3">
          Save draft and leave
        </Link>
      </p>
    </div>
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
