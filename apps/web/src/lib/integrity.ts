import type { ClientEventType } from "@graspchain/shared";
import { newKey } from "./http";

/**
 * Browser-side integrity monitor for one assessment session.
 *
 * What it does: records what a web page can genuinely observe (tab visibility, window focus,
 * full screen, clipboard and drag, print, a few keyboard shortcuts, other tabs of the same
 * session, reloads, device-clock jumps) and blocks what a page can genuinely block (copying the
 * article, pasting into the answer, the context menu on the article, print/save shortcuts).
 *
 * What it does not do: it cannot stop or detect a photo of the screen, a second device, OS-level
 * screenshot tools that keep focus, or a determined user with a modified browser. Reports carry
 * sequence numbers and double as the heartbeat, so a blocked or stripped report is detectable on
 * the server; severity is always decided by the server's published rules, never here.
 */

type Phase = "reading" | "writing";
type Detail = Record<string, string | number | boolean | null>;
interface Pending {
  seq: number;
  type: ClientEventType;
  phase: Phase;
  clientAt: number;
  detail: Detail;
}
interface Stored {
  clientId: string;
  lastSeq: number;
  events: Pending[];
}

export interface MonitorNotice {
  id: number;
  message: string;
  tone: "ink" | "warn" | "bad";
}

const HEARTBEAT_MS = 20_000;
const CLOCK_CHECK_MS = 5_000;
const CLOCK_JUMP_MS = 5_000;
const BULK_CHARS = 40;

