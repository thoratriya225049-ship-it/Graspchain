import { assessmentIdToBytes32, bytes32ToAssessmentId, hexToBytes32, type ChainView, type Receipt } from "@graspchain/shared";

/**
 * In-browser read of AssessmentRegistry over public JSON-RPC, for "Check independently".
 * Nothing here talks to the Graspchain API: the receipt is hashed in the page and these calls
 * go straight to the chain's RPC. Selectors are the keccak-256 of the ABI signatures in
 * @graspchain/shared REGISTRY_ABI (precomputed so the page needs no ethers bundle):
 *   verify(bytes32,bytes32)                    0x4e8fee00
 *   records(bytes32)                           0x01e64725
 *   AssessmentSuperseded(bytes32,bytes32)      0x9b61b8c5…89af
 */
const SEL_VERIFY = "0x4e8fee00";
const SEL_RECORDS = "0x01e64725";
const TOPIC_SUPERSEDED = "0x9b61b8c56709ac64fa6d3a828917b4f163cb5b54ccad6ef935dd6518359989af";

let seq = 0;
async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++seq, method, params }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const j = (await res.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return j.result as T;
}

const word = (hex: string, i: number) => hex.replace(/^0x/, "").slice(i * 64, (i + 1) * 64);

async function records(url: string, registry: string, id32: string) {
  const out = await rpc<string>(url, "eth_call", [{ to: registry, data: SEL_RECORDS + id32.slice(2) }, "latest"]);
  const ts = parseInt(word(out, 4) || "0", 16);
  if (!ts) return null;
  return {
    recordHash: "0x" + word(out, 0),
    studentRef: "0x" + word(out, 1),
    scoreX10: parseInt(word(out, 2), 16),
    rubricVersion: parseInt(word(out, 3), 16),
    timestamp: ts,
  };
}

export async function readChain(opts: { rpcUrl: string; registry: string | null; chainId: number }, receipt: Receipt, hash: string): Promise<ChainView> {
  const out: ChainView = {
    reachable: false,
    chainId: opts.chainId,
    registry: opts.registry,
    record: null,
    verifies: null,
    supersededBy: null,
    lineageLinked: null,
    oldExists: null,
    error: null,
  };
  if (!opts.registry) return { ...out, error: "No registry address is configured." };
  try {
    const chainHex = await rpc<string>(opts.rpcUrl, "eth_chainId", []);
    if (parseInt(chainHex, 16) !== opts.chainId) throw new Error(`RPC is on chain ${parseInt(chainHex, 16)}, expected ${opts.chainId}.`);
    if ((await rpc<string>(opts.rpcUrl, "eth_getCode", [opts.registry, "latest"])) === "0x") throw new Error(`No AssessmentRegistry at ${opts.registry}.`);
    const id = assessmentIdToBytes32(receipt.assessmentId);
    out.record = await records(opts.rpcUrl, opts.registry, id);
    out.reachable = true;
    const v = await rpc<string>(opts.rpcUrl, "eth_call", [{ to: opts.registry, data: SEL_VERIFY + id.slice(2) + hexToBytes32(hash).slice(2) }, "latest"]);
    out.verifies = parseInt(word(v, 0) || "0", 16) === 1;
    try {
      const logs = await rpc<{ topics: string[] }[]>(opts.rpcUrl, "eth_getLogs", [
        { address: opts.registry, fromBlock: "0x0", toBlock: "latest", topics: [TOPIC_SUPERSEDED, id] },
      ]);
      out.supersededBy = logs[0]?.topics[2] ? bytes32ToAssessmentId(logs[0].topics[2]) : null;
      if (receipt.supersedes) {
        const old = assessmentIdToBytes32(receipt.supersedes);
        const link = await rpc<unknown[]>(opts.rpcUrl, "eth_getLogs", [
          { address: opts.registry, fromBlock: "0x0", toBlock: "latest", topics: [TOPIC_SUPERSEDED, old, id] },
        ]);
        out.lineageLinked = link.length > 0;
        out.oldExists = !!(await records(opts.rpcUrl, opts.registry, old));
      }
    } catch {
      /* some public RPCs refuse wide log ranges; lineage stays unknown rather than guessed */
    }
    return out;
  } catch (e) {
    return { ...out, reachable: false, record: null, verifies: null, error: (e as Error).message.slice(0, 200) };
  }
}
