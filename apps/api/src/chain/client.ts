import { Contract, FetchRequest, JsonRpcProvider, Network, Wallet, formatEther, formatUnits, parseUnits, type TransactionResponse } from "ethers";
import { REGISTRY_ABI, assessmentIdToBytes32, bytes32ToAssessmentId, hexToBytes32, type ChainView } from "@graspchain/shared";
import type { Config } from "../config";

export interface OutboxPayload {
  id: string;
  recordHash: string;
  studentRef: string;
  scoreX10: number;
  rubricVersion: number;
  oldId?: string | null;
}

export class ChainError extends Error {
  constructor(
    public code: "FEE_CAP" | "UNREACHABLE" | "REVERTED" | "NONCE" | "TIMEOUT" | "NOT_CONFIGURED" | "UNKNOWN",
    message: string,
  ) {
    super(message);
    this.name = "ChainError";
  }
}

export interface ChainStatusInfo {
  configured: boolean;
  canWrite: boolean;
  reachable: boolean;
  chainId: number;
  blockNumber: number | null;
  registry: string | null;
  registryDeployed: boolean | null;
  writer: string | null;
  writerBalanceEth: string | null;
  gasPriceGwei: string | null;
  error: string | null;
}

/** What the rest of the API needs from the chain. Tests substitute an in-memory implementation. */
export interface ChainPort {
  readonly chainId: number;
  readonly registry: string | null;
  readonly canWrite: boolean;
  status(): Promise<ChainStatusInfo>;
  view(assessmentId: string, supersedes: string | null, recordHash: string): Promise<ChainView>;
  isRecorded(assessmentId: string): Promise<boolean>;
  submit(
    kind: "record" | "supersede",
    p: OutboxPayload,
    onSent: (txHash: string, nonce: number) => void,
  ): Promise<{ txHash: string; blockNumber: number; gasUsed: number; nonce: number }>;
}

function provider(url: string, chainId: number) {
  const req = new FetchRequest(url);
  req.timeout = 5000;
  return new JsonRpcProvider(req, chainId, { staticNetwork: Network.from(chainId), batchMaxCount: 1 });
}

const msg = (e: unknown) => (e instanceof Error ? ((e as { shortMessage?: string }).shortMessage ?? e.message) : String(e)).slice(0, 240);
const isConn = (e: unknown) => /ECONNREFUSED|ENOTFOUND|timeout|ETIMEDOUT|fetch failed|network|socket|ECONNRESET|missing response/i.test(msg(e));

/**
 * AssessmentRegistry over JSON-RPC (ethers 6). Reads fall back to CHAIN_RPC_BACKUP_URL; writes
 * use a managed nonce and cap maxFeePerGas at MAX_FEE_GWEI (the writer waits rather than overpays).
 */
export class EthersChain implements ChainPort {
  readonly chainId: number;
  readonly registry: string | null;
  readonly canWrite: boolean;
  private providers: JsonRpcProvider[];
  private wallet: Wallet | null;
  private nonce: number | null = null;

  constructor(private cfg: Config) {
    this.chainId = cfg.CHAIN_ID;
    this.registry = cfg.registryAddress;
    this.providers = [provider(cfg.CHAIN_RPC_URL, cfg.CHAIN_ID), ...(cfg.CHAIN_RPC_BACKUP_URL ? [provider(cfg.CHAIN_RPC_BACKUP_URL, cfg.CHAIN_ID)] : [])];
    this.wallet = cfg.DEPLOYER_PRIVATE_KEY ? new Wallet(cfg.DEPLOYER_PRIVATE_KEY, this.providers[0]) : null;
    this.canWrite = !!this.wallet && !!this.registry;
  }

  private async read<T>(fn: (c: Contract, p: JsonRpcProvider) => Promise<T>): Promise<T> {
    let last: unknown;
    for (const p of this.providers) {
      try {
        return await fn(new Contract(this.registry!, REGISTRY_ABI, p), p);
      } catch (e) {
        last = e;
        if (!isConn(e)) throw e;
      }
    }
    throw new ChainError("UNREACHABLE", msg(last));
  }

  async status(): Promise<ChainStatusInfo> {
    const base: ChainStatusInfo = {
      configured: !!this.registry,
      canWrite: this.canWrite,
      reachable: false,
      chainId: this.chainId,
      blockNumber: null,
      registry: this.registry,
      registryDeployed: null,
      writer: this.wallet?.address ?? null,
      writerBalanceEth: null,
      gasPriceGwei: null,
      error: null,
    };
    try {
      const p = this.providers[0];
      const [bn, fee] = await Promise.all([p.getBlockNumber(), p.getFeeData()]);
      base.reachable = true;
      base.blockNumber = bn;
      base.gasPriceGwei = fee.maxFeePerGas ? Number(formatUnits(fee.maxFeePerGas, "gwei")).toFixed(4) : null;
      if (this.registry) base.registryDeployed = (await p.getCode(this.registry)) !== "0x";
      if (this.wallet) base.writerBalanceEth = Number(formatEther(await p.getBalance(this.wallet.address))).toFixed(4);
    } catch (e) {
      base.error = msg(e);
    }
    return base;
  }

