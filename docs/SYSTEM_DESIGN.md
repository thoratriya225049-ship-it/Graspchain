# FairProof — System Design

Companion to [PRD.md](../PRD.md). This document describes *how* the system is built: components, interfaces, data flow, state, failure handling and the security model. Numbers and policies come from the PRD; if the two disagree, the PRD wins and this file must be updated.

---

## 1. Design goals and constraints

| Goal | Consequence for the design |
|---|---|
| Score in ≤ 3 s p95, feedback in ≤ 8 s | Jev is one call; the LLM segmentation step has a hard 1.8 s timeout with a deterministic fallback; feedback streams after the score |
| The number must be deterministic and injection-bounded | Only Jev probabilities + code produce the score; the LLM can only choose span boundaries of the student's own text, which the server verifies |
| Results must be verifiable without our server | Receipt is a canonical JSON document whose hash is on-chain; a static HTML verifier recomputes it in the browser |
| Fairness under load and across networks | Long-running Node process with in-memory queue (FairGate) and a delivery-aware timer (FairClock) |
| 2 people, 8 days, $0 software | Monorepo, SQLite, one server process, free tiers; nothing that needs ops |
| Production-grade | Idempotent writes, outbox for chain, health checks, migrations, CI, structured logs, rate limits, roles, audit log |

---

## 2. Component view

```
                          ┌──────────────────────────────────────────────┐
                          │  Browser (student / teacher / judge)          │
                          │  Next.js app  ·  Static Verifier page         │
                          └───────┬───────────────────────────┬──────────┘
                                  │ REST + SSE (polling fallback)│ JSON-RPC (PublicNode)
┌─────────────────────────────────▼───────────────────────────┐ │
│ apps/api — Fastify (single long-running Node 22 process)     │ │
│                                                              │ │
│  ┌────────────┐  ┌───────────┐  ┌───────────────┐            │ │
│  │ Auth/Roles │  │ Session   │  │ FairGate      │            │ │
│  │ cookie sig │  │ state mc  │  │ windows/admit │            │ │
│  └────────────┘  │ FairClock │  └───────────────┘            │ │
│                  └─────┬─────┘                               │ │
│                        │ submit                              │ │
│  ┌─────────────────────▼──────────────────────────────────┐  │ │
│  │ Evaluator pipeline                                      │  │ │
│  │  1 Segment (LLM, 1.8s timeout) → validate spans         │  │ │
│  │  2 Judge   (Jev, one systemOne call) → zod              │  │ │
│  │  3 Fuse    (pure function, packages/shared)             │  │ │
│  │  4 Explain (LLM, streamed) → validate quotes            │  │ │
│  └─────────────────────┬──────────────────────────────────┘  │ │
│                        │ receipt                             │ │
│  ┌─────────────────────▼───────────┐   ┌──────────────────┐  │ │
│  │ Trust service                   │   │ Chain writer     │  │ │
│  │ canonicalize → sha256 → outbox  │──►│ (worker, nonce,  │──┼─┼─► Ethereum Sepolia
│  └─────────────────────────────────┘   │  fee cap, retry) │  │ │   AssessmentRegistry
│                                        └──────────────────┘  │ │
│  ┌─────────────┐ ┌──────────┐ ┌───────────┐ ┌─────────────┐  │ │
│  │ Teacher svc │ │ Research │ │ Admin     │ │ api_cache   │  │ │
│  │ review/supersede│ export │ │ tamper    │ │ (Jev/LLM)   │  │ │
│  └─────────────┘ └──────────┘ └───────────┘ └─────────────┘  │ │
│                      SQLite (better-sqlite3, WAL)             │ │
└───────────┬─────────────────────┬────────────────────────────┘ │
            │                     │                               │
     Jev (TypeSafe API      LLM (Gemini / Groq            Sepolia RPC ◄────┘
     direct | Vercel GW |    via Vercel AI SDK)            (PublicNode, Alchemy backup,
     OpenRouter)                                           local Hardhat fallback)
```

### 2.1 Components and responsibilities

