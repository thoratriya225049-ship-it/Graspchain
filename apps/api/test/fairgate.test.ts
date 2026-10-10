import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { harness, login, type Harness } from "./helpers";

let h: Harness;
beforeEach(async () => {
  h = await harness({ CONCURRENCY: "1", WINDOW_MS: "1000", BURST_WINDOW_MS: "1000" });
});
afterEach(async () => {
  await h.close();
});

const join = async (cookie: string) => h.app.inject({ method: "POST", url: "/api/queue/join", headers: { cookie }, payload: { articleId: "A2" } });
const view = async (cookie: string, id: string) => (await h.app.inject({ method: "GET", url: `/api/queue/${id}`, headers: { cookie } })).json();

describe("FairGate (F14)", () => {
  it("allows one open ticket per student", async () => {
    const c = await login(h.app, "DEMO-02");
    const first = (await join(c)).json();
    const second = await join(c);
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ code: "TICKET_OPEN", details: { ticketId: first.ticketId } });
  });

  it("orders a window by seeded shuffle, not arrival, and admits up to CONCURRENCY", async () => {
    const cookies = await Promise.all(["DEMO-02", "DEMO-03", "DEMO-04", "DEMO-05"].map((c) => login(h.app, c)));
    const tickets: string[] = [];
    for (const c of cookies) {
      tickets.push((await join(c)).json().ticketId);
      h.clock.t += 10; // later arrivals in the same window
    }
    expect((await view(cookies[0], tickets[0])).position).toBeNull(); // window still open
    h.clock.t += 1500;
    const views = await Promise.all(cookies.map((c, i) => view(c, tickets[i])));
    expect(new Set(views.map((v) => v.windowId)).size).toBe(1);
    expect(views.map((v) => v.position).sort()).toEqual([1, 2, 3, 4]);
    expect(views.filter((v) => v.state === "admitted")).toHaveLength(1);
    const admitted = views.find((v) => v.state === "admitted")!;
    expect(admitted.admissionToken).toMatch(/\./);
    expect(views.filter((v) => v.state !== "admitted").every((v) => v.admissionToken === null)).toBe(true);
    const win = h.ctx.db.prepare("SELECT seed, ticketOrder, hash FROM queue_windows").get() as { seed: string; ticketOrder: string; hash: string };
    expect(JSON.parse(win.ticketOrder)).toHaveLength(4);
    expect(win.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fifo mode orders by arrival", async () => {
    h.ctx.settings.set({ fairMode: "fifo" });
    const cookies = await Promise.all(["DEMO-02", "DEMO-03", "DEMO-04"].map((c) => login(h.app, c)));
    const tickets: string[] = [];
    for (const c of cookies) {
      tickets.push((await join(c)).json().ticketId);
      h.clock.t += 5;
    }
    const views = await Promise.all(cookies.map((c, i) => view(c, tickets[i])));
    expect(views.map((v) => v.position)).toEqual([1, 2, 3]);
  });

  it("expires an unused admission token and frees the slot", async () => {
    const [a, b] = await Promise.all(["DEMO-02", "DEMO-03"].map((c) => login(h.app, c)));
    const ta = (await join(a)).json().ticketId;
    const tb = (await join(b)).json().ticketId;
    h.clock.t += 1500;
    const va = await view(a, ta);
    const vb0 = await view(b, tb);
    const [first, second] =
      va.state === "admitted"
        ? [
            [a, ta],
            [b, tb],
          ]
        : [
            [b, tb],
            [a, ta],
          ];
    expect([va.state, vb0.state].sort()).toEqual(["admitted", "waiting"]);
    h.clock.t += 31_000;
    expect((await view(first[0], first[1])).state).toBe("expired");
    expect((await view(second[0], second[1])).state).toBe("admitted");
    const late = await h.app.inject({
      method: "POST",
      url: "/api/session",
      headers: { cookie: first[0] },
      payload: { articleId: "A2", admissionToken: (va.admissionToken ?? vb0.admissionToken) as string },
    });
    expect(["ADMISSION_EXPIRED", "ADMISSION_INVALID"]).toContain(late.json().code);
  });

  it("rejects a token presented by another student", async () => {
    const [a, b] = await Promise.all(["DEMO-02", "DEMO-03"].map((c) => login(h.app, c)));
    const ta = (await join(a)).json().ticketId;
    h.clock.t += 1500;
    const tok = (await view(a, ta)).admissionToken;
    const r = await h.app.inject({ method: "POST", url: "/api/session", headers: { cookie: b }, payload: { articleId: "A2", admissionToken: tok } });
    expect(r.json().code).toBe("ADMISSION_INVALID");
  });

  it("an abandoned session (no heartbeat) expires and frees its slot for the next student", async () => {
    const [a, b] = await Promise.all(["DEMO-02", "DEMO-03"].map((c) => login(h.app, c)));
    const ta = (await join(a)).json().ticketId;
    const tb = (await join(b)).json().ticketId;
    h.clock.t += 1500;
    const [va, vb] = [await view(a, ta), await view(b, tb)];
    const [first, second] =
      va.state === "admitted"
        ? [
            { c: a, v: va },
            { c: b, id: tb },
          ]
        : [
            { c: b, v: vb },
            { c: a, id: ta },
          ];
    const s = await h.app.inject({
      method: "POST",
      url: "/api/session",
      headers: { cookie: first.c },
      payload: { articleId: "A2", admissionToken: first.v.admissionToken },
    });
    const sid = s.json().sessionId;
    await h.app.inject({ method: "GET", url: `/api/session/${sid}/article`, headers: { cookie: first.c } });
    h.clock.t += 60_000;
    await h.app.inject({ method: "POST", url: `/api/session/${sid}/heartbeat`, headers: { cookie: first.c } });
    h.clock.t += 60_000;
    h.ctx.sessions.sweep();
    expect((await view(second.c, second.id)).state).toBe("waiting"); // heartbeat kept the slot
    h.clock.t += 130_000; // tab closed: no heartbeat
    h.ctx.sessions.sweep();
    expect((await h.app.inject({ method: "GET", url: `/api/session/${sid}`, headers: { cookie: first.c } })).json().state).toBe("EXPIRED");
    expect((await view(second.c, second.id)).state).toBe("admitted");
  });
});
