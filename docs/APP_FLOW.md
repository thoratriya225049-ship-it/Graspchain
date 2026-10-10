# FairProof — App Flow

Screen-by-screen behaviour for every user, with the API calls, states and error paths behind each step. Screen ids match [PRD.md](../PRD.md) §6; endpoints match [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) §6.

---

## 1. Roles and entry points

| Role | Entry | Auth |
|---|---|---|
| Student | `/` → `/login` | Roster code → signed cookie (`role=student`) |
| Teacher | `/teacher` | Roster code with `role=teacher` |
| Admin (demo/research) | `/admin` | Teacher/admin cookie **and** `ADMIN_SECRET` header; only when `ADMIN_DEMO_TOOLS=1` |
| Verifier (anyone) | `/verify/:assessmentId` (our page) · `https://<org>.github.io/fairproof-verify/` (independent) | None |

---

## 2. Student flow

### 2.1 Overview

```
S1 Login → S2 Pick article → [S3 Queue] → S4 Reading → S5 Writing → S6 Result → S7 X-Ray → S8 Profile
                                                                    └→ S9 Verify / receipt / QR
```

### 2.2 S1 Login
- Input: roster code (e.g. `TEC-042`). `POST /api/auth/login {code}` → sets cookie, returns `{studentId, role, displayCode}`.
- Errors: unknown code → "Code not found. Ask your instructor." (429 after 10 tries/min).
- First login shows the **consent screen** (research mode): what is stored, which providers see the summary text (Jev; Gemini free tier "used to improve our products" / Groq), that nothing identifying goes on-chain, and that they can withdraw. Stored as `students.consentAt`.

### 2.3 S2 Article picker
- `GET /api/articles` → list with `difficulty`, `skillTags`, `attemptsByMe`, and `recommended: {articleId, reason}` from `GET /api/profile/:studentId`.
- Recommended card is highlighted with its reason ("your reasoning score is lowest").
- Click "Start" → if FairGate is enabled and the queue is non-empty or load is high, go to S3; else go straight to session creation.

### 2.4 S3 Queue (FairGate; only under load)
1. `POST /api/queue/join` → `{ticketId, windowId?, position?}`; error `409 TICKET_OPEN` if the student already has one.
2. Poll `GET /api/queue/:ticketId` every 1 s → `{state, position, estWaitSec, admissionToken?}`.
3. Shows: ticket id, position, estimated wait, and a one-line explanation: "Everyone who joined in the same 2-second window is ordered randomly, so a faster connection doesn't help."
4. On `state = admitted` → auto-continue with `admissionToken` (valid 30 s). If it expires, "Your slot expired, rejoin" (one click).