| Component | Package | Responsibility | Does **not** |
|---|---|---|---|
| Web app | `apps/web` | Screens S1–S12, SSE client with polling fallback, X-Ray rendering, QR | Hold secrets; compute scores; keep article text after hide |
| Static verifier | `apps/verifier` | Recompute receipt hash, call `verify()` and `records()` via public RPC, show V1–V4 | Call our API; store anything |
| Auth | `apps/api/src/auth` | Roster-code login, signed HTTP-only cookie, roles (student/teacher/admin) | Passwords (demo), OAuth |
| Session service | `apps/api/src/session` | State machine, server-enforced hide, FairClock deadline, answer validation, idempotent submit | Evaluation |
| FairGate | `apps/api/src/fairgate` | Tickets, windowed shuffle, admission tokens, concurrency | Persistence beyond crash recovery (tickets are also written to SQLite for metrics) |
| Evaluator | `apps/api/src/evaluator` | 4-stage pipeline orchestration, timeouts, caching, SSE event emission | Scoring math (lives in `packages/shared`) |
| Jev client | `packages/shared/jev` | Question builder, `TypeSafeClient` wrapper with `baseURL` routing, zod response schema, re-ask, order-flip | Business rules |
| LLM client | `packages/shared/llm` | Provider-pluggable `generateObject`/`streamObject`, segmentation + feedback prompts, validators | Scores |
| Fusion | `packages/shared/fusion` | Pure deterministic function: Jev answers + overlap → dimensions + final score | I/O |
| Trust service | `apps/api/src/trust` | Build receipt, canonicalize, hash, enqueue outbox, verify checks V1–V4 | Send transactions directly |
| Chain writer | `apps/api/src/chain` | Single worker over `chain_outbox`: nonce, fee cap, retries, status updates | Block the request path |
| Teacher service | `apps/api/src/teacher` | Review queue, override → new receipt with `supersedes` → `supersede()` tx | Edit existing records |
| Research/Admin | `apps/api/src/research`, `/admin` | Anonymized export; demo-only tamper; mode toggles; audit log | Run in production (`ADMIN_DEMO_TOOLS=0`) |
| Contracts | `packages/contracts` | `AssessmentRegistry.sol`, tests, Ignition deploy, Etherscan verify | Store any data beyond hashes and the score |

---

## 3. Data flow: one evaluation end to end

```mermaid
sequenceDiagram
    participant B as Browser
    participant S as Session svc
    participant E as Evaluator
    participant L as LLM
    participant J as Jev
    participant T as Trust svc
    participant W as Chain writer
    participant C as Sepolia

    B->>S: POST /session {articleId, admissionToken?}
    S-->>B: {sessionId, readSeconds}
    B->>S: GET /session/:id/article
    S-->>B: article text (sentAt recorded)
    B->>S: POST /session/:id/render-ack
    S-->>B: {readDeadline}  (FairClock)
    Note over B,S: deadline → article hidden client-side; GET /article now 403
    B->>S: POST /session/:id/finish-reading
    B->>S: POST /session/:id/submit {answer, idempotencyKey}  (SSE opens)
    S->>E: evaluate(attempt)
    E->>L: segment(answer)  [timeout 1.8 s]
    L-->>E: claims[] → validate substrings, coverage ≥ 80%
    E->>J: systemOne(state, questions)  [cache check first]
    J-->>E: answers (probabilities) → zod → gating / re-ask
    E->>E: fuse() → dimensions, finalScore
    E-->>B: event: score
    E->>L: feedback(stream)
    L-->>E: partial JSON
    E-->>B: event: feedback (chunks) → validated
    E-->>B: event: xray
    E->>T: buildReceipt()
    T->>T: canonicalize → sha256 → insert receipt + outbox row
    E-->>B: event: record {assessmentId, chainStatus: queued}
    E-->>B: event: done
    W->>C: record(id, hash, studentRef, scoreX10, rubricVersion)
    C-->>W: tx hash / receipt
    W->>T: update chainStatus=mined, ethTx, gasUsed
```

### 3.1 Latency budget (p95 targets)

| Step | Budget | Mechanism if exceeded |
|---|---|---|
| Segmentation | 1.8 s | `AbortController` → sentence splitter; `segmentation = "sentence-fallback"` |
| Jev call | 0.5 s (vendor 70–500 ms) | Retry 429/529 with backoff; on persistent failure → `evaluation delayed` state, retried by worker |
| Fusion + persist | 50 ms | — |
| **score event** | **≤ 3 s** | — |
| Feedback stream | +5 s | Timeout → template feedback from Jev results |
| Receipt + outbox insert | 50 ms | — |
| Chain mined | async (seconds–minutes) | Never awaited on the request path |

