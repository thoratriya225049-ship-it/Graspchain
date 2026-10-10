import canonicalizeJcs from "canonicalize";

/**
 * Receipt hashing (PRD §9.4.2): round floats to 4 dp → RFC 8785 JCS → SHA-256.
 * The `canonicalize` module is the same file the static verifier bundles, so the server and
 * any browser compute byte-identical input to the hash.
 */
export function canonicalize(value: unknown): string {
  const out = canonicalizeJcs(value);
  if (out === undefined) throw new Error("Value has no JSON representation");
  return out;
}

/** Round every non-integer number to `dp` decimals so hashes are stable across runtimes. */
export function roundFloats<T>(value: T, dp = 4): T {
  const f = 10 ** dp;
  const walk = (v: unknown): unknown => {
    if (typeof v === "number") return Number.isInteger(v) ? v : Math.round(v * f) / f;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(value) as T;
}

/** SHA-256 hex via Web Crypto (browsers and Node ≥ 20). */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function canonicalReceiptJson(receipt: unknown): string {
  return canonicalize(roundFloats(receipt));
}

export async function hashReceipt(receipt: unknown): Promise<string> {
  return sha256Hex(canonicalReceiptJson(receipt));
}

// ───────────────────── On-chain encodings (AssessmentRegistry) ─────────────────────

/** uuid v4 → bytes32: the 16 uuid bytes, left-padded with zeros. Reversible, collision-free. */
export function assessmentIdToBytes32(uuid: string): string {
  const hex = uuid.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error(`Not a uuid: ${uuid}`);
  return "0x" + hex.padStart(64, "0");
}

export function bytes32ToAssessmentId(b32: string): string {
  const hex = b32.toLowerCase().replace(/^0x/, "").slice(-32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** sha256 hex → bytes32. */
export function hexToBytes32(hex: string): string {
  const h = hex.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(h)) throw new Error("Not a 32-byte hex digest");
  return "0x" + h;
}

export function scoreX10(finalScore: number): number {
  return Math.round(finalScore * 10);
}
