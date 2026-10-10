import type { EvidenceDecision, KpClassification } from "./evidence";
import type { IntegrityAssessment, IntegrityDecision, IntegrityOutcome, IntegrityStatus } from "./integrity";

/**
 * Domain types shared by the API, the web app, the scripts and the static verifier.
 * Field names follow PRD §9 and SYSTEM_DESIGN §6.
 */

export type Role = "student" | "teacher" | "admin";

export type KpLabel = "correct" | "vague" | "absent" | "incorrect";
export type ClaimLabel = "supported" | "partial" | "not_in_article" | "contradicted";
export type Weakness = "none" | "missing_concept" | "misconception" | "vague" | "poor_reasoning" | "off_topic";
export type Band = "Surface" | "Partial" | "Functional" | "Deep" | "Expert";
export type ClockMode = "fair" | "naive";
export type FairMode = "fair" | "fifo";
export type Segmentation = "llm" | "sentence-fallback";
export type SessionState = "CREATED" | "READING" | "WRITING" | "EVALUATING" | "DONE" | "EXPIRED";
export type AttemptStatus = "evaluating" | "scored" | "done" | "delayed" | "failed";
export type ChainStatus = "queued" | "sent" | "mined" | "failed";

// ───────────────────────── Articles (content/articles/*.json) ─────────────────────────

export interface KeyPoint {
  id: string;
  weight: number;
  /** Short name shown in checklists ("Hashing up to a single root"). */
  concept: string;
  /** The point as the article makes it; quoted to Jev in the kp question. */
  statement: string;
  sentenceIdx: number[];
  /** What a student should add when this point is missing (template feedback). */
  addHint: string;
  /** An example sentence that states the point well (template feedback). */
  example: string;
  /**
   * Phrase groups used only by the local demo judge (never by Jev). A group counts as matched
   * if any phrase in it appears in a claim.
   */
  cues: string[][];
}

export interface Misconception {
  id: string;
  kpId: string;
  /** The misconception in plain words ("Merkle trees encrypt the data"). */
  statement: string;
  why: string;
  correction: string;
  /** Local demo judge only: phrases that signal the misconception… */
  any: string[];
  /** …unless one of these negations is also present. */
  unless?: string[];
}

export interface Article {
  id: string;
  title: string;
  dek: string;
  topic: string;
  difficulty: 1 | 2 | 3;
  skillTags: string[];
  rubricVersion: number;
  sentences: string[];
  /** Sentence indices that start a new paragraph. */
  breaks: number[];
  keyPoints: KeyPoint[];
  commonMisconceptions: Misconception[];
  /** Local demo judge only: every group must match for the central claim to count. */
  purposeCues: string[][];
  /** Prepared answers for demos (clearly labelled in the UI). */
  samples: { label: string; text: string }[];
}

/** What the article list endpoint returns: never the text. */
export interface ArticleSummary {
  id: string;
  title: string;
  dek: string;
  topic: string;
  difficulty: 1 | 2 | 3;
  skillTags: string[];
  wordCount: number;
  readSeconds: number;
  keyPointCount: number;
  attemptsByMe: number;
  bestScore: number | null;
  lastScore: number | null;
}

// ───────────────────────── Claims (Stage 1) ─────────────────────────

export interface Claim {
  claimId: string;
  text: string;
  start: number;
  end: number;
  source: "llm" | "sentence";
}

// ───────────────────────── Jev (Stage 2) ─────────────────────────

export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}
export interface ScoreAnswer {
  type: "score";
  score: number;
  confidence: number;
  legend?: Record<string, unknown>;
  probabilities: Record<string, number>;
}
export interface NoulAnswer {
  type: "noul";
  noul: number;
}
export type JevAnswer = ChoiceAnswer | ScoreAnswer | NoulAnswer;
export type JevAnswers = Record<string, JevAnswer>;

export interface JevUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface JudgeResult {
  model: string;
  answers: JevAnswers;
  usage: JevUsage;
}

// ───────────────────────── Fusion (Stage 3) ─────────────────────────

export interface Dimensions {
  coverage: number;
  correctness: number;
  accuracy: number;
  reasoning: number;
  ownWords: number;
}

export interface KpResult {
  id: string;
  label: KpLabel;
  /** Probability of the chosen label. */
  p: number;
  probabilities: Record<KpLabel, number>;
  confidence: number;
}

export interface ClaimResult {
  claimId: string;
  label: ClaimLabel;
  p: number;
  probabilities: Record<ClaimLabel, number>;
  confidence: number;
  /** Article sentence index Jev linked the claim to (`c*_source`), or null for "none". */
  sourceSentence: number | null;
  sourceConfidence: number;
}

export interface Flags {
  injectionSuspected: boolean;
  gibberishSuspected: boolean;
  mainPurposeMissing: boolean;
  /** Counted from server-recorded integrity events (never from what the client claims at submit). */
  pasteCount: number;
  blurCount: number;
  copyCount: number;
}

export interface Contribution {
  key: keyof Dimensions;
  weight: number;
  value: number;
  points: number;
}

export interface FusionResult {
  dimensions: Dimensions;
  contributions: Contribution[];
  keyPoints: KpResult[];
  claims: ClaimResult[];
  misconceptionCount: number;
  adjustments: string[];
  finalScore: number;
  band: Band;
  noul: { mainPurpose: number; gibberish: number; containsInstructions: number };
  weakness: Weakness;
  overlap5: number;
}