---

## 4. Module designs

### 4.1 Session state machine

```
CREATED ──(GET article)──► READING ──(finish-reading | deadline)──► WRITING ──(submit)──► EVALUATING ──► DONE
   │                                                                                              │
   └───────────────────────────(ttl)──────────────────────────────► EXPIRED ◄── (eval failure, retry exhausted)
```

Rules enforced server-side:
- `GET /article` allowed only in `READING` and `now < readDeadline`. Otherwise `403 { code: "ARTICLE_HIDDEN" }` permanently.
- `submit` allowed only in `WRITING`; `idempotencyKey` is unique per session; a replay returns the existing attempt's stream/polling URL.
- Transitions are executed in a single SQLite transaction with a `WHERE state = ?` guard (optimistic concurrency).

FairClock computation (`session/fairclock.ts`):
```ts
export function computeDeadline(sentAt: number, ackAt: number | null, readSeconds: number, cfg: { capS: number; mode: "naive" | "fair" }) {
  if (cfg.mode === "naive") return sentAt + readSeconds * 1000;
  const delay = ackAt == null ? cfg.capS * 1000 : Math.min(ackAt - sentAt, cfg.capS * 1000);
  return sentAt + delay + readSeconds * 1000;
}
```
The provisional deadline (no ack yet) uses the full cap; when the ack arrives the deadline is tightened, never extended beyond the cap.

### 4.2 FairGate

In-memory structures (also mirrored to `queue_tickets` for metrics and crash recovery):
```ts
type Ticket = { id: string; studentId: string; joinedAt: number; windowId?: string; position?: number; state: "waiting" | "admitted" | "expired" | "used" };
```
Loop every `WINDOW_MS` (burst window `BURST_WINDOW_MS` for the first window after queue open):
1. Collect tickets with `joinedAt` in `[t − W, t)` and no position.
2. Seed = `sha256(windowId + QUEUE_SECRET)`; Fisher–Yates shuffle with a seeded PRNG.
3. Assign positions `nextPosition++` in shuffled order; persist `{windowId, seed, order}`.
4. Admission loop: while `inFlight < CONCURRENCY` and a waiting ticket exists, admit the lowest position, mint an HMAC admission token `{ticketId, exp}`; `inFlight` decrements when the session reaches `DONE`/`EXPIRED` or the token expires unused.

`FAIR_MODE=fifo` skips step 2 (position = arrival order). Equality rules: one open ticket per student (`UNIQUE(studentId) WHERE state='waiting'`), no priority fields exist anywhere in the schema.

### 4.3 Evaluator pipeline

```ts
export async function evaluate(attempt: Attempt, emit: (e: SseEvent) => void, deps: Deps): Promise<EvaluationRow> {
  const t0 = now();
  const seg = await withTimeout(deps.llm.segment(attempt.answerText), cfg.SEGMENT_TIMEOUT_MS)
                .catch(() => null);
  const claims = validateClaims(seg?.claims ?? [], attempt.answerText);   // substring + dedupe + coverage ≥ 0.8 else add sentences
  const state = buildState(article, attempt.answerText, claims);
  const questions = buildQuestions(article, claims);                      // kp*, c*_support, c*_source, accuracy, reasoning, 3 nouls, weakness
  let jev = await deps.jev.systemOne({ model: cfg.JEV_MODEL, state, questions });  // cached by sha256(JSON(state,questions,model))
  jev = await reaskIfUncertain(jev, deps.jev, state, questions);          // once, rephrased; average distributions
  const overlap5 = fiveGramOverlap(attempt.answerText, article.text);
  const fused = fuse(jev.answers, claims, article.keyPoints, overlap5);   // pure, in packages/shared
  emit({ type: "score", ...fused.public, flags: fused.flags, lowConfidence: fused.lowConfidence, tScoreMs: now() - t0 });

  const feedback = await deps.llm.feedbackStream({ article, claims, answer: attempt.answerText, jev: jev.answers }, chunk => emit({ type: "feedback", chunk }));
  const validatedFeedback = validateFeedback(feedback, attempt.answerText, article.keyPoints, claims, jev.answers) ?? templateFeedback(fused, article);
  emit({ type: "xray", ...buildXray(article, jev.answers, claims, validatedFeedback) });

  const receipt = deps.trust.buildReceipt({ attempt, fused, jev, claims, validatedFeedback, segmentation: seg ? "llm" : "sentence-fallback" });
  await deps.trust.commit(receipt);                                        // insert receipt + outbox in one tx
  emit({ type: "record", assessmentId: receipt.assessmentId, chainStatus: "queued" });
  emit({ type: "done" });
  return persistEvaluation(...);
}
```

