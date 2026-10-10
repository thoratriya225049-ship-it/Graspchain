import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSseParser } from "@graspchain/shared";
import { GOOD_A1, harness, type Harness } from "./helpers";

/**
 * `pnpm demo:smoke`: the demo path over a real TCP socket (not `inject`), so streaming,
 * cookies and connection handling behave as they do for a browser.
 */
let h: Harness;
let base = "";
let cookie = "";

beforeAll(async () => {
  h = await harness({ WINDOW_MS: "100", BURST_WINDOW_MS: "100" }, { now: Date.now });
  h.ctx.fairgate.start();
  await h.app.listen({ port: 0, host: "127.0.0.1" });
  const addr = h.app.server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(async () => {
  h.ctx.fairgate.stop();
  await h.close();
});

async function req(path: string, init: RequestInit = {}) {
  const r = await fetch(base + path, { ...init, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) } });
  const sc = r.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  return r;
}

describe("demo smoke over HTTP", () => {
  it("login → queue → read → hide → submit (SSE) → receipt → chain → verify", async () => {
    expect((await req("/api/auth/login", { method: "POST", body: JSON.stringify({ code: "DEMO-02" }) })).status).toBe(200);
    let t = await (await req("/api/queue/join", { method: "POST", body: JSON.stringify({ articleId: "A1" }) })).json();
    for (let i = 0; i < 40 && !t.admissionToken; i++) {
      await new Promise((r) => setTimeout(r, 50));
      t = await (await req(`/api/queue/${t.ticketId}`)).json();
    }
    expect(t.admissionToken).toBeTruthy();
    const s = await (await req("/api/session", { method: "POST", body: JSON.stringify({ articleId: "A1", admissionToken: t.admissionToken }) })).json();
    expect((await req(`/api/session/${s.sessionId}/article`)).status).toBe(200);
    expect((await req(`/api/session/${s.sessionId}/render-ack`, { method: "POST" })).status).toBe(200);
    expect((await req(`/api/session/${s.sessionId}/finish-reading`, { method: "POST" })).status).toBe(200);
    expect((await req(`/api/session/${s.sessionId}/article`)).status).toBe(403);

    const r = await req(`/api/session/${s.sessionId}/submit`, {
      method: "POST",
      headers: { accept: "text/event-stream" },
      body: JSON.stringify({ answer: GOOD_A1, idempotencyKey: "smoke-key-1" }),
    });
    expect(r.headers.get("content-type")).toContain("text/event-stream");
    const events: { type: string; data: any }[] = [];
    const feed = createSseParser((type, data) => events.push({ type, data }));
    const dec = new TextDecoder();
    for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) feed(dec.decode(chunk, { stream: true }));
    const types = events.map((e) => e.type);
    for (const t of ["score", "feedback", "xray", "record", "done"]) expect(types, `missing ${t}`).toContain(t);
    expect(types.at(-1)).toBe("done");

    const rec = events.find((e) => e.type === "record")!.data;
    await h.ctx.writer.tick();
    const v = await (await req(`/api/verify/${rec.assessmentId}`)).json();
    expect(v.status).toBe("verified");
    expect((await req(`/api/receipts/${rec.assessmentId}`)).headers.get("access-control-allow-origin")).toBe("*");
  });

  it("re-attaches to a finished evaluation's stream from the database", async () => {
    const profile = await (await req("/api/profile/me")).json();
    const id = profile.attempts.at(-1).attemptId;
    const r = await req(`/api/result/${id}/stream`, { headers: { accept: "text/event-stream" } });
    const text = await r.text();
    expect(text).toContain("event: score");
    expect(text).toContain("event: done");
  });

  it("reports health and readiness without paid calls", async () => {
    expect((await req("/healthz")).status).toBe(200);
    const ready = await (await req("/readyz")).json();
    expect(ready.checks).toMatchObject({ db: true, judge: "local-demo" });
  });
});
