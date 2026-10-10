import { z } from "zod";
import type { CopyAnalysis } from "./copy";

/**
 * ASSESSMENT INTEGRITY — what the assessment conditions were, kept separate from what the
 * student understood. Events are recorded by the browser monitor and by the server; this file
 * turns them into a status with fixed, published rules. Nothing here changes the comprehension
 * score: integrity decides whether that score is certified.
 *
 * What a browser can and cannot observe is stated in INTEGRITY_LIMITS and shown to users.
 */

export const INTEGRITY_RULES_VERSION = "integrity-rules@1";

/** Events the browser monitor may report. Anything else in a report is treated as tampering. */
export const CLIENT_EVENT_TYPES = [
  "MONITOR_START",
  "COPY_ATTEMPT",
  "CONTEXT_MENU",
  "PASTE_ATTEMPT",
  "BULK_INSERT",
  "TAB_SWITCH",
  "WINDOW_BLUR",
  "FULLSCREEN_EXIT",
  "FULLSCREEN_UNAVAILABLE",
  "MULTIPLE_TAB",
  "REFRESH",
  "PAGE_EXIT",
  "PRINT_ATTEMPT",
  "SCREENSHOT_KEY",
  "DEVTOOLS_SHORTCUT",
  "CAPTURE_SHORTCUT",
  "CLOCK_ANOMALY",
] as const;
/** Events only the server records (the browser cannot forge or suppress them). */
export const SERVER_EVENT_TYPES = [
  "SUSPICIOUS_PASTE",
  "ARTICLE_ACCESS_ATTEMPT",
  "ARTICLE_REFETCH",
  "UNMONITORED_GAP",
  "SESSION_TAMPERING",
  "SESSION_ABANDONED",
] as const;
export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];
export type IntegrityEventType = ClientEventType | (typeof SERVER_EVENT_TYPES)[number] | "MULTIPLE_TAB";

export type Severity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IntegrityPhase = "reading" | "writing" | "other";
export type IntegrityStatus = "NORMAL" | "WARNING" | "SUSPICIOUS" | "INTEGRITY_RISK" | "COMPROMISED";
export type IntegrityOutcome = "CERTIFIED" | "CERTIFIED_WITH_NOTES" | "REVIEW_REQUIRED" | "NOT_CERTIFIED";

export type DetailValue = string | number | boolean | null;

export interface IntegrityEvent {
  id?: number;
  type: IntegrityEventType;
  source: "client" | "server";
  phase: IntegrityPhase;
  /** Server receive time (ms). The server's clock is the only one trusted. */
  at: number;
  clientAt: number | null;
  clientId: string | null;
  seq: number | null;
  detail: Record<string, DetailValue>;
}