  async view(assessmentId: string, supersedes: string | null, recordHash: string): Promise<ChainView> {
    const out: ChainView = {
      reachable: false,
      chainId: this.chainId,
      registry: this.registry,
      record: null,
      verifies: null,
      supersededBy: null,
      lineageLinked: null,
      oldExists: null,
      error: null,
    };
    if (!this.registry) return { ...out, error: "No AssessmentRegistry address is configured for this chain." };
    try {
      const id = assessmentIdToBytes32(assessmentId);
      await this.read(async (c, p) => {
        if ((await p.getCode(this.registry!)) === "0x")
          throw new ChainError("NOT_CONFIGURED", `No contract code at ${this.registry} on chain ${this.chainId}.`);
        const r = await c.records(id);
        out.reachable = true;
        out.record =
          Number(r.timestamp) === 0
            ? null
            : {
                recordHash: r.recordHash,
                studentRef: r.studentRef,
                scoreX10: Number(r.scoreX10),
                rubricVersion: Number(r.rubricVersion),
                timestamp: Number(r.timestamp),
              };
        out.verifies = await c.verify(id, hexToBytes32(recordHash));
        const fromBlock = this.cfg.CHAIN_FROM_BLOCK;
        const next = await c.queryFilter(c.filters.AssessmentSuperseded(id), fromBlock);
        const nextTopic = next[0]?.topics[2];
        out.supersededBy = nextTopic ? bytes32ToAssessmentId(nextTopic) : null;
        if (supersedes) {
          const oldId = assessmentIdToBytes32(supersedes);
          out.lineageLinked = (await c.queryFilter(c.filters.AssessmentSuperseded(oldId, id), fromBlock)).length > 0;
          out.oldExists = Number((await c.records(oldId)).timestamp) !== 0;
        }
      });
    } catch (e) {
      // Partial reads are discarded: a check that could not complete must not look like a pass.
      return { ...out, reachable: false, record: null, verifies: null, supersededBy: null, lineageLinked: null, oldExists: null, error: msg(e) };
    }
    return out;
  }

  async isRecorded(assessmentId: string): Promise<boolean> {
    return this.read(async (c) => Number((await c.records(assessmentIdToBytes32(assessmentId))).timestamp) !== 0);
  }

  async submit(kind: "record" | "supersede", p: OutboxPayload, onSent: (txHash: string, nonce: number) => void) {
    if (!this.wallet || !this.registry) throw new ChainError("NOT_CONFIGURED", "Chain writer is disabled: set DEPLOYER_PRIVATE_KEY and a registry address.");
    const wallet = this.wallet;
    const c = new Contract(this.registry, REGISTRY_ABI, wallet);
    let fee;
    try {
      fee = await wallet.provider!.getFeeData();
      if (this.nonce === null) this.nonce = await wallet.getNonce("pending");
    } catch (e) {
      throw new ChainError("UNREACHABLE", msg(e));
    }
    const cap = parseUnits(String(this.cfg.MAX_FEE_GWEI), "gwei");
    if (fee.maxFeePerGas && fee.maxFeePerGas > cap) {
      throw new ChainError(
        "FEE_CAP",
        `Network fee ${Number(formatUnits(fee.maxFeePerGas, "gwei")).toFixed(2)} gwei exceeds MAX_FEE_GWEI=${this.cfg.MAX_FEE_GWEI}; waiting.`,
      );
    }
    const maxFeePerGas = fee.maxFeePerGas ? ((fee.maxFeePerGas * 12n) / 10n > cap ? cap : (fee.maxFeePerGas * 12n) / 10n) : undefined;
    const maxPriorityFeePerGas =
      fee.maxPriorityFeePerGas && maxFeePerGas ? (fee.maxPriorityFeePerGas > maxFeePerGas ? maxFeePerGas : fee.maxPriorityFeePerGas) : undefined;
    const nonce = this.nonce;
    const overrides = { nonce, ...(maxFeePerGas ? { maxFeePerGas, maxPriorityFeePerGas } : {}) };
    let tx: TransactionResponse;
    try {
      const id = assessmentIdToBytes32(p.id);
      tx =
        kind === "record"
          ? await c.record(id, hexToBytes32(p.recordHash), hexToBytes32(p.studentRef), p.scoreX10, p.rubricVersion, overrides)
          : await c.supersede(
              assessmentIdToBytes32(p.oldId!),
              id,
              hexToBytes32(p.recordHash),
              hexToBytes32(p.studentRef),
              p.scoreX10,
              p.rubricVersion,
              overrides,
            );
    } catch (e) {
      const m = msg(e);
      if (/nonce/i.test(m)) {
        this.nonce = null;
        throw new ChainError("NONCE", m);
      }
      if (isConn(e)) throw new ChainError("UNREACHABLE", m);
      this.nonce = null;
      throw new ChainError("REVERTED", m);
    }
    this.nonce = nonce + 1;
    onSent(tx.hash, nonce);
    const rc = await tx.wait(1, 120_000).catch((e) => {
      throw new ChainError(isConn(e) ? "UNREACHABLE" : "TIMEOUT", msg(e));
    });
    if (!rc || rc.status !== 1) throw new ChainError("REVERTED", `Transaction ${tx.hash} reverted`);
    return { txHash: tx.hash, blockNumber: rc.blockNumber, gasUsed: Number(rc.gasUsed), nonce };
  }
}
