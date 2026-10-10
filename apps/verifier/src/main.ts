/**
 * Graspchain independent verifier (PRD §9.4.7, F10). Runs entirely in the browser:
 *  1. take a receipt (your file, pasted JSON, or the URL in a QR link),
 *  2. round floats → RFC 8785 JCS → SHA-256 (WebCrypto) — the same shared module the API uses,
 *  3. ask AssessmentRegistry over public JSON-RPC: verify(id, hash), records(id), supersede events,
 *  4. apply the same V1–V4 rules as the server.
 * It never calls the Graspchain API.
 */
import {
  REGISTRY_ABI,
  RECEIPT_SCHEMA,
  STATUS_COPY,
  assessmentIdToBytes32,
  bytes32ToAssessmentId,
  canonicalReceiptJson,
  hexToBytes32,
  runChecks,
  sha256Hex,
  type ChainView,
  type Receipt,
} from "@graspchain/shared";

declare const ethers: typeof import("ethers");
declare global {
  interface Window {
    GC_CONFIG: { chainId: number; chainName: string; registry: string | null; rpcUrl: string; explorerUrl: string | null; fromBlock: number };
  }
}

const cfg = window.GC_CONFIG;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const contacted = new Set<string>();

function rpcUrl() {
  return ($<HTMLInputElement>("rpc").value || cfg.rpcUrl).trim();
}

function note(host: string) {
  contacted.add(host);
  $("hosts").textContent = [...contacted].join(" · ") || "none yet";
}

async function chainView(receipt: Receipt, hash: string): Promise<ChainView> {
  const out: ChainView = {
    reachable: false,
    chainId: cfg.chainId,
    registry: cfg.registry,
    record: null,
    verifies: null,
    supersededBy: null,
    lineageLinked: null,
    oldExists: null,
    error: null,
  };
  if (!cfg.registry) return { ...out, error: "This verifier build has no registry address." };
  const url = rpcUrl();
  note(new URL(url).host);
  try {
    const provider = new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true, batchMaxCount: 1 });
    const net = await provider.getNetwork();
    if (Number(net.chainId) !== cfg.chainId) throw new Error(`RPC is on chain ${net.chainId}, expected ${cfg.chainId} (${cfg.chainName}).`);
    if ((await provider.getCode(cfg.registry)) === "0x") throw new Error(`No AssessmentRegistry at ${cfg.registry} on this chain.`);
    const c = new ethers.Contract(cfg.registry, REGISTRY_ABI as unknown as string[], provider);
    const id = assessmentIdToBytes32(receipt.assessmentId);
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
    out.verifies = await c.verify(id, hexToBytes32(hash));
    const next = await c.queryFilter(c.filters.AssessmentSuperseded(id), cfg.fromBlock);
    const t = next[0]?.topics[2];
    out.supersededBy = t ? bytes32ToAssessmentId(t) : null;
    if (receipt.supersedes) {
      const old = assessmentIdToBytes32(receipt.supersedes);
      out.lineageLinked = (await c.queryFilter(c.filters.AssessmentSuperseded(old, id), cfg.fromBlock)).length > 0;
      out.oldExists = Number((await c.records(old)).timestamp) !== 0;
    }
    return out;
  } catch (e) {
    return { ...out, reachable: false, record: null, verifies: null, error: (e as Error).message.slice(0, 240) };
  }
}

const GLYPH: Record<string, string> = { pass: "✓", fail: "✕", pending: "~", not_applicable: "—", unavailable: "!" };
const WORD: Record<string, string> = { pass: "Pass", fail: "Fail", pending: "Pending", not_applicable: "Not applicable", unavailable: "Unavailable" };

