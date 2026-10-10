import { describe, expect, it } from "vitest";
import { assessIntegrity, classifyEvent, longestSharedRun, reviewedOutcome, type IntegrityEvent, type IntegrityInput } from "../src/integrity";

let t = 1_000_000;
const ev = (
  type: IntegrityEvent["type"],
  detail: IntegrityEvent["detail"] = {},
  phase: IntegrityEvent["phase"] = "writing",
  source: "client" | "server" = "client",
): IntegrityEvent => ({
  type,
  source,
  phase,
  at: (t += 1000),
  clientAt: null,
  clientId: source === "client" ? "c-1" : null,
  seq: null,
  detail,
});
const START = ev("MONITOR_START", {}, "reading");

function input(events: IntegrityEvent[], over: Partial<IntegrityInput> = {}): IntegrityInput {
  return { events: [START, ...events], seeded: false, wordCount: 80, writingMs: 6 * 60_000, answerOverlap5: 0.05, clients: [], ...over };
}

describe("integrity: fair, explainable, evidence-based", () => {
  it("a clean monitored session is NORMAL and certified", () => {
    const a = assessIntegrity(input([]));
    expect(a).toMatchObject({ status: "NORMAL", outcome: "CERTIFIED", points: 0, monitored: true });
  });

  it("one accidental, brief tab switch is only a WARNING — never 'cheating'", () => {
    const a = assessIntegrity(input([ev("TAB_SWITCH", { hiddenMs: 3000 })]));
    expect(a).toMatchObject({ status: "WARNING", outcome: "CERTIFIED", points: 1 });
  });

  it("caps innocent-looking events: many LOW events alone never pass SUSPICIOUS", () => {
    const lows = [
      ev("FULLSCREEN_EXIT"),
      ev("REFRESH"),
      ev("FULLSCREEN_EXIT"),
      ev("CLOCK_ANOMALY"),
      ev("REFRESH"),
      ev("FULLSCREEN_EXIT"),
      ev("REFRESH"),
      ev("FULLSCREEN_EXIT"),
    ];
    const a = assessIntegrity(input(lows));
    expect(a.points).toBe(6);
    expect(a.status).toBe("SUSPICIOUS");
    expect(a.outcome).toBe("CERTIFIED_WITH_NOTES");
  });

  it("weighs duration: a 90-second absence while writing needs review", () => {
    expect(classifyEvent(ev("TAB_SWITCH", { hiddenMs: 90_000 })).severity).toBe("HIGH");
    const a = assessIntegrity(input([ev("TAB_SWITCH", { hiddenMs: 90_000 })]));
    expect(a).toMatchObject({ status: "INTEGRITY_RISK", outcome: "REVIEW_REQUIRED" });
  });

  it("repeated short absences accumulate", () => {
    const a = assessIntegrity(input(Array.from({ length: 10 }, () => ev("TAB_SWITCH", { hiddenMs: 4000 }))));
    expect(a.findings.find((f) => f.code === "REPEATED_FOCUS_LOSS")?.severity).toBe("HIGH");
    expect(a.status).toBe("INTEGRITY_RISK");
  });

  it("an attempt to paste the article text is decisive: COMPROMISED, not certified", () => {
    const a = assessIntegrity(input([ev("SUSPICIOUS_PASTE", { words: 60, matchesArticle: true }, "writing", "server")]));
    expect(a).toMatchObject({ status: "COMPROMISED", outcome: "NOT_CERTIFIED" });
  });

  it("a submission with no monitor running is an integrity risk", () => {
    const a = assessIntegrity({ events: [], seeded: false, wordCount: 80, writingMs: 600_000, answerOverlap5: 0, clients: [] });
    expect(a.findings[0].code).toBe("MONITORING_ABSENT");
    expect(a.status).toBe("INTEGRITY_RISK");
  });

  it("detects reports that were announced but never arrived (blocked or stripped)", () => {
    const a = assessIntegrity(input([], { clients: [{ clientId: "c-1", lastSeqReported: 5, receivedSeqs: [1, 2, 5] }] }));
    expect(a.findings.find((f) => f.code === "SESSION_TAMPERING")?.explanation).toContain("2 monitoring report");
    expect(a.status).toBe("INTEGRITY_RISK");
  });

  it("flags text that arrives faster than anyone composes", () => {
    const a = assessIntegrity(input([], { wordCount: 120, writingMs: 20_000 }));
    expect(a.findings.find((f) => f.code === "IMPLAUSIBLE_TYPING_SPEED")?.severity).toBe("HIGH");
    expect(assessIntegrity(input([], { wordCount: 120, writingMs: 5 * 60_000 })).status).toBe("NORMAL");
  });

  it("counts a multiple-tab situation once, however many tabs report it", () => {
    const a = assessIntegrity(input([ev("MULTIPLE_TAB"), ev("MULTIPLE_TAB"), ev("MULTIPLE_TAB", {}, "writing", "server")]));
    expect(a.points).toBe(3);
  });

  it("events after submission or outside the phases carry no weight", () => {
    expect(classifyEvent(ev("SCREENSHOT_KEY", {}, "other")).severity).toBe("INFO");
    expect(classifyEvent(ev("SCREENSHOT_KEY", {}, "reading")).severity).toBe("HIGH");
  });

  it("is deterministic and labels seeded demo data instead of inventing monitoring", () => {
    const i = input([ev("TAB_SWITCH", { hiddenMs: 20_000 })]);
    expect(assessIntegrity(i)).toEqual(assessIntegrity(i));
    const s = assessIntegrity({ events: [], seeded: true, wordCount: 60, writingMs: null, answerOverlap5: 0, clients: [] });
    expect(s).toMatchObject({ status: "NORMAL", monitored: false });
    expect(s.findings[0].code).toBe("SEEDED_DEMO");
  });

  it("a teacher can clear or uphold, and the outcome follows", () => {
    expect(reviewedOutcome({ outcome: "REVIEW_REQUIRED" }, "CLEARED")).toBe("CERTIFIED");
    expect(reviewedOutcome({ outcome: "REVIEW_REQUIRED" }, "UPHELD")).toBe("NOT_CERTIFIED");
  });

  it("finds the longest verbatim run", () => {
    expect(longestSharedRun("so anyone who saved yesterday's root can tell", "So anyone who saved yesterday's root can tell instantly")).toBe(8);
  });
});
