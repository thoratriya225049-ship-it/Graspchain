/** Human-readable ABI of AssessmentRegistry (packages/contracts). Used by the API and the static verifier. */
export const REGISTRY_ABI = [
  "function record(bytes32 id, bytes32 recordHash, bytes32 studentRef, uint16 scoreX10, uint32 rubricVersion)",
  "function supersede(bytes32 oldId, bytes32 newId, bytes32 recordHash, bytes32 studentRef, uint16 scoreX10, uint32 rubricVersion)",
  "function anchorBatch(bytes32 root, uint32 count)",
  "function verify(bytes32 id, bytes32 recordHash) view returns (bool)",
  "function records(bytes32 id) view returns (bytes32 recordHash, bytes32 studentRef, uint16 scoreX10, uint32 rubricVersion, uint64 timestamp)",
  "function owner() view returns (address)",
  "event AssessmentRecorded(bytes32 indexed id, bytes32 indexed studentRef, bytes32 recordHash, uint16 scoreX10)",
  "event AssessmentSuperseded(bytes32 indexed oldId, bytes32 indexed newId)",
  "event BatchAnchored(bytes32 indexed root, uint32 count)",
] as const;

export const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum mainnet",
  11155111: "Ethereum Sepolia",
  31337: "Local Hardhat chain",
};
