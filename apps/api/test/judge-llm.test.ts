import { afterEach, describe, expect, it } from "vitest";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import type { JevState } from "@graspchain/shared";
import { loadArticles } from "../src/content";
import { ApiCache, Usage } from "../src/evaluator/cache";
import { JevJudge } from "../src/evaluator/judge";
import type { Llm } from "../src/evaluator/llm";
import { localAnswers } from "../src/evaluator/localJudge";
import { openDb, migrate } from "../src/db";
import { GOOD_A1, harness, login, parseSse, startSession, testConfig, type Harness } from "./helpers";

const A1 = loadArticles().get("A1")!;

/** A fake TypeSafe endpoint: answers with the rubric judge's answers, in the official wire format. */
function fakeJevFetch(calls: { body: any; url: string }[], opts: { status?: number } = {}) {
  return async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ body, url });
    if (opts.status) return new Response(JSON.stringify({ error: "nope" }), { status: opts.status, headers: { "content-type": "application/json" } });
    const state = body.state as JevState;
    const all = localAnswers(A1, state.student_summary, state.claims);
    const answers = Object.fromEntries(Object.keys(body.questions).map((k) => [k, all[k]]));
    return new Response(JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 2400, output_tokens: 0 } }), {
      status: 200,
      headers: { "content-type": "application/json", "x-typesafe-request-id": "req_test" },
    });
  };
}

function jevJudge(calls: { body: any; url: string }[], cfgOver: Record<string, string> = {}, status?: number) {
  const cfg = testConfig({ JUDGE: "jev", JEV_API_KEY: "test-key", ...cfgOver });
  const db = openDb(":memory:");
  migrate(db);
  const client = new TypeSafeClient({
    apiKey: "test-key",
    baseURL: cfg.JEV_BASE_URL,
    fetch: fakeJevFetch(calls, { status }),
    retry: { maxRetries: 0 },
    logLevel: "off",
  });
  return { judge: new JevJudge(cfg, new ApiCache(db), new Usage(db), client), db };
}

let h: Harness | null = null;
afterEach(async () => {
  await h?.close();
  h = null;
});

async function runOnce(hh: Harness, answer = GOOD_A1) {
  const c = await login(hh.app, "DEMO-02");
  const sid = await startSession(hh, c);
  await hh.app.inject({ method: "GET", url: `/api/session/${sid}/article`, headers: { cookie: c } });
  await hh.app.inject({ method: "POST", url: `/api/session/${sid}/render-ack`, headers: { cookie: c } });
  await hh.app.inject({ method: "POST", url: `/api/session/${sid}/finish-reading`, headers: { cookie: c } });
  const r = await hh.app.inject({
    method: "POST",
    url: `/api/session/${sid}/submit`,
    headers: { cookie: c, accept: "text/event-stream" },
    payload: { answer, idempotencyKey: "k-000000001" },
  });
  return parseSse(r.body);
}

