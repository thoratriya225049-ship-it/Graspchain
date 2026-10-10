# Graspchain

**Proof of comprehension.** A student reads a short technical article for a fixed time, the article disappears, they explain it in their own words, and within seconds they get a 1–10 score, then grounded feedback, then an X-Ray of the article showing what they understood, missed and got wrong — committed on-chain as a receipt anyone can verify.

> *The LLM provides evidence, code makes the judgment, the LLM explains, the chain commits.*
>
> *A high comprehension score does not automatically mean a trustworthy assessment.*

The specifications live in [PRD.md](PRD.md) and [docs/](docs/) (written under the working name *FairProof*; the product is now called Graspchain — receipts use the schema id `graspchain.receipt/1`).

---

## Quick start (local, no external accounts)

Requirements: Node ≥ 22, pnpm 10 (`npm i -g pnpm@10`).

```bash
pnpm install
pnpm run setup:env     # creates apps/api/.env + apps/web/.env.local with generated secrets
pnpm dev               # chain → contract deploy → verifier → API → web
```

| What | URL |
|---|---|
| Web app | http://localhost:3000 |
| API | http://127.0.0.1:4000 (`/healthz`, `/readyz`) |
| Independent verifier | http://localhost:5174 |
| Local chain (Hardhat, id 31337) | http://127.0.0.1:8545 |

Sign in with a demo roster code: `DEMO-01` (four seeded attempts), `DEMO-02` (fresh), `DEMO-03` (flagged attempts), `TEACH-01` (teacher), `ADMIN-01` (admin; the admin secret is printed by `setup:env` and stored as `ADMIN_SECRET` in `apps/api/.env`).

`pnpm start` runs the same stack with production builds. `docker compose up --build` describes the same topology in containers (see *Status* below).

## What is real, and what is a labelled stand-in

| Layer | With no external keys (default local setup) | With credentials |
|---|---|---|
| Reading, server-enforced hide, FairClock | Real (403 after the deadline; delivery-compensated, capped at 10 s) | Same |
| FairGate | Real windowed seeded shuffle, HMAC admission tokens, concurrency cap; optional *simulated load* (labelled) | Same |
| Claim segmentation (LLM) | Sentence-split fallback — the documented degradation path, recorded as `segmentation: sentence-fallback` | Gemini or Groq via the Vercel AI SDK, 1.8 s timeout, substring + coverage validation |
| Judge (default: Evidence Judge) | With `JUDGE=local`: see the next row | `JUDGE=evidence` (default): the LLM (Groq `openai/gpt-oss-120b`) **only extracts evidence**: per claim SUPPORTED / PARTIALLY_SUPPORTED / CONTRADICTED / NOT_FOUND with word-for-word article quotes. Code validates every quote against the article and the answer, then published rules classify key points (UNDERSTOOD / PARTIALLY_UNDERSTOOD / MISUNDERSTOOD / MISSED; claims UNSUPPORTED) and `fuse()` computes the 1–10 score. The LLM never sees a scale. Extractor failure → the attempt is delayed and retried, never invented |
| Judge (Jev) | **Local demo judge** `local-rubric-judge@1`: a deterministic rubric matcher that answers Jev's exact questions in Jev's response shape. It is *not* Jev; every receipt records `models.jev = local-rubric-judge@1` and every page says so | Jev via `@typesafe-ai/sdk` (`TypeSafeClient.systemOne`), one call with `choice`, `score` and `noul` |
| Fusion, gating, re-ask, feedback validators, X-Ray | Production code paths | Same |
| Feedback (LLM) | Template feedback from the judge's results, labelled "Feedback (basic)" | Streamed LLM feedback, every quote checked against the answer and every item against the judge |
| Receipts, JCS + SHA-256, outbox, chain writer | Real, on a **local Hardhat chain** (`AssessmentRegistry` deployed with Ignition) | Same contract on Ethereum Sepolia |
| Verification (V1–V4) | Real reads from the contract; static verifier recomputes hashes in the browser | Same, via PublicNode |

`DEMO_MODE=replay` serves only cached Jev/LLM answers and never calls the network; a request without a cached answer fails visibly (`REPLAY_MISS`) instead of being invented.

## Assessment integrity

Comprehension and assessment conditions are judged **separately**. Integrity never deducts points from the comprehension score; it decides whether that score is a **certified** result.

**Recorded by the browser monitor** (`apps/web/src/lib/integrity.ts`): tab switches and window-focus loss (with durations), full-screen exits, copy / cut / drag / context-menu on the article (blocked), paste and drop into the answer (blocked, except text copied from the answer itself), large single-input insertions, print and save-page shortcuts (blocked), screenshot keys where the OS delivers them, developer-tool shortcuts, reloads, the same session open in two tabs (BroadcastChannel), device-clock jumps. Reports carry sequence numbers and are the heartbeat.

**Recorded by the server** (cannot be suppressed by a modified page): article requests after it closed, a blocked paste whose text matches the article (compared server-side, then discarded), two page instances alive at once, time with no contact from the page, reports announced but never delivered, malformed or forged reports, a submission with no monitor at all, writing speed implausible for composition, and verbatim copying of the article. Integrity counts are never taken from the submit body.

**Rules** (`packages/shared/src/integrity.ts`, `integrity-rules@1`): every event has a published severity — INFO 0, LOW 1, MEDIUM 3, HIGH 8, CRITICAL 20 points, with duration and phase taken into account (a 3-second tab switch is LOW; 90 seconds away while writing is HIGH). LOW points are capped at 6, so accidents alone can never go past *Suspicious*.