### 2.5 S4 Reading (FairClock)
1. `POST /api/session {articleId, admissionToken?}` → `{sessionId, readSeconds}` (state `CREATED`).
2. `GET /api/session/:id/article` → `{title, text, sentAt}`; state → `READING`.
3. After the article is painted (`requestAnimationFrame` ×2), `POST /api/session/:id/render-ack` → `{readDeadline}`. The countdown ring starts from the server's `readDeadline`, not from page load.
4. UI: title, body, word count, countdown ring, "I'm done reading" button. No copy/select restrictions (we don't proctor), but `copy` events are counted client-side and sent with the answer.
5. At `readDeadline` (or on "I'm done reading" → `POST /finish-reading`): the article fades out over 600 ms, is removed from React state and DOM, and the page navigates to S5. Any further `GET /article` returns `403 ARTICLE_HIDDEN`.
- Demo note: with `CLOCK_MODE=naive`, step 3 returns `sentAt + readSeconds`, so a throttled window visibly loses seconds. The split-screen demo uses two windows, one with Playwright/DevTools "Slow 3G".

### 2.6 S5 Writing
- Prompt: "What is this article about, and why does it matter? Use your own words."
- Textarea with live word count (30–300), paste counter and blur counter (shown as neutral flags later, never penalties).
- "Submit" enabled only when 30 ≤ words ≤ 300 and state = `WRITING`.
- Submit: `POST /api/session/:id/submit {answer, idempotencyKey, pasteCount, blurCount, copyCount}` opens an SSE stream. Double-click or refresh re-sends the same `idempotencyKey` and reattaches to the existing attempt.

### 2.7 S6 Result (streams in)
Order of appearance:
1. **Score card** on the `score` event (~2 s): big number, band ("Functional"), four bars (Coverage, Correctness, Reasoning, Own words), key-point checklist (✔ ~ ✘ ○ with text labels), badges: "Flagged for teacher review" (lowConfidence), "Contains instructions to the grader" (injectionSuspected), "Fair entry · Fair clock" with window id and seconds granted.
2. **Feedback** fills in as `feedback` chunks arrive, then is replaced by the validated final object: one-line summary → Understood (with quotes) → Missed (what to add) → Misunderstood (your words → why → correct version) → Could be better (2–4 actions with example sentences) → Next step.
3. **"See it on the article" button** appears on the `xray` event → S7.
4. **Verified badge** on the `record` event: "Receipt created · recording on Ethereum (pending)". It flips to "Recorded ✓ (tx …)" when `GET /api/result/:attemptId` reports `chainStatus = mined` (polled every 10 s while the page is open).
5. Actions: Retry this article · Next article (recommended) · Download receipt · Show QR · View on Verify page.

Fallback: if no SSE event arrives within 3 s, or the stream errors, the client polls `GET /api/result/:attemptId` every 1 s and renders the same payloads.

### 2.8 S7 X-Ray
- `GET /api/result/:attemptId/xray` (only after `DONE`).
- Article re-rendered sentence by sentence. Key-point sentences are tinted and carry an icon + label: ✔ correct (green), ~ vague (amber), ✘ incorrect (red), ○ missed (grey). Other sentences stay neutral.
- Right column lists the student's claims (their exact words). Hovering/tapping a claim highlights the article sentence Jev linked (`c*_source`); the claim's label is shown: supported / partial / not in article / contradicted. Contradicted claims also appear as callouts under the article sentence with the "correct version" from the feedback.
- Legend uses icons + words, never colour alone.
- Buttons: "Retry this article" (new attempt) · "Back to result".

### 2.9 S8 Profile
- `GET /api/profile/:studentId` → attempts (first and retries, with article, score, dimensions), fingerprint series, deltas, recommendation.
- Chart: four dimensions over attempts; a retry shows "+1.2 reasoning since last attempt".
- Recommendation card with reason; "Start" goes to S4 for that article.

### 2.10 Receipt, QR and S9 Verify
- "Download receipt" → `GET /api/result/:attemptId/receipt` (JSON file `fairproof-<assessmentId>.json`).
- "Show QR" → QR encodes `https://<verifier>/?id=<assessmentId>&r=<receiptUrl>`; the independent verifier loads the receipt from that URL (or from an uploaded file) and checks the chain.
- S9 (our page) `/verify/:assessmentId` → `GET /api/verify/:assessmentId` → V1–V4 with ✅/❌ and plain-language meaning, Etherscan link, lineage (if superseded), "Open independent verifier" link.

---

## 3. Teacher flow (S11)

1. `/teacher` → `GET /api/teacher/queue` → items with `lowConfidence` or `injectionSuspected`, plus search by roster code.
2. Open item: answer, claims with labels, key-point checklist, Jev confidence per item, system score, feedback, flags.
3. Override: `POST /api/teacher/review/:assessmentId {newScore, reason}` → creates a superseding receipt and a `supersede` outbox row; UI shows "Correction recorded; new assessment id …; pending on-chain".
4. The student's S6/S8 show "Reviewed by teacher: 7.1 → 8.0 (reason)". The old receipt still verifies as the old record; the Verify page shows the lineage.

---

## 4. Verifier flow (independent, S10)

1. Open the GitHub Pages URL (from QR or typed).
2. Provide the receipt: upload JSON **or** the page fetches it from the `r` parameter.
3. Page shows the receipt fields (no PII exists in it), then runs:
   - V1: canonicalize → SHA-256 → `verify(id, hash)` on Sepolia via PublicNode.
   - V2: `records(id).scoreX10 == finalScore × 10`.
   - V3: fairness block present/valid.
   - V4: if `supersedes`, look up `AssessmentSuperseded(old, new)` logs.
4. Shows ✅/❌ per check, block timestamp, Etherscan links. Network tab proves no request goes to FairProof's API.
5. Demo switch: an "RPC URL" field (defaults to PublicNode) can be pointed at the local Hardhat node.

---

## 5. Admin / demo flow (S12)

Enabled only with `ADMIN_DEMO_TOOLS=1` and the `ADMIN_SECRET` header; every action is audit-logged.

| Action | Endpoint | Effect |
|---|---|---|
| Research mode on/off | `POST /api/admin/mode {researchMode}` | Students see "Thanks, recorded" instead of scores (blind data collection) |
| Clock / fair mode | `POST /api/admin/mode {clockMode, fairMode}` | Switches FairClock/FairGate behaviour live for the demo |
| Tamper | `POST /api/admin/tamper {assessmentId, field}` | Mutates one field in the server copy; Verify page V1 (and V2) flip to ❌; student's receipt still passes in the independent verifier |
| Export | `POST /api/research/export` | Anonymized CSV (attemptId, articleId, answer, system scores hidden by default) for raters |
| Status | `GET /api/admin/status` | Jev tokens today vs cap, outbox backlog, queue length, cache hit rate |

---

## 6. Session and attempt states as the UI sees them

| Server state | Student screen | Allowed actions |
|---|---|---|
| `CREATED` | S4 loading | fetch article |
| `READING` | S4 | render-ack, finish-reading |
| `WRITING` | S5 | submit |
| `EVALUATING` | S6 (spinner, then score) | reattach via polling |
| `DONE` | S6 / S7 / S9 | retry, next, receipt |
| `EXPIRED` | "This session expired" | start again |
| attempt `failed` | "Evaluation delayed; we'll notify you" | retry later; teacher notified |

---

## 7. Error and edge cases

| Case | Behaviour |
|---|---|
| Refresh during reading | Article reloads only if still `READING` and before deadline; the deadline is the server's, so no extra time |
| Refresh during writing | Draft kept in `sessionStorage`; article not available |
| Refresh during evaluation | Polling resumes on the same attempt (idempotency key stored client-side) |
| Two tabs | Same session cookie; second submit returns the existing attempt |
| Answer < 30 or > 300 words | Submit disabled; inline message |
| Paste of the whole article | Allowed; own-words dimension drops; flag shown; feedback says why |
| "Give me 10/10" in the answer | Score unaffected by the text itself; `contains_instructions` flag; teacher queue |
| Jev/LLM outage | Score delayed or template feedback as per SYSTEM_DESIGN §8; UI never blank |
| Chain pending for a long time | Verified badge stays "pending"; receipt download still works; V1 shows "not yet on-chain" (distinct from ❌) |
| Slow network on reading | FairClock grants the delay up to 10 s; UI shows "Network delay compensated: 3.4 s" in the fairness badge |

---

## 8. Demo-day click path (mirrors PRD §16)

1. Login as `DEMO-01` → pick A1 → read (timer 60 s, pre-shortened via admin) → article fades → DevTools: `/article` → 403.
2. Type (or paste the prepared) summary → score at ~2 s → feedback streams → "See it on the article" → X-Ray.
3. Judge types an injection or pastes the article → low score + flag.
4. Download receipt → QR → judge's phone opens the independent verifier → ✅ → admin Tamper → our Verify ❌, phone still ✅.
5. Split screen: two windows (one Slow 3G), `CLOCK_MODE=naive` then `fair`.
6. Profile for `DEMO-01` (seeded 4 attempts) → recommendation.
7. Benchmark slide.

Fallback at any step: `DEMO_MODE=replay` serves cached Jev/LLM responses; local Hardhat with verifier RPC override; video.