Claim validator (the injection boundary for Stage 1):
```ts
export function validateClaims(raw: string[], answer: string): Claim[] {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const a = norm(answer);
  const kept = uniq(raw.map(norm).filter(c => c.split(" ").length >= 3 && a.includes(c))).slice(0, 12);
  const covered = coverage(kept, a);                         // fraction of non-space chars inside any kept span
  const claims = covered >= 0.8 ? kept : [...kept, ...uncoveredSentences(a, kept)];
  return claims.map((text, i) => ({ claimId: `c${i + 1}`, text, ...spanOf(answer, text) }));
}
```

### 4.4 Jev client

```ts
const client = new TypeSafeClient({ apiKey: cfg.JEV_API_KEY, baseURL: cfg.JEV_BASE_URL });  // direct | Vercel GW | OpenRouter
```
- Request/response validated with zod schemas mirroring the official fields (`choice/probabilities/confidence`, `score/legend/probabilities/confidence`, `noul`, `model`, `usage`).
- `api_cache` keyed by `sha256(model + JCS(state) + JCS(questions))`; benchmark re-runs bypass the cache explicitly (`cache: "bypass"`).
- Uncertainty: `confidence < 0.6` or `|2·noul − 1| < 0.3`.
- `JEV_ORDER_DEBIAS=on`: evaluate choice questions twice with reversed option order and average probabilities (used in E3 and optionally in production).
- Daily token cap: sum of `usage.input_tokens` per UTC day in `api_usage`; over cap → `503 { code: "BUDGET_EXHAUSTED" }` unless `DEMO_MODE=replay`.

### 4.5 Fusion (pure)

Input: Jev answers, claims, key points, `overlap5`. Output: `{ C, P, A, R, O, finalScore, band, labels, claimSummary, misconceptions, lowConfidence, flags }`. Formula exactly as PRD §9.2.7. Property tests: monotonic in `p(correct)`, bounded 1–10, same input → same output, gibberish cap, purpose cap.

### 4.6 Trust service and receipt

- `buildReceipt()` produces the `fairproof.receipt/1` object (PRD §9.4.2); floats rounded to 4 dp **before** canonicalization.
- `recordHash = sha256(canonicalize(receipt))` using `canonicalize` (RFC 8785). The same function is bundled into the verifier; CI runs a fixture through both Node and headless Chromium and asserts equality.
- `commit()` inserts `receipts` + `chain_outbox` in one transaction.
- `verify(assessmentId)` returns V1–V4 using the server copy plus on-chain reads (`verify()`, `records()`, `AssessmentSuperseded` event lookup).

### 4.7 Chain writer (outbox worker)

```
loop every 2 s:
  row = SELECT * FROM chain_outbox WHERE status IN ('queued','retry') ORDER BY id LIMIT 1
  if gasPrice > MAX_FEE_GWEI: sleep (status stays queued; UI shows "pending: fee cap")
  tx = registry.record(id, hash, studentRef, scoreX10, rubricVersion, { nonce: managed, maxFeePerGas: cap })
  status=sent, txHash; await receipt → status=mined, gasUsed; on error → attempts++, backoff, status=retry (max 10) else failed
```
- One worker per process; nonce taken from `getTransactionCount("pending")` at start and incremented locally; on `nonce too low` resync.
- Idempotent: before sending, `registry.records(id).timestamp != 0` → mark mined without sending.
- `supersede()` rows carry `kind = "supersede"` and `oldId`.

### 4.8 Teacher override