| Status | Points | Outcome |
|---|---|---|
| Normal | 0 | Certified |
| Warning | 1–3 | Certified |
| Suspicious | 4–7 | Certified with notes |
| Integrity risk | 8–19 | Provisional — teacher review required; excluded from progress until reviewed |
| Compromised | ≥ 20, or any CRITICAL | Not certified; excluded from progress |

A teacher can *clear* or *uphold* the integrity record with a reason; like score corrections, this is a new superseding receipt. Receipts carry `assessment.integrity` (status, outcome, points, rules version, and a hash of the event log) and, for the evidence judge, `assessment.evidence` (classifications and a hash of the full evidence trail).

**Other hardening**: one live assessment per student (opening a new session closes the previous one, so the article cannot be re-read in a second session); the session page re-checks server state before requesting the article; article text is unselectable, never prints, carries a faint student/session watermark, and is hidden while the window is inactive.

**What a browser cannot do** (stated in the UI as well): detect a photo of the screen, a second device or another person; detect screenshot tools that capture without moving focus, or screen recording started beforehand; stop a determined user with a modified browser from forging perfect reports (missing or malformed reports *are* detected). Developer tools cannot be reliably blocked; their shortcuts are recorded.

## Credentials you can add

All go in `apps/api/.env` (validated at boot; a missing or malformed value stops the API and names the variable). Nothing below is needed for the local demo.

| Variable | Where to get it | Enables |
|---|---|---|
| `JEV_API_KEY` (+ `JUDGE=jev`) | console.typesafe.ai/keys, or Vercel AI Gateway / OpenRouter (set `JEV_BASE_URL`, `JEV_MODEL` — see `.env.example`) | The real Jev judge |
| `LLM_PROVIDER`, `LLM_MODEL`, `GOOGLE_GENERATIVE_AI_API_KEY` or `GROQ_API_KEY` | Google AI Studio (free tier) or Groq (free tier, keys start `gsk_`) | Evidence extraction for `JUDGE=evidence`, LLM claim segmentation and feedback. Keys are read only by the API; the web app never receives them |
| `CHAIN_ID=11155111`, `CHAIN_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `REGISTRY_ADDRESS` | A fresh wallet holding only Sepolia faucet ETH; deploy with `pnpm chain:deploy:sepolia` (needs `SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `ETHERSCAN_API_KEY` as Hardhat config variables) | Sepolia commitments and Etherscan links |
| `CHAIN_RPC_BACKUP_URL` | Alchemy free tier (optional) | Read failover |

The public Hardhat account #0 key that `setup:env` writes for the local chain is rejected by config validation on any other chain id. For the GitHub Pages verifier build: `VERIFIER_CHAIN_ID=11155111 pnpm verifier:build`.

## Commands

| Command | Does |
|---|---|
| `pnpm dev` / `pnpm start` | Whole stack in watch mode / production builds |
| `pnpm test` | Unit + integration tests (shared, API incl. a real-socket smoke test, contracts) |
| `pnpm test:e2e` | Playwright against the running stack: journey, hide/403, FairClock delays, teacher supersede, tamper demo, Node↔Chromium hash cross-check |
| `pnpm lint` · `pnpm format:check` · `pnpm typecheck` | ESLint, Prettier, `tsc --noEmit` everywhere |
| `pnpm build` | Builds every package (Next.js production build, verifier bundle, contract compile) |
| `pnpm migrate` · `pnpm seed` · `pnpm backup` | SQLite migrations · demo roster + seeded attempts · `VACUUM INTO` backup |
| `pnpm chain:local` · `pnpm chain:deploy:local` · `pnpm chain:deploy:sepolia` | Hardhat node · Ignition deploys |
| `pnpm fairness-sim` | E5a FairGate simulation (200 clients × 30 seeds) → `research/results/fairness-sim.csv` |
| `pnpm tamper-test` | E6: mutates 7 fields of a server copy, checks V1, restores → `research/results/tamper-test.csv` |
| `pnpm benchmark` | E2/E3: S1/S2/S3/S3′ vs blind human ratings (needs ratings; S1/S3 need an LLM) |
| `pnpm order-flip` | E3 order-bias audit (needs `JUDGE=jev`; refuses with the order-invariant demo judge) |

## Repository layout

```
apps/api            Fastify 5 · SQLite (better-sqlite3, WAL, migrations) · session + FairClock · FairGate ·
                    evaluator (segment → judge → fuse → explain) · trust (receipts, outbox, chain writer) · routes
apps/web            Next.js 16 App Router · Tailwind 4 · every screen S1–S12 · Playwright e2e
apps/verifier       Static independent verifier (ethers 6 UMD vendored, shared canonicalization bundled)
packages/shared     Types, zod schemas, JCS hashing, fusion, Jev question builder, claim + feedback validators, V1–V4
packages/contracts  AssessmentRegistry.sol (Solidity ^0.8.24, OpenZeppelin 5) · Hardhat 3 · node:test · Ignition
content/articles    A1–A3 with sentences, weighted key points, misconceptions (rubricVersion 1)
scripts             dev orchestrator, setup, fairness-sim, tamper-test
research/results    Outputs written by the research scripts
```

## Notes

- Answers, codes and names are never written on-chain — only a salted student reference, a salted answer hash, the score and the receipt hash.
- A teacher correction never edits a record: it creates a superseding receipt linked on-chain (`AssessmentSuperseded`), visible as V4 on the Verify page.
- Restarting the local Hardhat node wipes its state. The chain writer notices and re-commits receipts it had marked as mined (local chain only).
- Contract verification and explorer links use the Etherscan API (free plan) — *Powered by Etherscan.io APIs*.
- The earlier Next.js-only prototype's demo data in `apps/web/.data/` was left untouched; the new stack stores everything in `apps/api/data/graspchain.db`.
