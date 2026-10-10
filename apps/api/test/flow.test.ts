import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashReceipt } from "@graspchain/shared";
import { ADMIN_SECRET, GOOD_A1, INJECTION_A1, harness, login, parseSse, startSession, waitFor, type Harness } from "./helpers";

let h: Harness;
beforeEach(async () => {
  h = await harness();
});
afterEach(async () => {
  await h.close();
});

const submit = (cookie: string, sessionId: string, answer: string, key = "key-0000-0001", sse = true) =>
  h.app.inject({
    method: "POST",
    url: `/api/session/${sessionId}/submit`,
    headers: { cookie, ...(sse ? { accept: "text/event-stream" } : {}) },
    payload: { answer, idempotencyKey: key, pasteCount: 1, blurCount: 2, copyCount: 0 },
  });

async function readAndHide(cookie: string, sessionId: string) {
  const art = await h.app.inject({ method: "GET", url: `/api/session/${sessionId}/article`, headers: { cookie } });
  expect(art.statusCode).toBe(200);
  expect(art.headers["cache-control"]).toContain("no-store");
  h.clock.t += 1200;
  const ack = await h.app.inject({ method: "POST", url: `/api/session/${sessionId}/render-ack`, headers: { cookie } });
  expect(ack.json().latencyCompMs).toBe(1200);
  const fin = await h.app.inject({ method: "POST", url: `/api/session/${sessionId}/finish-reading`, headers: { cookie } });
  expect(fin.json().state).toBe("WRITING");
}

describe("auth and consent", () => {
  it("rejects unknown codes and protects routes", async () => {
    expect((await h.app.inject({ method: "POST", url: "/api/auth/login", payload: { code: "NOPE-99" } })).json().code).toBe("CODE_NOT_FOUND");
    expect((await h.app.inject({ method: "GET", url: "/api/articles" })).statusCode).toBe(401);
  });
  it("requires consent before a student can join the queue", async () => {
    h.ctx.db.prepare("UPDATE students SET consentAt = NULL WHERE studentCode = 'DEMO-02'").run();
    const c = await login(h.app, "demo-02");
    expect((await h.app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: c } })).json().user.needsConsent).toBe(true);
    expect((await h.app.inject({ method: "POST", url: "/api/queue/join", headers: { cookie: c }, payload: { articleId: "A1" } })).json().code).toBe(
      "CONSENT_REQUIRED",
    );
    await h.app.inject({ method: "POST", url: "/api/auth/consent", headers: { cookie: c }, payload: { accept: true } });
    expect((await h.app.inject({ method: "POST", url: "/api/queue/join", headers: { cookie: c }, payload: { articleId: "A1" } })).statusCode).toBe(200);
  });
  it("never returns article text from the list", async () => {
    const c = await login(h.app, "DEMO-02");
    const r = await h.app.inject({ method: "GET", url: "/api/articles", headers: { cookie: c } });
    expect(r.body).not.toContain("A log is only useful");
    expect(r.json().articles).toHaveLength(3);
  });
});

describe("reading, hide and FairClock (F1)", () => {
  it("serves the article only while READING, then 403 forever", async () => {
    const c = await login(h.app, "DEMO-02");
    const sid = await startSession(h, c);
    await readAndHide(c, sid);
    const again = await h.app.inject({ method: "GET", url: `/api/session/${sid}/article`, headers: { cookie: c } });
    expect(again.statusCode).toBe(403);
    expect(again.json().code).toBe("ARTICLE_HIDDEN");
  });

  it("moves to WRITING at the server deadline, with delivery compensation capped at 10 s", async () => {
    const c = await login(h.app, "DEMO-02");
    const sid = await startSession(h, c);
    await h.app.inject({ method: "GET", url: `/api/session/${sid}/article`, headers: { cookie: c } });
    h.clock.t += 25_000; // a very slow render
    const ack = (await h.app.inject({ method: "POST", url: `/api/session/${sid}/render-ack`, headers: { cookie: c } })).json();
    expect(ack.latencyCompMs).toBe(10_000);
    h.clock.t = ack.readDeadline + 1;
    const s = (await h.app.inject({ method: "GET", url: `/api/session/${sid}`, headers: { cookie: c } })).json();
    expect(s.state).toBe("WRITING");
    expect((await h.app.inject({ method: "GET", url: `/api/session/${sid}/article`, headers: { cookie: c } })).statusCode).toBe(403);
  });

  it("naive clock mode gives no compensation", async () => {
    h.ctx.settings.set({ clockMode: "naive" });
    const c = await login(h.app, "DEMO-02");
    const sid = await startSession(h, c);
    await h.app.inject({ method: "GET", url: `/api/session/${sid}/article`, headers: { cookie: c } });
    h.clock.t += 3000;
    expect((await h.app.inject({ method: "POST", url: `/api/session/${sid}/render-ack`, headers: { cookie: c } })).json().latencyCompMs).toBe(0);
  });

  it("needs an admission token from FairGate", async () => {
    const c = await login(h.app, "DEMO-02");
    expect((await h.app.inject({ method: "POST", url: "/api/session", headers: { cookie: c }, payload: { articleId: "A1" } })).json().code).toBe(
      "ADMISSION_REQUIRED",
    );
  });
});