async function verify(raw: string, source: string) {
  $("result").hidden = false;
  $("status").className = "status";
  $("status-title").textContent = "Checking…";
  $("status-body").textContent = "";
  $("checks").innerHTML = "";
  let receipt: Receipt;
  try {
    receipt = JSON.parse(raw) as Receipt;
    if (receipt.schema !== RECEIPT_SCHEMA || !receipt.assessmentId || !receipt.assessment) throw new Error();
  } catch {
    $("status").className = "status bad";
    $("status-title").textContent = "Not a Graspchain receipt";
    $("status-body").textContent = `Expected a JSON document with "schema": "${RECEIPT_SCHEMA}".`;
    return;
  }
  const canonical = canonicalReceiptJson(receipt);
  const hash = await sha256Hex(canonical);
  $("source").textContent = source;
  $("aid").textContent = receipt.assessmentId;
  $("hash").textContent = hash;
  $("score").textContent = receipt.assessment.finalScore.toFixed(1);
  $("models").textContent = `${receipt.assessment.models.jev} · ${receipt.assessment.models.llm}`;
  const integ = receipt.assessment.integrity;
  $("integrity").textContent = integ
    ? `${integ.status} · ${integ.outcome}${receipt.assessment.review?.integrityDecision ? ` · teacher ${receipt.assessment.review.integrityDecision}` : ""} (${integ.rulesVersion})`
    : "not recorded (older receipt)";
  $("article").textContent = `${receipt.articleId} · attempt ${receipt.attemptNo}`;
  $("created").textContent = new Date(receipt.createdAt).toLocaleString();
  $("canonical").textContent = canonical;

  const view = await chainView(receipt, hash);
  const { status, checks } = runChecks(receipt, hash, view);
  const tone = { verified: "ok", superseded: "ok", pending: "warn", not_found: "warn", tampered: "bad", unavailable: "none" }[status];
  $("status").className = `status ${tone}`;
  $("status-title").textContent = STATUS_COPY[status].title;
  $("status-body").textContent = STATUS_COPY[status].body + (view.error ? ` (${view.error})` : "");
  $("checks").innerHTML = checks
    .map(
      (c) => `<li class="check ${c.state}">
        <span class="cid">${c.id}</span>
        <div><div class="crow"><strong>${esc(c.title)}</strong><span class="cstate"><span aria-hidden="true">${GLYPH[c.state]}</span> ${WORD[c.state]}</span></div>
        <p class="muted">${esc(c.meaning)}</p><p>${esc(c.detail)}</p></div></li>`,
    )
    .join("");
  const chainBits = [];
  if (view.record)
    chainBits.push(`On-chain score ${(view.record.scoreX10 / 10).toFixed(1)} · block time ${new Date(view.record.timestamp * 1000).toLocaleString()}`);
  if (cfg.explorerUrl && cfg.registry)
    chainBits.push(`<a href="${cfg.explorerUrl}/address/${cfg.registry}" target="_blank" rel="noreferrer">Registry on the explorer ↗</a>`);
  $("chainfacts").innerHTML = chainBits.join("<br>");
}

async function fromUrl(r: string) {
  try {
    const u = new URL(r);
    note(u.host);
    const res = await fetch(u, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await verify(await res.text(), `Fetched from ${u.host} — this is that server's copy. To check your own copy, upload your downloaded file.`);
  } catch (e) {
    $("result").hidden = false;
    $("status").className = "status bad";
    $("status-title").textContent = "Couldn't load the receipt from the link";
    $("status-body").textContent = `${(e as Error).message}. Upload the receipt file instead.`;
  }
}

function init() {
  $("chain-name").textContent = `${cfg.chainName} (${cfg.chainId})`;
  $("registry").textContent = cfg.registry ?? "not set in this build";
  const saved = (() => {
    try {
      return localStorage.getItem("gc-verifier-rpc");
    } catch {
      return null;
    }
  })();
  $<HTMLInputElement>("rpc").value = saved ?? cfg.rpcUrl;
  $<HTMLInputElement>("rpc").addEventListener("change", (e) => {
    try {
      localStorage.setItem("gc-verifier-rpc", (e.target as HTMLInputElement).value);
    } catch {
      /* storage unavailable */
    }
  });
  $<HTMLInputElement>("file").addEventListener("change", async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) await verify(await f.text(), `Your file: ${f.name} (read locally; not uploaded anywhere).`);
  });
  $("paste-go").addEventListener("click", () => verify($<HTMLTextAreaElement>("paste").value, "Pasted JSON"));
  const params = new URLSearchParams(location.search);
  if (params.get("r")) void fromUrl(params.get("r")!);
  $("hosts").textContent = "none yet";
}

init();