const secs = (ms: number) => (ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${Math.round(ms / 60_000)} min`);

export class IntegrityMonitor {
  readonly clientId = newKey();
  private seq = 0;
  private queue: Pending[] = [];
  private phase: Phase = "reading";
  private started = false;
  private attached = false;
  private sending = false;
  private flushTimer: number | null = null;
  private intervals: number[] = [];
  private off: (() => void)[] = [];
  private channel: BroadcastChannel | null = null;
  private peers = new Set<string>();
  private hiddenAt: number | null = null;
  private blurAt: number | null = null;
  private hiddenDuringBlur = false;
  private lastPrintShortcut = 0;
  private lastScreenshotKey = 0;
  private clockBase = 0;
  private internalClips: string[] = [];
  private noticeId = 0;
  private readonly storeKey: string;

  onNotice: ((n: MonitorNotice) => void) | null = null;
  onFullscreenChange: ((active: boolean) => void) | null = null;
  onActiveChange: ((active: boolean) => void) | null = null;

  constructor(private sessionId: string) {
    this.storeKey = `gc-integrity-${sessionId}`;
  }

  /** Attach listeners. Idempotent across React StrictMode's mount → unmount → mount. */
  attach(phase: Phase) {
    this.phase = phase;
    if (this.attached) return;
    this.attached = true;
    void this.flushLeftover();
    if (!this.started) {
      this.started = true;
      this.record("MONITOR_START", {
        fullscreenSupported: !!document.fullscreenEnabled,
        fullscreenActive: !!document.fullscreenElement,
        broadcastChannel: typeof BroadcastChannel !== "undefined",
        visible: document.visibilityState === "visible",
        focused: document.hasFocus(),
      });
      if (!document.fullscreenEnabled) this.record("FULLSCREEN_UNAVAILABLE", { reason: "not supported by this browser" });
      const nav = performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (nav?.type === "reload" && safePath(nav.name) === location.pathname) this.record("REFRESH", {});
    }
    const on = <K extends string>(target: EventTarget, type: K, fn: (e: Event) => void, capture = true) => {
      target.addEventListener(type, fn, capture);
      this.off.push(() => target.removeEventListener(type, fn, capture));
    };

    on(document, "visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.hiddenAt = Date.now();
        this.hiddenDuringBlur = true;
        this.onActiveChange?.(false);
        void this.flush(true); // tell the server now: a hidden tab is not a silent one
      } else if (this.hiddenAt !== null) {
        const ms = Date.now() - this.hiddenAt;
        this.hiddenAt = null;
        this.record("TAB_SWITCH", { hiddenMs: ms });
        this.notify(`You left the assessment tab for ${secs(ms)}. This is recorded.`, ms >= 15_000 ? "bad" : "warn");
        this.onActiveChange?.(document.hasFocus());
      }
    });
    on(window, "blur", () => {
      this.blurAt = Date.now();
      this.hiddenDuringBlur = document.visibilityState === "hidden";
      this.onActiveChange?.(false);
    });
    on(window, "focus", () => {
      if (this.blurAt !== null && !this.hiddenDuringBlur) {
        const ms = Date.now() - this.blurAt;
        this.record("WINDOW_BLUR", { blurMs: ms });
        if (ms >= 2000) this.notify(`Another window had focus for ${secs(ms)}. This is recorded.`, ms >= 30_000 ? "bad" : "warn");
      }
      this.blurAt = null;
      this.hiddenDuringBlur = false;
      this.onActiveChange?.(true);
    });
    on(document, "fullscreenchange", () => {
      const active = !!document.fullscreenElement;
      this.onFullscreenChange?.(active);
      if (!active) this.record("FULLSCREEN_EXIT", {});
    });

    // Clipboard: the article can never be copied; while writing, the student may move their own
    // text around inside the answer box (copy/cut there is remembered and may be pasted back).
    const onCopy = (e: Event) => {
      const ce = e as ClipboardEvent;
      const el = document.activeElement;
      if (this.phase === "writing" && el instanceof HTMLTextAreaElement && el.id === "answer") {
        const sel = el.value.slice(el.selectionStart, el.selectionEnd);
        if (sel) this.internalClips = [...this.internalClips.slice(-9), sel];
        return;
      }
      ce.preventDefault();
      this.record("COPY_ATTEMPT", { via: ce.type });
      this.notify("Copying is disabled during the assessment. The attempt is recorded.", "warn");
    };
    on(document, "copy", onCopy);
    on(document, "cut", onCopy);
    on(document, "dragstart", (e) => {
      if (this.phase !== "reading") return;
      e.preventDefault();
      this.record("COPY_ATTEMPT", { via: "drag" });
    });
    on(document, "contextmenu", (e) => {
      if (this.phase !== "reading") return; // while writing the menu offers spelling suggestions
      e.preventDefault();
      this.record("CONTEXT_MENU", {});
    });

    on(window, "keydown", (e) => this.onKey(e as KeyboardEvent));
    on(window, "keyup", (e) => {
      const k = e as KeyboardEvent;
      if (k.key === "PrintScreen" || k.code === "PrintScreen") this.screenshotKey("PrintScreen");
    });
    on(window, "beforeprint", () => {
      if (Date.now() - this.lastPrintShortcut > 1500) this.record("PRINT_ATTEMPT", { via: "menu" });
    });
    on(window, "pagehide", () => {
      this.record("PAGE_EXIT", { whileHidden: document.visibilityState === "hidden" }, false);
      void this.flush(true);
    });

    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(`gc-session-${this.sessionId}`);
      this.channel.onmessage = (m: MessageEvent<{ t: string; id: string }>) => {
        if (!m.data || m.data.id === this.clientId) return;
        if (m.data.t === "hello") this.channel?.postMessage({ t: "here", id: this.clientId });
        if (!this.peers.has(m.data.id)) {
          this.peers.add(m.data.id);
          this.record("MULTIPLE_TAB", { peers: this.peers.size });
          this.notify("This assessment is open in another tab or window. Close the other one; this is recorded.", "bad");
        }
      };
      this.channel.postMessage({ t: "hello", id: this.clientId });
    }

    this.clockBase = Date.now() - performance.now();
    this.intervals.push(
      window.setInterval(() => void this.flush(), HEARTBEAT_MS),
      window.setInterval(() => {
        const base = Date.now() - performance.now();
        if (Math.abs(base - this.clockBase) > CLOCK_JUMP_MS) this.record("CLOCK_ANOMALY", { jumpMs: Math.round(base - this.clockBase) });
        this.clockBase = base;
      }, CLOCK_CHECK_MS),
    );
    void this.flush();
  }

  /** Detach listeners and send what is queued (route change, unmount). */
  detach() {
    if (!this.attached) return;
    this.attached = false;
    for (const f of this.off.splice(0)) f();
    for (const i of this.intervals.splice(0)) window.clearInterval(i);
    this.channel?.close();
    this.channel = null;
    void this.flush(true);
  }

  setPhase(phase: Phase) {
    this.phase = phase;
  }

  /** A paste or drop into the answer box. Returns true if it may proceed (the student's own text). */
  pasteAttempt(text: string, via: "paste" | "drop"): boolean {
    if (text && this.internalClips.includes(text)) return true;
    this.record("PASTE_ATTEMPT", { via, chars: text.length, sample: text.slice(0, 4000) });
    this.notify("Pasting is disabled during the assessment. The attempt is recorded.", "warn");
    return false;
  }

  /** Text that arrived in one input event without a paste: autofill, dictation, an extension or a script. */
  inputDelta(added: number, inputType: string | null) {
    if (added >= BULK_CHARS) this.record("BULK_INSERT", { chars: added, inputType });
  }

  record(type: ClientEventType, detail: Detail, schedule = true) {
    this.queue.push({ seq: ++this.seq, type, phase: this.phase, clientAt: Date.now(), detail });
    this.persist();
    if (schedule && this.flushTimer === null) this.flushTimer = window.setTimeout(() => void this.flush(), 400);
  }

  /** Send everything queued and wait (used right before submitting). */
  async flushNow() {
    for (let i = 0; i < 3 && this.queue.length; i++) await this.flush();
  }

  private onKey(e: KeyboardEvent) {
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    const devtools =
      e.key === "F12" ||
      (mod && e.shiftKey && ["i", "j", "c"].includes(k)) ||
      (e.metaKey && e.altKey && ["i", "j", "c", "u"].includes(k)) ||
      (e.ctrlKey && !e.shiftKey && k === "u");
    if (devtools) {
      e.preventDefault(); // browsers may still open them; the attempt is what is recorded
      this.record("DEVTOOLS_SHORTCUT", { key: combo(e) });
      this.notify("Developer tools are not allowed during the assessment. The attempt is recorded.", "bad");
    } else if (mod && k === "s") {
      e.preventDefault();
      this.record("CAPTURE_SHORTCUT", { action: "save" });
    } else if (mod && k === "p") {
      e.preventDefault();
      this.lastPrintShortcut = Date.now();
      this.record("PRINT_ATTEMPT", { via: "shortcut" });
      this.notify("Printing is disabled during the assessment. The attempt is recorded.", "warn");
    } else if (e.key === "PrintScreen" || (e.metaKey && e.shiftKey && ["3", "4", "5"].includes(e.key))) {
      this.screenshotKey(combo(e));
    }
  }

  private screenshotKey(key: string) {
    if (Date.now() - this.lastScreenshotKey < 1000) return;
    this.lastScreenshotKey = Date.now();
    this.record("SCREENSHOT_KEY", { key });
    this.notify("A screenshot key was pressed. This is recorded.", this.phase === "reading" ? "bad" : "warn");
  }

  private notify(message: string, tone: MonitorNotice["tone"]) {
    this.onNotice?.({ id: ++this.noticeId, message, tone });
  }

  private persist() {
    try {
      const s: Stored = { clientId: this.clientId, lastSeq: this.seq, events: this.queue };
      sessionStorage.setItem(this.storeKey, JSON.stringify(s));
    } catch {
      /* storage unavailable: reports are still sent from memory */
    }
  }

  /** Reports a previous page instance queued but could not send (e.g. it was reloaded). */
  private async flushLeftover() {
    let prev: Stored | null = null;
    try {
      prev = JSON.parse(sessionStorage.getItem(this.storeKey) ?? "null") as Stored | null;
    } catch {
      prev = null;
    }
    if (!prev || prev.clientId === this.clientId || !prev.events?.length) return;
    const ok = await this.post({ clientId: prev.clientId, lastSeq: prev.lastSeq, visibility: "visible", events: prev.events.slice(0, 50) }, false);
    if (ok) this.persist();
  }

  private async flush(keepalive = false) {
    if (this.flushTimer !== null) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.sending && !keepalive) return;
    this.sending = true;
    const batch = this.queue.slice(0, 50);
    const ok = await this.post(
      { clientId: this.clientId, lastSeq: this.seq, visibility: document.visibilityState === "hidden" ? "hidden" : "visible", events: batch },
      keepalive,
    );
    if (ok) {
      const sent = new Set(batch.map((b) => b.seq));
      this.queue = this.queue.filter((q) => !sent.has(q.seq));
      this.persist();
    }
    this.sending = false;
  }

  private async post(body: Stored & { visibility: string }, keepalive: boolean): Promise<boolean> {
    try {
      const res = await fetch(`/api/session/${this.sessionId}/integrity`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        keepalive,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch {
      return false; // kept in the queue (and in sessionStorage) and retried with the next heartbeat
    }
  }
}

function combo(e: KeyboardEvent) {
  return [e.ctrlKey && "Ctrl", e.metaKey && "Meta", e.altKey && "Alt", e.shiftKey && "Shift", e.key].filter(Boolean).join("+");
}

function safePath(u: string) {
  try {
    return new URL(u).pathname;
  } catch {
    return "";
  }
}

/** Ask for full screen. Must run inside a user gesture; failure is recorded by the monitor, not fatal. */
export function requestFullscreen(): Promise<boolean> {
  const el = document.documentElement;
  if (!document.fullscreenEnabled || !el.requestFullscreen) return Promise.resolve(false);
  if (document.fullscreenElement) return Promise.resolve(true);
  return el.requestFullscreen({ navigationUI: "hide" }).then(
    () => true,
    () => false,
  );
}