1. Teacher opens a queued item (lowConfidence or injectionSuspected or any attempt by search).
2. Submits `{ newScore, reason }`.
3. Service clones the receipt → new `assessmentId`, `supersedes = oldId`, `assessment.finalScore = newScore`, `assessment.review = { reviewerRef, reason, at }`, recomputes hash, inserts receipt + outbox row of kind `supersede`.
4. Verify page shows the lineage; V4 checks the on-chain link.

### 4.9 Static verifier

Plain HTML + ethers 6 UMD (pinned) + bundled `canonicalize` + WebCrypto. Steps: load receipt (file or QR URL) → round floats → canonicalize → SHA-256 → `verify(idBytes32, hash)` → `records(id)` for score and timestamp → if `supersedes` set, query `AssessmentSuperseded(oldId, newId)` logs → render V1–V4. Contract address, ABI and chain id (11155111) are constants; an "RPC URL" field defaults to PublicNode and can be pointed at `http://127.0.0.1:8545` for the local-chain demo.

---

## 5. Data model

SQLite, WAL, foreign keys on, numbered migrations in `apps/api/migrations/NNN_*.sql`. Full column list in PRD §10. Key constraints:

```sql
CREATE UNIQUE INDEX attempts_idem ON attempts(sessionId, idempotencyKey);
CREATE UNIQUE INDEX tickets_open  ON queue_tickets(studentId) WHERE state = 'waiting';
CREATE INDEX outbox_status        ON chain_outbox(status, id);
CREATE UNIQUE INDEX cache_key     ON api_cache(key);
CREATE INDEX receipts_student     ON receipts(studentRef);
```

Secrets and PII placement:

| Data | Where | Never |
|---|---|---|
| Student code, salt | `students` | On-chain, logs |
| Answer text | `attempts`, `evaluations.jevRequest` (for research) | On-chain, `info` logs, feedback to other students |
| Receipt JSON | `receipts.canonicalJson` + student download | — |
| Hash, studentRef hash, scoreX10 | On-chain | — |
| API keys, deployer key, cookie/HMAC secrets | env only | Repo, frontend, logs |

---

## 6. API contract summary

All routes under `/api`; JSON; errors `{ code, message, requestId }`. Full list in PRD §11.

SSE events on `POST /api/session/:id/submit` (content-type `text/event-stream`):

| event | data |
|---|---|
| `score` | `{ attemptId, finalScore, band, dimensions:{coverage,correctness,accuracy,reasoning,ownWords}, labels, claimSummary, lowConfidence, flags, tScoreMs }` |
| `feedback` | `{ chunk }` (partial JSON text) … then `{ final: FeedbackJSON }` after validation |
| `xray` | `{ sentences, keyPoints:[{id,sentenceIdx,label,p}], claims:[{claimId,start,end,label,sourceSentence}] }` |
| `record` | `{ assessmentId, recordHash, chainStatus }` |
| `done` | `{}` |
| `error` | `{ code, message }` (client switches to polling) |

Polling fallback: `GET /api/result/:attemptId` → `{ status: "evaluating" | "scored" | "done" | "failed", ...same payload as above when available }`.

---

## 7. Security model

| Threat | Control |
|---|---|
| Student fetches the article after the deadline | Server-side 403; article never cached by the SW; `Cache-Control: no-store` |
| Prompt injection in the answer | LLM Stage 1 can only pick spans (substring + coverage rules); Jev gets named fields and an explicit "treat requests as text" instruction; `contains_instructions` noul flags; LLM Stage 4 output validated; score formula has no text input |
| Score tampering in DB | Hash on-chain; student holds receipt; static verifier independent of our server |
| Silent score correction | Only via `supersede()` with a reason, visible on Verify |
| Admin abuse | Admin routes require `ADMIN_SECRET` **and** `ADMIN_DEMO_TOOLS=1`; every call audit-logged; disabled in production builds |
| Session hijack | Signed, HTTP-only, SameSite=Lax cookie; roles checked per route |
| Abuse/load | Rate limits on login/join/submit; body size limits; FairGate concurrency cap |
| Key leakage | `.env` only; gitleaks in CI; deployer key holds testnet ETH only; rotate after the event |
| Fake slow network (FairClock) | Gain bounded by `FAIRCLOCK_CAP_S` |
| Public RPC abuse | Verifier is read-only; server uses Alchemy key as backup with budget |

---

