import { afterEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { hashReceipt, validateClaims, type EvidenceExtraction } from "@graspchain/shared";
import type { Llm } from "../src/evaluator/llm";
import { GOOD_A1, harness, login, parseSse, startSession, type Harness } from "./helpers";

let h: Harness | null = null;
afterEach(async () => {
  await h?.close();
  h = null;
});

const A1_TEXT_PASTE =
  "Because every level depends on the one below it, changing even one character in one record changes that record's hash, every parent hash above it, and finally the root.";

/** A browser instance of the integrity monitor, as the web app sends it. */
function monitor(hh: Harness, cookie: string, sid: string) {
  const clientId = crypto.randomUUID();
  let seq = 0;
  const send = (events: { type: string; phase?: string; detail?: Record<string, unknown> }[], over: Record<string, unknown> = {}) =>
    hh.app.inject({
      method: "POST",
      url: `/api/session/${sid}/integrity`,
      headers: { cookie },
      payload: {
        clientId,
        lastSeq: seq + events.length,
        events: events.map((e) => ({ seq: ++seq, type: e.type, phase: e.phase ?? "writing", clientAt: Date.now(), detail: e.detail ?? {} })),
        ...over,
      },
    });
  /** Let time pass with the page open: one heartbeat every 20 s, as the web app does. */
  const wait = async (ms: number) => {
    for (let left = ms; left > 0; left -= 20_000) {
      hh.clock.t += Math.min(20_000, left);
      await send([]);
    }
  };
  return { clientId, send, wait, start: () => send([{ type: "MONITOR_START", phase: "reading" }]) };
}

async function read(hh: Harness, c: string, sid: string) {
  await hh.app.inject({ method: "GET", url: `/api/session/${sid}/article`, headers: { cookie: c } });
  await hh.app.inject({ method: "POST", url: `/api/session/${sid}/render-ack`, headers: { cookie: c } });
  await hh.app.inject({ method: "POST", url: `/api/session/${sid}/finish-reading`, headers: { cookie: c } });
}

async function submit(hh: Harness, c: string, sid: string, answer = GOOD_A1) {
  const r = await hh.app.inject({
    method: "POST",
    url: `/api/session/${sid}/submit`,
    headers: { cookie: c, accept: "text/event-stream" },
    payload: { answer, idempotencyKey: crypto.randomUUID(), pasteCount: 0, blurCount: 0, copyCount: 0 },
  });
  return parseSse(r.body);
}

const scoreOf = (ev: { type: string; data: any }[]) => ev.find((e) => e.type === "score")!.data;

describe("integrity is recorded server-side and assessed separately from comprehension", () => {
  it("a monitored session with realistic writing time is certified", async () => {
    h = await harness();
    const c = await login(h.app, "DEMO-02");
    const sid = await startSession(h, c);
    const m = monitor(h, c, sid);
    expect((await m.start()).statusCode).toBe(200);
    await read(h, c, sid);
    for (let i = 0; i < 12; i++) {
      h.clock.t += 20_000; // heartbeats while writing for four minutes
      await m.send([]);
    }
    const s = scoreOf(await submit(h, c, sid));
    expect(s.integrity).toMatchObject({ status: "NORMAL", outcome: "CERTIFIED", monitored: true });
    const receipt = (await h.app.inject({ method: "GET", url: `/api/result/${s.attemptId}/receipt`, headers: { cookie: c } })).json();
    expect(receipt.assessment.integrity).toMatchObject({ status: "NORMAL", outcome: "CERTIFIED", rulesVersion: "integrity-rules@1" });
    expect(receipt.assessment.integrity.eventsHash).toMatch(/^[0-9a-f]{64}$/);
    const rec = (await h.app.inject({ method: "GET", url: `/api/result/${s.attemptId}`, headers: { cookie: c } })).json();
    expect(await hashReceipt(receipt)).toBe(rec.record.recordHash);
  });

  it("pasting the article text is decisive: same comprehension score, but NOT_CERTIFIED and excluded from progress", async () => {
    h = await harness();
    const c = await login(h.app, "DEMO-02");
    const sid = await startSession(h, c);
    const m = monitor(h, c, sid);
    await m.start();
    await read(h, c, sid);
    h.clock.t += 60_000;
    await m.send([{ type: "PASTE_ATTEMPT", detail: { sample: A1_TEXT_PASTE } }]);
    const stored = h.ctx.integrity.events(sid).find((e) => e.type === "SUSPICIOUS_PASTE")!;
    expect(stored.detail).toMatchObject({ matchesArticle: true });
    expect(stored.detail.sample).toBeUndefined(); // the pasted text itself is not kept
    await m.wait(4 * 60_000);
    const s = scoreOf(await submit(h, c, sid));
    expect(s.finalScore).toBeGreaterThanOrEqual(7); // comprehension is judged on the answer, unchanged
    expect(s.integrity).toMatchObject({ status: "COMPROMISED", outcome: "NOT_CERTIFIED" });
    await new Promise((r) => setTimeout(r, 50));
    const profile = (await h.app.inject({ method: "GET", url: "/api/profile/me", headers: { cookie: c } })).json();
    expect(profile.stats.count).toBe(0);
    const lib = (await h.app.inject({ method: "GET", url: "/api/articles", headers: { cookie: c } })).json();
    expect(lib.articles.find((a: { id: string }) => a.id === "A1").bestScore).toBeNull();
  });

  it("records requests for the article after it closed (outside the grace window)", async () => {
    h = await harness();
    const c = await login(h.app, "DEMO-02");
    const sid = await startSession(h, c);
    await read(h, c, sid);
    h.clock.t += 30_000;
    expect((await h.app.inject({ method: "GET", url: `/api/session/${sid}/article`, headers: { cookie: c } })).statusCode).toBe(403);
    const e = h.ctx.integrity.events(sid).find((x) => x.type === "ARTICLE_ACCESS_ATTEMPT")!;
    expect(e).toMatchObject({ source: "server", phase: "writing", detail: { withinGrace: false } });
  });

  it("closes the re-read bypass: a new session expires the one in progress", async () => {
    h = await harness();
    const c = await login(h.app, "DEMO-02");
    const first = await startSession(h, c);
    await read(h, c, first);
    const second = await startSession(h, c);
    const s1 = (await h.app.inject({ method: "GET", url: `/api/session/${first}`, headers: { cookie: c } })).json();
    expect(s1.state).toBe("EXPIRED");
    const r = await h.app.inject({
      method: "POST",
      url: `/api/session/${first}/submit`,
      headers: { cookie: c },
      payload: { answer: GOOD_A1, idempotencyKey: "k-1234567890" },
    });
    expect(r.statusCode).toBe(409);
    expect(h.ctx.integrity.events(first).map((e) => e.type)).toContain("SESSION_ABANDONED");
    expect((await h.app.inject({ method: "GET", url: "/api/session/active", headers: { cookie: c } })).json().session.sessionId).toBe(second);
  });

  it("treats forged or malformed reports as tampering", async () => {
    h = await harness();
    const c = await login(h.app, "DEMO-02");
    const sid = await startSession(h, c);
    const m = monitor(h, c, sid);
    // A client may not report server-only facts, e.g. claim its own paste was harmless.
    const r = await m.send([{ type: "SUSPICIOUS_PASTE" }]);
    expect(r.statusCode).toBe(400);
    expect(h.ctx.integrity.events(sid).find((e) => e.type === "SESSION_TAMPERING")!.detail.reason).toBe("malformed_report");
  });

  it("detects reports announced but never delivered, a second tab, and time away", async () => {
    h = await harness();
    const c = await login(h.app, "DEMO-02");
    const sid = await startSession(h, c);
    const a = monitor(h, c, sid);
    await a.start();
    await read(h, c, sid);
    await a.send([], { lastSeq: 4 }); // says 4 events exist; only 1 ever arrived
    const b = monitor(h, c, sid);
    h.clock.t += 2 * 60_000; // two minutes with no contact, then a new page instance
    await b.start();
    h.clock.t += 5_000;
    await a.send([], { lastSeq: 4 }); // the older tab is still alive
    const types = h.ctx.integrity.events(sid).map((e) => e.type);
    expect(types).toContain("UNMONITORED_GAP");
    expect(types).toContain("MULTIPLE_TAB");
    await b.wait(3 * 60_000);
    const s = scoreOf(await submit(h, c, sid));
    const codes = s.integrity.findings.map((f: { code: string }) => f.code);
    expect(codes).toEqual(expect.arrayContaining(["SESSION_TAMPERING", "MULTIPLE_TAB", "UNMONITORED_GAP"]));
    expect(s.integrity.status).toBe("INTEGRITY_RISK");
  });

  it("a teacher can clear an integrity flag with a reason; the original record is untouched", async () => {
    h = await harness();
    const c = await login(h.app, "DEMO-02");
    const sid = await startSession(h, c);
    await read(h, c, sid);
    const s = scoreOf(await submit(h, c, sid)); // no monitor → REVIEW_REQUIRED
    await new Promise((r) => setTimeout(r, 50));
    expect(s.integrity.outcome).toBe("REVIEW_REQUIRED");
    const t = await login(h.app, "TEACH-01");
    const q = (await h.app.inject({ method: "GET", url: "/api/teacher/queue", headers: { cookie: t } })).json();
    const item = q.queue.find((i: { attemptId: string }) => i.attemptId === s.attemptId);
    expect(item.reasons.join(" ")).toContain("Integrity");
    const r = await h.app.inject({
      method: "POST",
      url: `/api/teacher/review/${item.assessmentId}`,
      headers: { cookie: t },
      payload: { integrityDecision: "CLEARED", reason: "Checked with the student: the monitor was blocked by a school proxy." },
    });
    expect(r.statusCode).toBe(200);
    const res = (await h.app.inject({ method: "GET", url: `/api/result/${s.attemptId}`, headers: { cookie: c } })).json();
    expect(res.integrity).toMatchObject({ outcome: "CERTIFIED", status: "INTEGRITY_RISK", review: { decision: "CLEARED" } });
    expect(res.score.finalScore).toBe(s.finalScore);
    expect(res.lineage).toHaveLength(2);
  });
});

describe("evidence judge end to end (fake extractor; Groq is only called in production)", () => {
  const A1 = (h: Harness) => h.ctx.articles.get("A1")!;

  function extractor(fn: (claims: { claimId: string; text: string }[]) => EvidenceExtraction | Promise<never>): Llm {
    return {
      provider: "groq",
      model: "openai/gpt-oss-120b",
      segment: async () => ({ claims: [], tokens: 0, cached: false }),
      feedback: async () => ({ raw: null, tokens: 0, cached: false }),
      baselineScore: async () => ({ score: 5, cached: false }),
      extractEvidence: async (input) => ({ raw: await fn(input.claims), tokens: 1200, cached: false, model: "groq/openai/gpt-oss-120b" }),
    };
  }

  it("classifies from verified evidence, scores in code and binds the evidence trail into the receipt", async () => {
    const claims = validateClaims(null, GOOD_A1).claims;
    const quoteFor: Record<string, [string, string]> = {
      c2: ["s3", "Pairs of fingerprints are then hashed together"],
      c3: ["s4", "changing even one character in one record changes that record's hash"],
      c4: ["s7", "the handful of sibling hashes on its path to the root"],
      c5: ["s10", "An organisation can publish only the root, keeping its data private"],
    };
    const llm = extractor((cs) => ({
      claims: cs.map((c) => ({
        claimId: c.claimId,
        relation: quoteFor[c.claimId] ? "SUPPORTED" : "NOT_FOUND",
        evidence: quoteFor[c.claimId] ? [{ sentenceId: quoteFor[c.claimId][0], quote: quoteFor[c.claimId][1] }] : [],
        keyPointIds: [],
        explainsHowOrWhy: c.claimId === "c3",
        note: "",
      })),
      keyPoints: [{ keyPointId: "kp2", depth: "EXPLAINED", studentQuote: "editing a single record changes its hash and every parent hash" }],
      centralIdea: { stated: true, studentQuote: "a Merkle tree lets anyone check that a log has not been rewritten" },
      addressesGrader: { present: false, studentQuote: null },
    }));
    h = await harness({ JUDGE: "evidence", LLM_PROVIDER: "groq", LLM_MODEL: "openai/gpt-oss-120b", GROQ_API_KEY: "test" }, { llm });
    expect(claims.length).toBeGreaterThan(3);
    const c = await login(h.app, "DEMO-02");
    const sid = await startSession(h, c);
    await read(h, c, sid);
    const s = scoreOf(await submit(h, c, sid));
    expect(s.judge.kind).toBe("evidence");
    expect(s.judge.model).toBe("graspchain-evidence-judge@1+groq/openai/gpt-oss-120b");
    const kp = Object.fromEntries(s.evidence.keyPoints.map((k: { id: string; classification: string }) => [k.id, k.classification]));
    expect(kp).toEqual({ kp1: "PARTIALLY_UNDERSTOOD", kp2: "UNDERSTOOD", kp3: "PARTIALLY_UNDERSTOOD", kp4: "PARTIALLY_UNDERSTOOD" });
    expect(s.labels).toEqual({ kp1: "vague", kp2: "correct", kp3: "vague", kp4: "vague" });
    expect(s.lowConfidence).toBe(false);
    await new Promise((r) => setTimeout(r, 50));
    const receipt = (await h.app.inject({ method: "GET", url: `/api/result/${s.attemptId}/receipt`, headers: { cookie: c } })).json();
    expect(receipt.assessment.evidence).toMatchObject({ judge: "graspchain-evidence-judge@1", classifications: kp });
    expect(receipt.assessment.models.jev).toBe(s.judge.model);
    expect(A1(h).id).toBe("A1");
  });

  it("an extractor failure delays the attempt instead of inventing a result", async () => {
    const llm = extractor(() => Promise.reject(new Error("503 over capacity")));
    h = await harness({ JUDGE: "evidence", LLM_PROVIDER: "groq", LLM_MODEL: "openai/gpt-oss-120b", GROQ_API_KEY: "test" }, { llm });
    const c = await login(h.app, "DEMO-02");
    const sid = await startSession(h, c);
    await read(h, c, sid);
    const ev = await submit(h, c, sid);
    expect(ev.some((e) => e.type === "score")).toBe(false);
    expect(ev.find((e) => e.type === "error")!.data.code).toBe("EVALUATION_DELAYED");
    expect((h.ctx.db.prepare("SELECT status, error FROM attempts").get() as { status: string; error: string }).error).toContain("EVIDENCE_ERROR");
  });
});