/** Payload of the `score` SSE event (SYSTEM_DESIGN §6). */
export interface ScorePayload {
  attemptId: string;
  finalScore: number;
  band: Band;
  dimensions: Dimensions;
  contributions: Contribution[];
  adjustments: string[];
  labels: Record<string, KpLabel>;
  keyPoints: { id: string; concept: string; label: KpLabel; p: number; weight: number }[];
  claimSummary: ClaimSummary;
  lowConfidence: boolean;
  uncertainItems: string[];
  flags: Flags;
  tScoreMs: number;
  judge: JudgeInfo;
  segmentation: Segmentation;
  /** Evidence judge only: the validated evidence and every rule that fired. */
  evidence?: EvidenceDecision | null;
  /** Assessment conditions, judged separately from comprehension (never deducted from the score). */
  integrity?: IntegrityAssessment | null;
}

export type JudgeKind = "jev" | "local" | "evidence";

export interface JudgeInfo {
  kind: JudgeKind;
  model: string;
  /** True when this answer came from the response cache (DEMO_MODE=replay or repeat input). */
  cached: boolean;
}

export interface ClaimSummary {
  count: number;
  supported: number;
  partial: number;
  notInArticle: number;
  contradicted: number;
}

// ───────────────────────── Feedback (Stage 4) ─────────────────────────

export interface Feedback {
  oneLineSummary: string;
  understood: { keyPointId: string; evidence: string }[];
  missed: { keyPointId: string; whatToAdd: string }[];
  misunderstood: { claimId: string; studentQuote: string; why: string; correctVersion: string }[];
  couldBeBetter: { action: string; exampleSentence: string }[];
  nextStep: string;
}

export interface FeedbackRecord {
  source: "llm" | "template";
  /** Why the template was used, when it was. */
  fallbackReason: string | null;
  model: string | null;
  feedback: Feedback;
  /** Items the validators removed from the LLM output (E4c grounding statistics). */
  dropped: number;
}

// ───────────────────────── X-Ray ─────────────────────────

export interface XRay {
  articleId: string;
  title: string;
  sentences: string[];
  breaks: number[];
  keyPoints: { id: string; concept: string; statement: string; sentenceIdx: number[]; label: KpLabel; p: number }[];
  claims: {
    claimId: string;
    text: string;
    start: number;
    end: number;
    label: ClaimLabel;
    p: number;
    sourceSentence: number | null;
    correctVersion: string | null;
    why: string | null;
  }[];
  answer: string;
}

// ───────────────────────── Receipt (PRD §9.4.2) ─────────────────────────

export const RECEIPT_SCHEMA = "graspchain.receipt/1" as const;

export interface Receipt {
  schema: typeof RECEIPT_SCHEMA;
  assessmentId: string;
  supersedes: string | null;
  studentRef: string;
  articleId: string;
  articleHash: string;
  answerHash: string;
  attemptNo: number;
  assessment: {
    rubricVersion: number;
    promptHash: string;
    models: { jev: string; llm: string };
    segmentation: Segmentation;
    labels: Record<string, KpLabel>;
    claimSummary: ClaimSummary;
    dimensions: Dimensions;
    finalScore: number;
    lowConfidence: boolean;
    flags: { injectionSuspected: boolean; pasteCount: number; blurCount: number };
    feedbackHash: string;
    review: { reviewerRef: string; reason: string; at: string; previousScore: number; integrityDecision?: IntegrityDecision } | null;
    /** Evidence judge: key-point classifications and a hash binding the full evidence trail. */
    evidence?: { judge: string; classifications: Record<string, KpClassification>; decisionHash: string };
    /** Assessment conditions: status, outcome and a hash binding the integrity event log. */
    integrity?: ReceiptIntegrity;
  };
  fairness: {
    admissionMode: FairMode;
    admissionWindowId: string | null;
    clockMode: ClockMode;
    readSecondsGranted: number;
    latencyCompMs: number;
  };
  createdAt: string;
}

export interface ReceiptIntegrity {
  rulesVersion: string;
  status: IntegrityStatus;
  outcome: IntegrityOutcome;
  points: number;
  eventCount: number;
  eventsHash: string;
  findings: string[];
}

// ───────────────────────── Verification (PRD §9.4.5) ─────────────────────────

export type CheckState = "pass" | "fail" | "pending" | "not_applicable" | "unavailable";

export interface VerificationCheck {
  id: "V1" | "V2" | "V3" | "V4";
  title: string;
  state: CheckState;
  detail: string;
  meaning: string;
}

export type VerificationStatus = "verified" | "pending" | "tampered" | "superseded" | "not_found" | "unavailable";

/** On-chain facts about one assessment id, read from AssessmentRegistry. */
export interface ChainView {
  reachable: boolean;
  chainId: number | null;
  registry: string | null;
  record: { recordHash: string; studentRef: string; scoreX10: number; rubricVersion: number; timestamp: number } | null;
  /** Result of `verify(id, recomputedHash)`. */
  verifies: boolean | null;
  /** New id from an `AssessmentSuperseded(thisId, newId)` event, if one exists. */
  supersededBy: string | null;
  /** For a receipt with `supersedes`: whether `AssessmentSuperseded(supersedes, thisId)` exists. */
  lineageLinked: boolean | null;
  oldExists: boolean | null;
  error: string | null;
}

export interface FairnessInfo {
  admissionMode: FairMode;
  windowId: string | null;
  clockMode: ClockMode;
  readSecondsGranted: number;
  latencyCompMs: number;
  measuredDelayMs: number | null;
}