/** Body of POST /api/session/:id/integrity (also the heartbeat). Strict: unknown fields fail. */
export const IntegrityReportBody = z
  .object({
    clientId: z.string().uuid(),
    lastSeq: z.number().int().min(0).max(100_000),
    visibility: z.enum(["visible", "hidden"]).default("visible"),
    events: z
      .array(
        z
          .object({
            seq: z.number().int().min(1).max(100_000),
            type: z.enum(CLIENT_EVENT_TYPES),
            phase: z.enum(["reading", "writing"]),
            clientAt: z.number().finite(),
            detail: z
              .record(z.string().max(32), z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()]))
              .refine((d) => Object.keys(d).length <= 12, "too many detail fields")
              .default({}),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();
export type IntegrityReport = z.infer<typeof IntegrityReportBody>;

export const SEVERITY_POINTS: Record<Severity, number> = { INFO: 0, LOW: 1, MEDIUM: 3, HIGH: 8, CRITICAL: 20 };
/** LOW events are individually innocent; together they can reach SUSPICIOUS but never more. */
export const LOW_POINTS_CAP = 6;

export const STATUS_THRESHOLDS: { status: IntegrityStatus; from: number; meaning: string }[] = [
  { status: "NORMAL", from: 0, meaning: "Nothing of note was recorded." },
  { status: "WARNING", from: 1, meaning: "Minor events, consistent with accidents. No effect on the result." },
  { status: "SUSPICIOUS", from: 4, meaning: "Several events, or one meaningful one. The result stands, with notes for the teacher." },
  { status: "INTEGRITY_RISK", from: 8, meaning: "Strong evidence the conditions were not controlled. The result is provisional until a teacher reviews it." },
  { status: "COMPROMISED", from: 20, meaning: "Decisive evidence (or an accumulation) that the conditions were broken. The result is not certified." },
];

export const OUTCOME_OF: Record<IntegrityStatus, IntegrityOutcome> = {
  NORMAL: "CERTIFIED",
  WARNING: "CERTIFIED",
  SUSPICIOUS: "CERTIFIED_WITH_NOTES",
  INTEGRITY_RISK: "REVIEW_REQUIRED",
  COMPROMISED: "NOT_CERTIFIED",
};

export const OUTCOME_COPY: Record<IntegrityOutcome, { title: string; body: string }> = {
  CERTIFIED: { title: "Certified", body: "The comprehension score is the result of this assessment." },
  CERTIFIED_WITH_NOTES: { title: "Certified with notes", body: "The score stands. The integrity notes are visible to your teacher." },
  REVIEW_REQUIRED: {
    title: "Provisional — teacher review required",
    body: "The answer was assessed, but the conditions need a teacher's review before this score counts toward your progress.",
  },
  NOT_CERTIFIED: {
    title: "Not certified",
    body: "The answer was assessed, but the assessment conditions were not trustworthy, so this score is not a certified result and does not count toward your progress.",
  },
};

/** Stated honestly to students and teachers: what browser monitoring cannot see. */
export const INTEGRITY_LIMITS = [
  "A photo of the screen taken with another device.",
  "A second device, notes on paper, or another person in the room.",
  "Screenshot tools that capture without moving focus away from the page (some OS shortcuts are not delivered to web pages).",
  "Screen sharing or recording started before the assessment (browsers do not tell a page it is being captured).",
  "A modified browser or a script that fakes the monitor's reports. Missing or malformed reports are detected; perfect forgeries are not.",
];

export const EVENT_COPY: Record<IntegrityEventType, string> = {
  MONITOR_START: "Integrity monitoring started",
  COPY_ATTEMPT: "Copy attempt (blocked)",
  CONTEXT_MENU: "Right-click menu on the article (blocked)",
  PASTE_ATTEMPT: "Paste attempt (blocked)",
  SUSPICIOUS_PASTE: "Suspicious paste attempt (blocked)",
  BULK_INSERT: "Large block of text inserted at once",
  TAB_SWITCH: "Switched away from the assessment tab",
  WINDOW_BLUR: "Assessment window lost focus",
  FULLSCREEN_EXIT: "Left full screen",
  FULLSCREEN_UNAVAILABLE: "Full screen unavailable or declined",
  MULTIPLE_TAB: "Assessment open in more than one tab",
  REFRESH: "Page reloaded",
  PAGE_EXIT: "Page closed or navigated away",
  PRINT_ATTEMPT: "Print attempt (blocked)",
  SCREENSHOT_KEY: "Screenshot key pressed",
  DEVTOOLS_SHORTCUT: "Developer-tools or view-source shortcut",
  CAPTURE_SHORTCUT: "Save-page shortcut (blocked)",
  CLOCK_ANOMALY: "Device clock jumped",
  ARTICLE_ACCESS_ATTEMPT: "Article requested after it closed (refused)",
  ARTICLE_REFETCH: "Article loaded again during reading",
  UNMONITORED_GAP: "Time with no contact from the assessment page",
  SESSION_TAMPERING: "Monitoring reports tampered with or missing",
  SESSION_ABANDONED: "Session replaced by a newer one",
};

/** Names for findings derived from several facts (not single events). */
export const FINDING_COPY: Record<string, string> = {
  REPEATED_FOCUS_LOSS: "Repeatedly left the assessment",
  REPEATED_COPY_ATTEMPTS: "Repeated copy attempts",
  IMPLAUSIBLE_TYPING_SPEED: "Implausible writing speed",
  COPIED_SOURCE_TEXT: "Article text copied word for word",
  MONITORING_ABSENT: "No monitoring from the assessment page",
  SEEDED_DEMO: "Seeded demo answer",
  REPEATED_FULLSCREEN_EXIT: "Repeatedly left full screen",
};

export const findingTitle = (code: string) => (EVENT_COPY as Record<string, string>)[code] ?? FINDING_COPY[code] ?? code.replace(/_/g, " ").toLowerCase();

const num = (v: DetailValue | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const secs = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${(ms / 60_000).toFixed(1)} min`);

/** Severity of one event, with the reason in words. Pure and published. */
export function classifyEvent(e: Pick<IntegrityEvent, "type" | "phase" | "detail">): { severity: Severity; reason: string } {
  const d = e.detail;
  const reading = e.phase === "reading";
  if (e.phase === "other") return { severity: "INFO", reason: "Outside the reading and writing phases." };
  switch (e.type) {
    case "MONITOR_START":
    case "FULLSCREEN_UNAVAILABLE":
    case "SESSION_ABANDONED":
    case "CONTEXT_MENU":
      return { severity: "INFO", reason: "Recorded for context; carries no weight." };
    case "ARTICLE_REFETCH":
      return { severity: "INFO", reason: "Allowed while reading (e.g. after a reload); the server deadline is unchanged." };
    case "PAGE_EXIT":
      return { severity: "INFO", reason: "The time away, if any, is weighed as a gap with no contact." };
    case "COPY_ATTEMPT":
      return reading
        ? { severity: "LOW", reason: "Tried to copy article text; it was blocked." }
        : { severity: "INFO", reason: "Copying while writing; the article is not on screen." };
    case "PASTE_ATTEMPT":
      return { severity: "LOW", reason: `Tried to paste ${num(d.words) ?? 0} words; it was blocked.` };
    case "SUSPICIOUS_PASTE":
      return d.matchesArticle === true
        ? { severity: "CRITICAL", reason: "Tried to paste text that matches the article: the article text was available outside the assessment." }
        : { severity: "MEDIUM", reason: `Tried to paste a large block (${num(d.words) ?? "?"} words) from elsewhere; it was blocked.` };
    case "BULK_INSERT":
      return { severity: "LOW", reason: `${num(d.chars) ?? "?"} characters arrived in one input (autofill, dictation, an extension or a script).` };
    case "TAB_SWITCH": {
      const ms = num(d.hiddenMs);
      if (ms === null) return { severity: "MEDIUM", reason: "Left the tab and did not come back to it." };
      return ms >= 60_000
        ? { severity: "HIGH", reason: `Away from the tab for ${secs(ms)}.` }
        : ms >= 15_000
          ? { severity: "MEDIUM", reason: `Away from the tab for ${secs(ms)}.` }
          : { severity: "LOW", reason: `Away from the tab for ${secs(ms)}.` };
    }
    case "WINDOW_BLUR": {
      const ms = num(d.blurMs) ?? 0;
      return ms >= 120_000
        ? { severity: "HIGH", reason: `Another window had focus for ${secs(ms)}.` }
        : ms >= 30_000
          ? { severity: "MEDIUM", reason: `Another window had focus for ${secs(ms)}.` }
          : ms >= 2_000
            ? { severity: "LOW", reason: `Another window had focus for ${secs(ms)}.` }
            : { severity: "INFO", reason: "Focus left for under 2 s (e.g. the address bar or a notification)." };
    }
    case "FULLSCREEN_EXIT": {
      const ms = num(d.exitMs);
      if (ms !== null && reading) {
        return ms >= 45_000
          ? { severity: "HIGH", reason: `Out of full screen while reading for ${secs(ms)}.` }
          : ms >= 15_000
            ? { severity: "MEDIUM", reason: `Out of full screen while reading for ${secs(ms)}.` }
            : { severity: "LOW", reason: `Left full screen for ${secs(ms)}.` };
      }
      return { severity: "LOW", reason: "Left full screen (Esc is easy to press by accident)." };
    }
    case "MULTIPLE_TAB":
      return { severity: "MEDIUM", reason: "The same session was open in two tabs or windows at once." };
    case "REFRESH":
      return { severity: "LOW", reason: "Reloaded the page; the server clock kept running." };
    case "PRINT_ATTEMPT":
      return reading
        ? { severity: "MEDIUM", reason: "Tried to print while the article was open." }
        : { severity: "LOW", reason: "Tried to print while writing." };
    case "SCREENSHOT_KEY":
      return reading
        ? { severity: "HIGH", reason: "Pressed the screenshot key while the article was on screen." }
        : { severity: "LOW", reason: "Pressed the screenshot key while writing (the article was closed)." };
    case "DEVTOOLS_SHORTCUT":
      return { severity: "MEDIUM", reason: `Pressed a developer-tools shortcut (${String(d.key ?? "?")}).` };
    case "CAPTURE_SHORTCUT":
      return reading
        ? { severity: "MEDIUM", reason: "Tried to save the page while the article was open." }
        : { severity: "LOW", reason: "Tried to save the page while writing." };
    case "CLOCK_ANOMALY":
      return { severity: "LOW", reason: "The device clock jumped (changed by hand, or the device slept). Timing is server-side, so it gave no extra time." };
    case "ARTICLE_ACCESS_ATTEMPT":
      return d.withinGrace === true
        ? { severity: "INFO", reason: "Requested at the moment the article closed (a timing race)." }
        : { severity: "MEDIUM", reason: "Requested the article after it closed. The server refused it." };
    case "UNMONITORED_GAP": {
      const ms = num(d.gapMs) ?? 0;
      return ms >= 300_000
        ? { severity: "HIGH", reason: `No contact from the assessment page for ${secs(ms)}.` }
        : ms >= 60_000
          ? { severity: "MEDIUM", reason: `No contact from the assessment page for ${secs(ms)}.` }
          : { severity: "LOW", reason: `No contact from the assessment page for ${secs(ms)}.` };
    }
    case "SESSION_TAMPERING":
      return d.reason === "event_flood"
        ? { severity: "MEDIUM", reason: "An implausible number of reports was sent; the rest were refused." }
        : d.reason === "reporting_gap"
          ? { severity: "HIGH", reason: `${num(d.missing) ?? "Some"} monitoring report(s) announced by the page never arrived (blocked or altered).` }
          : { severity: "HIGH", reason: "A monitoring report did not come from the assessment page as built (malformed or forged)." };
  }
}

export interface IntegrityFinding {
  code: string;
  severity: Severity;
  points: number;
  count: number;
  explanation: string;
  derived: boolean;
}

export interface IntegrityAssessment {
  rulesVersion: string;
  status: IntegrityStatus;
  outcome: IntegrityOutcome;
  points: number;
  monitored: boolean;
  seeded: boolean;
  findings: IntegrityFinding[];
  counts: Partial<Record<IntegrityEventType, number>>;
  eventCount: number;
  writing: { ms: number | null; wordsPerMinute: number | null };
  /** Set when a teacher reviewed the integrity record (receipt lineage). */
  review?: { decision: IntegrityDecision; reason: string; at: string } | null;
}

export type IntegrityDecision = "CLEARED" | "UPHELD";

export interface IntegrityInput {
  /** Events recorded up to submission. */
  events: IntegrityEvent[];
  seeded: boolean;
  wordCount: number;
  /** From the article closing to the submission (server clock), or null if unknown. */
  writingMs: number | null;
  /** Deterministic copy detection of the answer against the article (null: not run). */
  copy: Pick<CopyAnalysis, "ratio" | "copiedWords" | "totalWords" | "longestRun" | "level" | "policy"> | null;
  /** Per browser instance: the highest sequence number it announced and the ones that arrived. */
  clients: { clientId: string; lastSeqReported: number; receivedSeqs: number[] }[];
}

export const TYPING = { minWords: 40, mediumWpm: 90, highWpm: 150 };

export function statusFor(points: number, anyCritical: boolean): IntegrityStatus {
  if (anyCritical) return "COMPROMISED";
  let s: IntegrityStatus = "NORMAL";
  for (const t of STATUS_THRESHOLDS) if (points >= t.from) s = t.status;
  return s;
}

/** The integrity assessment. Pure: the same stored events always give the same status. */
export function assessIntegrity(input: IntegrityInput): IntegrityAssessment {
  const findings: IntegrityFinding[] = [];
  const counts: Partial<Record<IntegrityEventType, number>> = {};
  for (const e of input.events) counts[e.type] = (counts[e.type] ?? 0) + 1;

  // Per-event findings, grouped by (type, severity, reason) so the list stays readable.
  const groups = new Map<string, IntegrityFinding>();
  let multipleTabCounted = false;
  for (const e of input.events) {
    let { severity, reason } = classifyEvent(e);
    // One session open twice is one fact, however many times each tab reports it.
    if (e.type === "MULTIPLE_TAB" && severity !== "INFO") {
      if (multipleTabCounted) [severity, reason] = ["INFO", "The same multiple-tab situation, reported again."];
      multipleTabCounted = true;
    }
    const key = `${e.type}|${severity}|${reason}`;
    const g = groups.get(key);
    if (g) {
      g.count++;
      g.points += SEVERITY_POINTS[severity];
    } else groups.set(key, { code: e.type, severity, points: SEVERITY_POINTS[severity], count: 1, explanation: reason, derived: false });
  }
  findings.push(...groups.values());

  const atLeastLow = (e: IntegrityEvent) => classifyEvent(e).severity !== "INFO";
  const focusLosses = input.events.filter((e) => (e.type === "TAB_SWITCH" || e.type === "WINDOW_BLUR") && atLeastLow(e)).length;
  if (focusLosses >= 10)
    findings.push(derived("REPEATED_FOCUS_LOSS", "HIGH", `Left the assessment ${focusLosses} times. Repeated absences add up even when each is short.`));
  else if (focusLosses >= 5)
    findings.push(derived("REPEATED_FOCUS_LOSS", "MEDIUM", `Left the assessment ${focusLosses} times. Repeated absences add up even when each is short.`));

  const fullscreenExits = input.events.filter((e) => e.type === "FULLSCREEN_EXIT" && atLeastLow(e)).length;
  if (fullscreenExits >= 8)
    findings.push(
      derived("REPEATED_FULLSCREEN_EXIT", "HIGH", `Left full screen ${fullscreenExits} times. Controlled assessment environment was not maintained.`),
    );
  else if (fullscreenExits >= 5) findings.push(derived("REPEATED_FULLSCREEN_EXIT", "MEDIUM", `Left full screen ${fullscreenExits} times.`));

  const copies = input.events.filter((e) => e.type === "COPY_ATTEMPT" && e.phase === "reading").length;
  if (copies >= 3) findings.push(derived("REPEATED_COPY_ATTEMPTS", "MEDIUM", `Tried to copy article text ${copies} times.`));

  const wpm = input.writingMs !== null ? input.wordCount / (Math.max(input.writingMs, 1000) / 60_000) : null;
  if (!input.seeded && wpm !== null && input.wordCount >= TYPING.minWords) {
    if (wpm > TYPING.highWpm)
      findings.push(
        derived(
          "IMPLAUSIBLE_TYPING_SPEED",
          "HIGH",
          `${input.wordCount} words in ${secs(input.writingMs!)} (${Math.round(wpm)} words/min) is faster than anyone composes; the text was very likely inserted rather than written here.`,
        ),
      );
    else if (wpm > TYPING.mediumWpm)
      findings.push(
        derived(
          "IMPLAUSIBLE_TYPING_SPEED",
          "MEDIUM",
          `${input.wordCount} words in ${secs(input.writingMs!)} (${Math.round(wpm)} words/min) is faster than typical composition.`,
        ),
      );
  }

  // Copying is judged on the answer itself, so it applies to every attempt, monitored or not.
  const c = input.copy;
  if (c && c.level !== "none") {
    const what = `${Math.round(c.ratio * 100)}% of the answer (${c.copiedWords} of ${c.totalWords} words) is copied word for word from the article, in runs of ${c.policy.minRun}+ identical words (longest: ${c.longestRun}).`;
    if (c.level === "violation") findings.push(derived("COPIED_SOURCE_TEXT", "CRITICAL", `Significant source text copied: ${what}`));
    else if (c.level === "review") findings.push(derived("COPIED_SOURCE_TEXT", "HIGH", `Part of the answer is copied: ${what}`));
    else findings.push(derived("COPIED_SOURCE_TEXT", "LOW", `A short passage is copied: ${what}`));
  }

  const monitored = input.events.some((e) => e.type === "MONITOR_START" && e.source === "client");
  if (input.seeded)
    findings.push({
      code: "SEEDED_DEMO",
      severity: "INFO",
      points: 0,
      count: 1,
      explanation: "A prepared demo answer inserted by the seed script; it was not taken under monitored conditions.",
      derived: true,
    });
  else if (!monitored)
    findings.push(derived("MONITORING_ABSENT", "HIGH", "The assessment page never reported in: the answer was submitted without the monitored page running."));

  const flooded = input.events.some((e) => e.type === "SESSION_TAMPERING" && e.detail.reason === "event_flood");
  if (!flooded) {
    let missing = 0;
    for (const c of input.clients) {
      const got = new Set(c.receivedSeqs);
      for (let s = 1; s <= c.lastSeqReported; s++) if (!got.has(s)) missing++;
    }
    if (missing > 0)
      findings.push(
        derived("SESSION_TAMPERING", "HIGH", `${missing} monitoring report(s) announced by the page never arrived (blocked or altered in transit).`),
      );
  }

  // Points: LOW events are capped so that accidents alone can never exceed SUSPICIOUS.
  const lowPoints = findings.filter((f) => f.severity === "LOW").reduce((s, f) => s + f.points, 0);
  const otherPoints = findings.filter((f) => f.severity !== "LOW").reduce((s, f) => s + f.points, 0);
  const points = Math.min(LOW_POINTS_CAP, lowPoints) + otherPoints;
  const anyCritical = findings.some((f) => f.severity === "CRITICAL");
  const status = statusFor(points, anyCritical);
  const order: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
  findings.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || b.points - a.points);

  return {
    rulesVersion: INTEGRITY_RULES_VERSION,
    status,
    outcome: OUTCOME_OF[status],
    points,
    monitored,
    seeded: input.seeded,
    findings,
    counts,
    eventCount: input.events.length,
    writing: { ms: input.writingMs, wordsPerMinute: wpm === null ? null : Math.round(wpm) },
    review: null,
  };
}

function derived(code: string, severity: Severity, explanation: string): IntegrityFinding {
  return { code, severity, points: SEVERITY_POINTS[severity], count: 1, explanation, derived: true };
}

/** A teacher's decision on the integrity record never edits it; it sets the outcome. */
export function reviewedOutcome(a: Pick<IntegrityAssessment, "outcome">, decision: IntegrityDecision): IntegrityOutcome {
  return decision === "CLEARED" ? "CERTIFIED" : a.outcome === "CERTIFIED" || a.outcome === "CERTIFIED_WITH_NOTES" ? a.outcome : "NOT_CERTIFIED";
}

/** Does this outcome count toward progress, best scores and recommendations? */
export const countsTowardProgress = (o: IntegrityOutcome | null | undefined) => !o || o === "CERTIFIED" || o === "CERTIFIED_WITH_NOTES";

/** Longest run of consecutive words shared with the source (used for paste analysis). */
export function longestSharedRun(text: string, source: string): number {
  const w = (s: string) => s.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  const a = w(text);
  const b = w(source);
  let best = 0;
  const prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : 0;
      if (prev[j] > best) best = prev[j];
      diag = tmp;
    }
  }
  return best;
}
