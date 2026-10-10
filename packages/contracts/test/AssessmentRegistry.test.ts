import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { network } from "hardhat";
import type { Log, LogDescription } from "ethers";

const { ethers } = await network.create();

const id = (n: number) => ethers.zeroPadValue(ethers.toBeHex(n), 32);
const h = (s: string) => ethers.sha256(ethers.toUtf8Bytes(s));

describe("AssessmentRegistry", () => {
  let registry: Awaited<ReturnType<typeof deploy>>;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let other: Awaited<ReturnType<typeof ethers.getSigners>>[number];

  async function deploy() {
    const [o] = await ethers.getSigners();
    return ethers.deployContract("AssessmentRegistry", [o.address]);
  }

  before(async () => {
    [owner, other] = await ethers.getSigners();
    registry = await deploy();
  });

  it("records an assessment and verifies its hash", async () => {
    const tx = await registry.record(id(1), h("receipt-1"), h("student-a"), 74, 1);
    const rc = await tx.wait();
    assert.ok(rc);
    const ev = rc.logs.map((l: Log) => registry.interface.parseLog(l)).find((e: LogDescription | null) => e?.name === "AssessmentRecorded");
    assert.equal(ev?.args.id, id(1));
    assert.equal(ev?.args.scoreX10, 74n);
    assert.equal(await registry.verify(id(1), h("receipt-1")), true);
    assert.equal(await registry.verify(id(1), h("tampered")), false);
    assert.equal(await registry.verify(id(99), h("receipt-1")), false);
    const r = await registry.records(id(1));
    assert.equal(r.scoreX10, 74n);
    assert.equal(r.rubricVersion, 1n);
    assert.ok(r.timestamp > 0n);
  });

  it("rejects a duplicate id", async () => {
    await assert.rejects(registry.record(id(1), h("x"), h("student-a"), 50, 1), /exists/);
  });

  it("rejects a score outside 1.0–10.0", async () => {
    await assert.rejects(registry.record(id(2), h("x"), h("s"), 9, 1), /score/);
    await assert.rejects(registry.record(id(2), h("x"), h("s"), 101, 1), /score/);
  });

  it("only the owner can write", async () => {
    const asOther = registry.connect(other) as typeof registry;
    await assert.rejects(asOther.record(id(3), h("x"), h("s"), 50, 1), /OwnableUnauthorizedAccount/);
    await assert.rejects(asOther.anchorBatch(h("root"), 3), /OwnableUnauthorizedAccount/);
  });

  it("supersedes with a link event and checks the student", async () => {
    await assert.rejects(registry.supersede(id(98), id(4), h("r4"), h("student-a"), 80, 1), /missing/);
    await assert.rejects(registry.supersede(id(1), id(4), h("r4"), h("student-b"), 80, 1), /student/);
    const rc = await (await registry.supersede(id(1), id(4), h("r4"), h("student-a"), 80, 1)).wait();
    const names = rc!.logs.map((l: Log) => registry.interface.parseLog(l)?.name);
    assert.deepEqual(names, ["AssessmentRecorded", "AssessmentSuperseded"]);
    const links = await registry.queryFilter(registry.filters.AssessmentSuperseded(id(1), id(4)));
    assert.equal(links.length, 1);
    assert.equal(await registry.verify(id(1), h("receipt-1")), true, "the original still verifies");
    assert.equal(await registry.verify(id(4), h("r4")), true);
  });

  it("anchors a batch root once", async () => {
    await (await registry.anchorBatch(h("root"), 3)).wait();
    assert.ok((await registry.batchRoots(h("root"))) > 0n);
    await assert.rejects(registry.anchorBatch(h("root"), 3), /exists/);
  });

  it("costs about 90–110k gas per record()", async () => {
    const rc = await (await registry.record(id(5), h("r5"), h("student-c"), 61, 1)).wait();
    const gas = Number(rc!.gasUsed);
    console.log(`      record() gasUsed = ${gas}`);
    assert.ok(gas > 60_000 && gas < 130_000, `gas ${gas}`);
    assert.equal(owner.address.length, 42);
  });
});
