import type { Receipt } from "../src/types";

/** Shared by the Node unit test and the Chromium cross-check (apps/web/e2e/trust.spec.ts). */
export const FIXTURE: Receipt = {
  schema: "graspchain.receipt/1",
  assessmentId: "3f1c2b9e-4a7d-4c1e-9b2a-7d6e5f4a3b21",
  supersedes: null,
  studentRef: "a".repeat(64),
  articleId: "A1",
  articleHash: "b".repeat(64),
  answerHash: "c".repeat(64),
  attemptNo: 1,
  assessment: {
    rubricVersion: 1,
    promptHash: "d".repeat(64),
    models: { jev: "jev-1.13.0", llm: "google/gemini-flash" },
    segmentation: "llm",
    labels: { kp1: "correct", kp2: "vague", kp3: "absent", kp4: "correct" },
    claimSummary: { count: 5, supported: 3, partial: 1, notInArticle: 0, contradicted: 1 },
    dimensions: { coverage: 0.78123456, correctness: 0.68, accuracy: 0.75, reasoning: 0.5, ownWords: 0.9 },
    finalScore: 7.1,
    lowConfidence: false,
    flags: { injectionSuspected: false, pasteCount: 0, blurCount: 1 },
    feedbackHash: "e".repeat(64),
    review: null,
  },
  fairness: { admissionMode: "fair", admissionWindowId: "w-000123", clockMode: "fair", readSecondsGranted: 98, latencyCompMs: 3400 },
  createdAt: "2026-10-10T10:15:30Z",
};

/** Pinned so any change to canonicalization or rounding is caught (and mirrored by the browser test). */
export const FIXTURE_HASH = "b04bd02c38746d343811e35b27273f3399b36c62481e263e38ae104ac9eb6128";