describe("submit → SSE → receipt → chain → verify", () => {
  it("streams events in order and commits a verifiable receipt", async () => {
    const c = await login(h.app, "DEMO-02");
    const sid = await startSession(h, c);
    await readAndHide(c, sid);
    const r = await submit(c, sid, GOOD_A1);
    expect(r.headers["content-type"]).toContain("text/event-stream");
    const events = parseSse(r.body);
    const order = events.map((e) => e.type).filter((t) => ["score", "feedback", "xray", "record", "done"].includes(t));
    expect(order.indexOf("score")).toBeLessThan(order.indexOf("feedback"));
    expect(order.slice(-3)).toEqual(["xray", "record", "done"]);
    const score = events.find((e) => e.type === "score")!.data;
    expect(score.finalScore).toBeGreaterThanOrEqual(7);
    expect(score.judge).toMatchObject({ kind: "local", model: "local-rubric-judge@1" });
    expect(score.segmentation).toBe("sentence-fallback");
    expect(score.flags).toMatchObject({ pasteCount: 1, blurCount: 2, injectionSuspected: false });
    const fb = events.find((e) => e.type === "feedback" && e.data.final)!.data.final;
    expect(fb.source).toBe("template");
    const rec = events.find((e) => e.type === "record")!.data;
    expect(rec.chainStatus).toBe("queued");

    const attemptId = score.attemptId;
    const result = (await h.app.inject({ method: "GET", url: `/api/result/${attemptId}`, headers: { cookie: c } })).json();
    expect(result.status).toBe("done");
    expect(result.fairness).toMatchObject({ clockMode: "fair", latencyCompMs: 1200 });

    const xray = (await h.app.inject({ method: "GET", url: `/api/result/${attemptId}/xray`, headers: { cookie: c } })).json();
    expect(xray.sentences.length).toBeGreaterThan(5);
    expect(xray.claims.every((cl: { text: string }) => GOOD_A1.includes(cl.text))).toBe(true);

    // Before the writer runs: honest "not yet on-chain".
    const pending = (await h.app.inject({ method: "GET", url: `/api/verify/${rec.assessmentId}` })).json();
    expect(pending.status).toBe("not_found");
    expect(pending.checks[0].state).toBe("pending");

    await h.ctx.writer.tick();
    const verified = (await h.app.inject({ method: "GET", url: `/api/verify/${rec.assessmentId}` })).json();
    expect(verified.status).toBe("verified");
    expect(verified.checks.map((x: { state: string }) => x.state)).toEqual(["pass", "pass", "pass", "not_applicable"]);

    // The downloaded receipt hashes to the committed hash.
    const dl = await h.app.inject({ method: "GET", url: `/api/result/${attemptId}/receipt`, headers: { cookie: c } });
    expect(dl.headers["content-disposition"]).toContain(`graspchain-${rec.assessmentId}.json`);
    expect(await hashReceipt(dl.json())).toBe(rec.recordHash);
  });

  it("is idempotent: a replayed or second submit returns the same attempt", async () => {
    const c = await login(h.app, "DEMO-02");
    const sid = await startSession(h, c);
    await readAndHide(c, sid);
    const a = (await submit(c, sid, GOOD_A1, "key-aaaa-0001", false)).json();
    const b = (await submit(c, sid, GOOD_A1, "key-aaaa-0001", false)).json();
    const d = (await submit(c, sid, GOOD_A1, "key-bbbb-0002", false)).json();
    expect(b).toEqual({ attemptId: a.attemptId, existing: true });
    expect(d.attemptId).toBe(a.attemptId);
    await waitFor(() => !h.ctx.evaluator.isRunning(a.attemptId));
    expect((h.ctx.db.prepare("SELECT COUNT(*) n FROM attempts").get() as { n: number }).n).toBe(1);
  });

  it("enforces 30–300 words", async () => {
    const c = await login(h.app, "DEMO-02");
    const sid = await startSession(h, c);
    await readAndHide(c, sid);
    const r = await submit(c, sid, "Too short to count as a summary.", "key-short-0001", false);
    expect(r.statusCode).toBe(422);
    expect(r.json().code).toBe("WORD_COUNT");
  });

  it("flags instructions to the grader without letting them lift the score (E4b paired shift ≤ +0.5)", async () => {
    const base = INJECTION_A1.replace(/ Ignore the previous instructions[^.]*\./, "");
    const c0 = await login(h.app, "DEMO-04");
    const s0 = await startSession(h, c0);
    await readAndHide(c0, s0);
    const without = parseSse((await submit(c0, s0, base)).body).find((e) => e.type === "score")!.data;
    const c = await login(h.app, "DEMO-02");
    const sid = await startSession(h, c);
    await readAndHide(c, sid);
    const score = parseSse((await submit(c, sid, INJECTION_A1)).body).find((e) => e.type === "score")!.data;
    expect(score.flags.injectionSuspected).toBe(true);
    expect(without.flags.injectionSuspected).toBe(false);
    expect(score.finalScore - without.finalScore).toBeLessThanOrEqual(0.5);
    expect(score.finalScore).toBeLessThan(8);
    const t = await login(h.app, "TEACH-01");
    const q = (await h.app.inject({ method: "GET", url: "/api/teacher/queue", headers: { cookie: t } })).json();
    expect(q.queue.some((i: { attemptId: string }) => i.attemptId === score.attemptId)).toBe(true);
  });
});