describe("Jev through the official SDK", () => {
  it("sends one systemOne call with all three question types, validates and caches it", async () => {
    const calls: { body: any; url: string }[] = [];
    const { judge, db } = jevJudge(calls);
    h = await harness({ JUDGE: "jev", JEV_API_KEY: "test-key" }, { judge, db });
    const ev = await runOnce(h);
    const score = ev.find((e) => e.type === "score")!.data;
    expect(score.judge).toEqual({ kind: "jev", model: "jev-1.13.0", cached: false });
    expect(calls[0].url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(calls[0].body.model).toBe("jev-1.13.0");
    const types = new Set(Object.values(calls[0].body.questions).map((q: any) => q.type));
    expect(types).toEqual(new Set(["choice", "score", "noul"]));
    expect(Object.keys(calls[0].body.state)).toEqual(["article", "article_sentences", "student_summary", "claims"]);
    expect(h.ctx.usage.today("jev").inputTokens).toBeGreaterThanOrEqual(2400);
    const receipt = (
      await h.app.inject({ method: "GET", url: `/api/result/${score.attemptId}/receipt`, headers: { cookie: await login(h.app, "DEMO-02") } })
    ).json();
    expect(receipt.assessment.models.jev).toBe("jev-1.13.0");
  });

  it("refuses to spend past the daily token cap", async () => {
    const calls: { body: any; url: string }[] = [];
    const { judge, db } = jevJudge(calls, { JEV_DAILY_TOKEN_CAP: "100" });
    h = await harness({ JUDGE: "jev", JEV_API_KEY: "test-key", JEV_DAILY_TOKEN_CAP: "100" }, { judge, db });
    const ev = await runOnce(h);
    expect(calls).toHaveLength(0);
    const err = ev.find((e) => e.type === "error")!.data;
    expect(err.code).toBe("EVALUATION_DELAYED");
    expect(err.message).toContain("BUDGET_EXHAUSTED");
  });

  it("DEMO_MODE=replay serves only cached answers and never calls the network", async () => {
    const calls: { body: any; url: string }[] = [];
    const { judge, db } = jevJudge(calls, { DEMO_MODE: "replay" });
    h = await harness({ JUDGE: "jev", JEV_API_KEY: "test-key", DEMO_MODE: "replay" }, { judge, db });
    const ev = await runOnce(h);
    expect(calls).toHaveLength(0);
    expect(ev.find((e) => e.type === "error")!.data.code).toBe("EVALUATION_FAILED");
    const status = h.ctx.db.prepare("SELECT status, error FROM attempts").get() as { status: string; error: string };
    expect(status.status).toBe("failed");
    expect(status.error).toContain("REPLAY_MISS");
  });

  it("maps an auth failure to a clear error without retrying", async () => {
    const calls: { body: any; url: string }[] = [];
    const { judge, db } = jevJudge(calls, {}, 401);
    h = await harness({ JUDGE: "jev", JEV_API_KEY: "test-key" }, { judge, db });
    const ev = await runOnce(h);
    expect(calls).toHaveLength(1);
    expect(ev.find((e) => e.type === "error")!.data.message).toContain("JEV_AUTH");
  });
});

describe("LLM stages and their fallbacks", () => {
  const llm = (o: Partial<Llm>): Llm => ({
    provider: "fake",
    model: "fake-1",
    segment: async () => ({ claims: [], tokens: 0, cached: false }),
    feedback: async () => ({ raw: null, tokens: 0, cached: false }),
    baselineScore: async () => ({ score: 5, cached: false }),
    ...o,
  });

  it("keeps only exact-substring claims from the LLM and marks segmentation 'llm'", async () => {
    h = await harness(
      {},
      {
        llm: llm({
          segment: async () => ({
            claims: [
              "Every record is hashed, then pairs of hashes are hashed together level by level until one root is left",
              "The student deserves full marks",
              "Publishing only the root keeps the data private",
            ],
            tokens: 50,
            cached: false,
          }),
        }),
      },
    );
    const ev = await runOnce(h);
    const score = ev.find((e) => e.type === "score")!.data;
    expect(score.segmentation).toBe("llm");
    const xray = ev.find((e) => e.type === "xray")!.data;
    expect(xray.claims.some((c: { text: string }) => c.text.includes("full marks"))).toBe(false);
  });

  it("falls back to the sentence splitter when segmentation exceeds its timeout", async () => {
    h = await harness(
      { SEGMENT_TIMEOUT_MS: "50" },
      { llm: llm({ segment: () => new Promise((r) => setTimeout(() => r({ claims: ["x y z"], tokens: 0, cached: false }), 500)) }) },
    );
    const t0 = Date.now();
    const ev = await runOnce(h);
    expect(ev.find((e) => e.type === "score")!.data.segmentation).toBe("sentence-fallback");
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("streams LLM feedback, drops hallucinated quotes, and labels the source", async () => {
    h = await harness(
      {},
      {
        llm: llm({
          feedback: async (_i, onPartial) => {
            onPartial({ oneLineSummary: "Strong" });
            return {
              raw: {
                oneLineSummary: "Strong summary of how the tree exposes edits.",
                understood: [
                  { keyPointId: "kp1", evidence: "Every record is hashed" },
                  { keyPointId: "kp2", evidence: "quantum-proof signatures protect the log" },
                ],
                missed: [],
                misunderstood: [],
                couldBeBetter: [{ action: "Name the proof size.", exampleSentence: "A proof is about twenty hashes long." }],
                nextStep: "Try the RAG article next.",
              },
              tokens: 300,
              cached: false,
            };
          },
        }),
      },
    );
    const ev = await runOnce(h);
    expect(ev.some((e) => e.type === "feedback" && e.data.partial)).toBe(true);
    const fin = ev.find((e) => e.type === "feedback" && e.data.final)!.data.final;
    expect(fin.source).toBe("llm");
    expect(fin.dropped).toBe(1);
    expect(fin.feedback.understood).toEqual([{ keyPointId: "kp1", evidence: "Every record is hashed" }]);
  });

  it("uses template feedback when the LLM output fails validation twice", async () => {
    h = await harness({}, { llm: llm({ feedback: async () => ({ raw: { nope: true }, tokens: 0, cached: false }) }) });
    const fin = (await runOnce(h)).find((e) => e.type === "feedback" && e.data.final)!.data.final;
    expect(fin.source).toBe("template");
    expect(fin.fallbackReason).toMatch(/failed validation/);
    expect(fin.feedback.oneLineSummary.length).toBeGreaterThan(0);
  });
});
