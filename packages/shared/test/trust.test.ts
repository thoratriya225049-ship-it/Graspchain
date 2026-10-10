import { describe, expect, it } from "vitest";
import { assessmentIdToBytes32, bytes32ToAssessmentId, canonicalReceiptJson, canonicalize, hashReceipt, roundFloats } from "../src/canonical";
import { computeDeadline } from "../src/fairclock";
import { runChecks } from "../src/verify";
import type { ChainView } from "../src/types";
import { FIXTURE, FIXTURE_HASH } from "./fixture";

describe("canonicalization (RFC 8785) and hashing", () => {
  it("sorts keys and is independent of insertion order", () => {
    expect(canonicalize({ b: 1, a: [true, null, "x"] })).toBe('{"a":[true,null,"x"],"b":1}');
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
  });

  it("rounds floats to 4 dp before hashing", () => {
    expect(roundFloats({ x: 0.78123456, n: 7 })).toEqual({ x: 0.7812, n: 7 });
    expect(canonicalReceiptJson(FIXTURE)).toContain('"coverage":0.7812');
  });

  it("produces a stable hash for the fixture", async () => {
    const h = await hashReceipt(FIXTURE);
    expect(h).toBe(FIXTURE_HASH);
    expect(await hashReceipt(structuredClone(FIXTURE))).toBe(h);
    const changed = structuredClone(FIXTURE);
    changed.assessment.finalScore = 8.1;
    expect(await hashReceipt(changed)).not.toBe(h);
  });

  it("encodes assessment ids as bytes32 reversibly", () => {
    const b = assessmentIdToBytes32(FIXTURE.assessmentId);
    expect(b).toMatch(/^0x0{32}[0-9a-f]{32}$/);
    expect(bytes32ToAssessmentId(b)).toBe(FIXTURE.assessmentId);
  });
});

describe("FairClock", () => {
  it("naive mode ignores delivery delay", () => {
    expect(computeDeadline(1000, 4000, 60, { capS: 10, mode: "naive" })).toEqual({ deadline: 61000, latencyCompMs: 0 });
  });
  it("fair mode adds the measured delay", () => {
    expect(computeDeadline(1000, 4400, 60, { capS: 10, mode: "fair" })).toEqual({ deadline: 64400, latencyCompMs: 3400 });
  });
  it("caps the compensation (a faked slow ack gains at most the cap)", () => {
    expect(computeDeadline(1000, 60000, 60, { capS: 10, mode: "fair" }).latencyCompMs).toBe(10000);
  });
  it("uses the full cap before the ack (provisional), then tightens", () => {
    const before = computeDeadline(1000, null, 60, { capS: 10, mode: "fair" }).deadline;
    const after = computeDeadline(1000, 1500, 60, { capS: 10, mode: "fair" }).deadline;
    expect(before).toBe(71000);
    expect(after).toBeLessThan(before);
  });
});

const chain = (over: Partial<ChainView> = {}): ChainView => ({
  reachable: true,
  chainId: 31337,
  registry: "0x0",
  record: { recordHash: "0x", studentRef: "0x", scoreX10: 71, rubricVersion: 1, timestamp: 1 },
  verifies: true,
  supersededBy: null,
  lineageLinked: null,
  oldExists: null,
  error: null,
  ...over,
});

describe("verification checks V1–V4", () => {
  it("verifies a matching record", () => {
    const r = runChecks(FIXTURE, "h", chain());
    expect(r.status).toBe("verified");
    expect(r.checks.map((c) => c.state)).toEqual(["pass", "pass", "pass", "not_applicable"]);
  });
  it("fails V1 when the hash differs, and V2 when the score differs", () => {
    const r = runChecks({ ...FIXTURE, assessment: { ...FIXTURE.assessment, finalScore: 8.6 } }, "h", chain({ verifies: false }));
    expect(r.status).toBe("tampered");
    expect(r.checks[0].state).toBe("fail");
    expect(r.checks[1].state).toBe("fail");
  });
  it("reports 'not yet on-chain' as pending, distinct from failure", () => {
    const r = runChecks(FIXTURE, "h", chain({ record: null, verifies: false }), { status: "queued", lastError: null });
    expect(r.status).toBe("not_found");
    expect(r.checks[0].state).toBe("pending");
    expect(r.checks[0].detail).toMatch(/queued/);
  });
  it("never claims success when the chain is unreachable", () => {
    const r = runChecks(FIXTURE, "h", chain({ reachable: false, record: null, verifies: null, error: "ECONNREFUSED" }));
    expect(r.status).toBe("unavailable");
    expect(r.checks.filter((c) => c.state === "pass").map((c) => c.id)).toEqual(["V3"]);
  });
  it("checks correction lineage", () => {
    const corr = { ...FIXTURE, supersedes: "11111111-1111-4111-8111-111111111111" };
    expect(runChecks(corr, "h", chain({ lineageLinked: true, oldExists: true })).checks[3].state).toBe("pass");
    expect(runChecks(corr, "h", chain({ lineageLinked: false, oldExists: true })).checks[3].state).toBe("fail");
    expect(runChecks(FIXTURE, "h", chain({ supersededBy: corr.supersedes })).status).toBe("superseded");
  });
});