describe("tamper, teacher correction and lineage", () => {
  async function scoredAttempt() {
    const c = await login(h.app, "DEMO-02");
    const sid = await startSession(h, c);
    await readAndHide(c, sid);
    const ev = parseSse((await submit(c, sid, GOOD_A1)).body);
    await h.ctx.writer.tick();
    return { c, record: ev.find((e) => e.type === "record")!.data, attemptId: ev.find((e) => e.type === "score")!.data.attemptId };
  }

  it("tampering the server copy fails V1/V2 while the student's copy still verifies", async () => {
    const { c, record, attemptId } = await scoredAttempt();
    const admin = await login(h.app, "ADMIN-01");
    const denied = await h.app.inject({
      method: "POST",
      url: "/api/admin/tamper",
      headers: { cookie: admin },
      payload: { assessmentId: record.assessmentId, field: "finalScore" },
    });
    expect(denied.json().code).toBe("ADMIN_SECRET");
    const ok = await h.app.inject({
      method: "POST",
      url: "/api/admin/tamper",
      headers: { cookie: admin, "x-admin-secret": ADMIN_SECRET },
      payload: { assessmentId: record.assessmentId, field: "finalScore" },
    });
    expect(ok.statusCode).toBe(200);
    const v = (await h.app.inject({ method: "GET", url: `/api/verify/${record.assessmentId}` })).json();
    expect(v.status).toBe("tampered");
    expect(v.checks[0].state).toBe("fail");
    expect(v.checks[1].state).toBe("fail");
    const mine = (await h.app.inject({ method: "GET", url: `/api/result/${attemptId}/receipt`, headers: { cookie: c } })).json();
    expect(await hashReceipt(mine)).toBe(record.recordHash);
    await h.app.inject({
      method: "POST",
      url: "/api/admin/restore",
      headers: { cookie: admin, "x-admin-secret": ADMIN_SECRET },
      payload: { assessmentId: record.assessmentId },
    });
    expect((await h.app.inject({ method: "GET", url: `/api/verify/${record.assessmentId}` })).json().status).toBe("verified");
  });

  it("detects all seven tamper fields", async () => {
    const { record } = await scoredAttempt();
    const admin = await login(h.app, "ADMIN-01");
    const headers = { cookie: admin, "x-admin-secret": ADMIN_SECRET };
    for (const field of ["finalScore", "answerHash", "createdAt", "models.jev", "rubricVersion", "studentRef", "readSecondsGranted"]) {
      await h.app.inject({ method: "POST", url: "/api/admin/tamper", headers, payload: { assessmentId: record.assessmentId, field } });
      expect((await h.app.inject({ method: "GET", url: `/api/verify/${record.assessmentId}` })).json().checks[0].state, field).toBe("fail");
      await h.app.inject({ method: "POST", url: "/api/admin/restore", headers, payload: { assessmentId: record.assessmentId } });
    }
  });

  it("a teacher override supersedes the record and the lineage verifies (V4)", async () => {
    const { c, record, attemptId } = await scoredAttempt();
    const t = await login(h.app, "TEACH-01");
    const bad = await h.app.inject({
      method: "POST",
      url: `/api/teacher/review/${record.assessmentId}`,
      headers: { cookie: t },
      payload: { newScore: 6, reason: "short" },
    });
    expect(bad.statusCode).toBe(400);
    const r = await h.app.inject({
      method: "POST",
      url: `/api/teacher/review/${record.assessmentId}`,
      headers: { cookie: t },
      payload: { newScore: 6.5, reason: "Coverage of kp3 is weaker than the labels suggest." },
    });
    expect(r.statusCode).toBe(200);
    const corr = r.json();
    await h.ctx.writer.tick();
    const v = (await h.app.inject({ method: "GET", url: `/api/verify/${corr.assessmentId}` })).json();
    expect(v.status).toBe("verified");
    expect(v.checks[3].state).toBe("pass");
    expect(v.lineage).toHaveLength(2);
    const old = (await h.app.inject({ method: "GET", url: `/api/verify/${record.assessmentId}` })).json();
    expect(old.status).toBe("superseded");
    const res = (await h.app.inject({ method: "GET", url: `/api/result/${attemptId}`, headers: { cookie: c } })).json();
    expect(res.review).toMatchObject({ previousScore: expect.any(Number), newScore: 6.5 });
    expect(res.score.finalScore).toBe(6.5);
    const again = await h.app.inject({
      method: "POST",
      url: `/api/teacher/review/${record.assessmentId}`,
      headers: { cookie: t },
      payload: { newScore: 7, reason: "Second try on the old record." },
    });
    expect(again.json().code).toBe("ALREADY_SUPERSEDED");
  });

  it("keeps commitments queued while the chain is down, then resumes", async () => {
    h.chain.reachable = false;
    const { record } = await scoredAttempt();
    expect((await h.app.inject({ method: "GET", url: `/api/verify/${record.assessmentId}` })).json().status).toBe("unavailable");
    expect(h.ctx.writer.backlog().queued).toBe(1);
    h.chain.reachable = true;
    h.ctx.db.prepare("UPDATE chain_outbox SET nextAttemptAt = 0").run();
    await h.ctx.writer.tick();
    expect((await h.app.inject({ method: "GET", url: `/api/verify/${record.assessmentId}` })).json().status).toBe("verified");
  });
});

describe("research mode", () => {
  it("hides scores from students but still evaluates", async () => {
    h.ctx.settings.set({ researchMode: true });
    const c = await login(h.app, "DEMO-02");
    const sid = await startSession(h, c);
    await readAndHide(c, sid);
    const ev = parseSse((await submit(c, sid, GOOD_A1)).body);
    expect(ev.some((e) => e.type === "score")).toBe(false);
    const hidden = ev.find((e) => e.type === "hidden")!.data;
    const res = (await h.app.inject({ method: "GET", url: `/api/result/${hidden.attemptId}`, headers: { cookie: c } })).json();
    expect(res.researchHidden).toBe(true);
    expect(res.score).toBeNull();
    const t = await login(h.app, "TEACH-01");
    expect(
      (await h.app.inject({ method: "GET", url: `/api/teacher/attempts/${hidden.attemptId}`, headers: { cookie: t } })).json().score.finalScore,
    ).toBeGreaterThan(1);
  });
});