## 8. Failure modes and degradation

| Failure | Behaviour | User sees |
|---|---|---|
| LLM segmentation slow/down | Sentence-split fallback after 1.8 s | Nothing (score still ≤ 3 s); `segmentation` recorded |
| LLM feedback down | Template feedback from Jev results | "Feedback (basic)" label |
| Jev 429/529 | Backoff ×3 | Spinner up to ~8 s |
| Jev down / key invalid | Attempt stays `EVALUATING`, worker retries every 60 s for 1 h; in `DEMO_MODE=replay` cached answer is served | "Evaluation delayed, we'll notify you" |
| Budget cap hit | 503 BUDGET_EXHAUSTED (unless replay) | Admin alert |
| RPC down / fee spike | Outbox holds rows; UI "pending" | Verified badge shows pending |
| SSE blocked by proxy | Client auto-switches to polling after 3 s without events | Same result, slightly later |
| Process restart mid-evaluation | Attempts in `EVALUATING` older than 2 min are re-queued by the startup sweep | Possibly a longer wait |
| SQLite busy | WAL + `busy_timeout=5000` | — |

---

## 9. Observability

- pino JSON logs with `requestId`, `sessionId`, `attemptId`; one `evaluation.complete` line per attempt with `segMs, jevMs, llmMs, inputTokens, llmTokens, costEst, segmentation, lowConfidence, flags`. No answer text at `info`.
- `/healthz` (process up), `/readyz` (DB open, RPC `eth_blockNumber`, Jev/LLM keys present; no paid calls).
- Admin page shows: today's Jev tokens vs cap, outbox backlog, FairGate queue length, cache hit rate.

---

## 10. Deployment topology

| Environment | Web | API | Chain | Purpose |
|---|---|---|---|---|
| Local dev | `next dev` | `tsx watch` | Hardhat node | Development |
| Docker | `docker compose up` (web, api, hardhat) | | | Reproducible full stack; CI smoke |
| Data collection (Days 2–5) | Vercel Hobby | Render free (sleeps idle) | Sepolia | Classmates submit answers |
| Demo day | Laptop (both apps) on phone hotspot | | Sepolia, local Hardhat fallback | Judges; static verifier on GitHub Pages reads Sepolia from the judge's phone |

Scale path (not built, stated): Postgres instead of SQLite, Redis-backed FairGate for multiple API instances, L2 deployment of the same contract, Merkle batching (`anchorBatch`) to amortize gas.

---

## 11. Configuration (env)

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV`, `PORT`, `WEB_ORIGIN` | — | CORS allowlist = `WEB_ORIGIN` |
| `DATABASE_PATH` | `./data/fairproof.db` | |
| `COOKIE_SECRET`, `QUEUE_SECRET`, `ADMIN_SECRET` | required | |
| `ADMIN_DEMO_TOOLS` | `0` | `1` only for demos |
| `DEMO_MODE` | `off` | `replay` serves `api_cache` only |
| `JEV_BASE_URL` | `https://api.typesafe.ai` | or Vercel GW / OpenRouter |
| `JEV_API_KEY`, `JEV_MODEL` | required, `jev-1.13.0` | |
| `JEV_DAILY_TOKEN_CAP` | `2000000` | |
| `JEV_ORDER_DEBIAS` | `off` | |
| `LLM_PROVIDER`, `LLM_MODEL` | `google`, model id | `groq` alternative |
| `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY` | — | |
| `SEGMENT_TIMEOUT_MS` | `1800` | |
| `CLOCK_MODE`, `FAIRCLOCK_CAP_S` | `fair`, `10` | |
| `FAIR_MODE`, `WINDOW_MS`, `BURST_WINDOW_MS`, `CONCURRENCY`, `TOKEN_TTL_S` | `fair`, `2000`, `5000`, `3`, `30` | |
| `CHAIN_RPC_URL`, `CHAIN_RPC_BACKUP_URL`, `CHAIN_ID` | PublicNode, Alchemy, `11155111` | local: `http://127.0.0.1:8545`, `31337` |
| `REGISTRY_ADDRESS`, `DEPLOYER_PRIVATE_KEY`, `MAX_FEE_GWEI` | —, —, `30` | |
| `ETHERSCAN_API_KEY` | — | contracts package only |
