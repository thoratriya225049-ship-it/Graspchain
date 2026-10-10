import type {
  ArticleSummary,
  CheckState,
  ChainView,
  Dimensions,
  FeedbackRecord,
  Receipt,
  ResultPayload,
  Role,
  ScorePayload,
  VerificationCheck,
  VerificationStatus,
  XRay,
} from "@graspchain/shared";

export type { ArticleSummary, CheckState, Dimensions, FeedbackRecord, Receipt, ResultPayload, Role, ScorePayload, VerificationCheck, VerificationStatus, XRay };

export interface Me {
  id: string;
  code: string;
  role: Role;
  label: string;
  consentAt: string | null;
  withdrawnAt: string | null;
  needsConsent: boolean;
}

export interface PublicConfig {
  appName: string;
  environment: string;
  judge: { kind: "jev" | "local"; model: string };
  llm: { enabled: boolean; provider: string | null; model: string | null };
  demoMode: "off" | "replay";
  adminDemoTools: boolean;
  chain: { chainId: number; name: string; registry: string | null; explorerUrl: string | null; publicRpcUrl: string; canWrite: boolean };
  verifierUrl: string;
  publicWebUrl: string;
  researchMode: boolean;
  clockMode: "fair" | "naive";
  fairMode: "fair" | "fifo";
  fairclockCapS: number;
  windowMs: number;
  concurrency: number;
  minWords: number;
  maxWords: number;
}

export interface Recommendation {
  articleId: string;
  weakest: "coverage" | "correctness" | "reasoning" | "ownWords" | null;
  reason: string;
  title: string;
  difficulty: number;
  readSeconds: number;
}

export interface AttemptListItem {
  attemptId: string;
  articleId: string;
  articleTitle: string;
  attemptNo: number;
  createdAt: string;
  status: string;
  seeded: boolean;
  finalScore: number | null;
  originalScore: number | null;
  reviewed: boolean;
  dimensions: Dimensions | null;
  band: string | null;
  lowConfidence: boolean;
  chainStatus: string | null;
  assessmentId: string | null;
}

export interface Profile {
  student: { id: string; code: string; label: string };
  researchHidden: boolean;
  attempts: AttemptListItem[];
  fingerprint: ({ attemptId: string; index: number; articleId: string; createdAt: string; finalScore: number } & Dimensions)[];
  retries: { articleId: string; articleTitle: string; from: string; to: string; finalScore: number; dimensions: Record<string, number> }[];
  stats: { count: number; mean: number | null; best: number | null; last: number | null } | null;
  recommendation: Recommendation;
}

export interface LineageItem {
  assessmentId: string;
  supersedes: string | null;
  supersededBy: string | null;
  chainStatus: string;
  createdAt: string;
  finalScore: number | null;
  review: { reviewerRef: string; reason: string; at: string; previousScore: number } | null;
}

export interface Result extends ResultPayload {
  attempt: {
    id: string;
    attemptNo: number;
    articleId: string;
    articleTitle: string;
    createdAt: string;
    wordCount: number;
    answer: string;
    seeded: boolean;
    sessionId: string;
  };
  fairness: {
    admissionMode: string;
    windowId: string | null;
    clockMode: string;
    readSecondsGranted: number;
    latencyCompMs: number;
    measuredDelayMs: number | null;
  };
  review: { reviewerRef: string; reason: string; at: string; previousScore: number; newScore: number } | null;
  delta: { previousAttemptId: string; finalScore: number; dimensions: Record<string, number> } | null;
  lineage: LineageItem[];
  originalAssessmentId: string | null;
}

export interface Verification {
  assessmentId: string;
  attemptId: string;
  receipt: Receipt;
  computedHash: string;
  storedHash: string;
  chain: ChainView;
  status: VerificationStatus;
  checks: VerificationCheck[];
  chainStatus: string;
  tx: { hash: string; blockNumber: number | null; gasUsed: number | null; minedAt: string | null; url: string | null } | null;
  registryUrl: string | null;
  tampered: { field: string; at: string | null } | null;
  lineage: LineageItem[];
}

export interface TicketView {
  ticketId: string;
  state: "waiting" | "admitted" | "used" | "done" | "expired";
  mode: "fair" | "fifo";
  articleId: string | null;
  joinedAt: number;
  windowId: string | null;
  windowClosesAt: number | null;
  position: number | null;
  ahead: number | null;
  inService: number;
  waitingTotal: number;
  concurrency: number;
  estWaitSec: number;
  admissionToken: string | null;
  tokenExpiresAt: number | null;
  demoLoad: boolean;
  serverNow: number;
}

export interface SessionView {
  sessionId: string;
  articleId: string;
  state: "CREATED" | "READING" | "WRITING" | "EVALUATING" | "DONE" | "EXPIRED";
  readSeconds: number;
  readDeadline: number | null;
  sentAt: number | null;
  ackAt: number | null;
  clockMode: "fair" | "naive";
  latencyCompMs: number;
  measuredDelayMs: number | null;
  admissionMode: string;
  windowId: string | null;
  attemptId: string | null;
  serverNow: number;
}

export interface ArticlesResponse {
  articles: ArticleSummary[];
  recommended: Recommendation | null;
}

export type { ChainView };
