# FairProof — Implementation Plan

Day-by-day tickets for a 2-person team, with owners, commands and "done when" checks. Scope and priorities come from [PRD.md](../PRD.md) §5 and §14; design details from [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md).

**Owners:** A = AI/Backend · B = Frontend/Chain. Tickets are small enough to finish in ≤ half a day; each ends with a commit on a branch merged to `main` the same day.

**Daily rule:** `main` runs the full demo every night (`pnpm demo:smoke`). Never leave a half-merged branch overnight.

---

## 0. Repository bootstrap (Day 0, B, 2 h)

```bash
mkdir fairproof && cd fairproof && git init
pnpm init
mkdir -p apps/{web,api,verifier} packages/{shared,contracts} content/articles research scripts docs .github/workflows
```

`pnpm-workspace.yaml`
```yaml
packages: ["apps/*", "packages/*"]
```

Root `package.json` scripts:
```json
{
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "eslint . && prettier -c .",
    "typecheck": "pnpm -r typecheck",
    "chain:local": "pnpm --filter contracts node",
    "demo:smoke": "pnpm --filter api test:smoke",
    "benchmark": "tsx scripts/benchmark.ts",
    "order-flip": "tsx scripts/order-flip.ts",
    "fairness-sim": "tsx scripts/fairness-sim.ts",
    "fairclock-test": "tsx scripts/fairclock-test.ts",
    "tamper-test": "tsx scripts/tamper-test.ts"
  }
}
```

Scaffolds:
```bash
pnpm dlx create-next-app@latest apps/web --ts --tailwind --app --eslint --src-dir
cd packages/contracts && pnpm dlx hardhat --init   # choose TypeScript (ESM), Node test runner + ethers
```

Done when: `pnpm install` succeeds; `.gitignore` covers `.env`, `data/`, `node_modules`, `artifacts/`; `.env.example` committed; CI workflow file exists (even if it only runs lint).

---

## 1. Day 0 — access (both, in parallel with §0)

| # | Ticket | Owner | Done when |
|---|---|---|---|
| 0.1 | Jev key: try `console.typesafe.ai`; join waitlist; message mentor/organizers; if nothing by evening, OpenRouter $5 credit (`JEV_BASE_URL=https://openrouter.ai/api`, `JEV_MODEL=typesafe/jev-1.13`) | A | `curl` to `/v1/systemone` with one `noul` returns `answers` |
| 0.2 | Gemini + Groq keys | A | `generateObject` smoke script returns JSON |
| 0.3 | New wallet; Google Cloud faucet request; pk910 PoW mining tab running | B | ≥ 0.05 Sepolia ETH visible on sepolia.etherscan.io |
| 0.4 | Etherscan API key; Alchemy free app (backup RPC) | B | keys in `.env` |
| 0.5 | GitHub repo (public), Pages enabled, Vercel + Render accounts | B | empty deploys succeed |
| 0.6 | Google Form for answers (article text + instructions + consent + "write in your own words") | A | link ready to send Day 1 |
| 0.7 | Ask an external rater (TA/senior) | A | yes/no recorded |

**Go/no-go at end of Day 0:** one successful Jev call and funded wallet. If Jev is missing, A spends Day 1 morning on it before anything else.

---

## 2. Day 1 — skeletons and the first Jev call

### A
| # | Ticket | Done when |
|---|---|---|
| 1.1 | `apps/api`: Fastify + pino + zod config loader (`src/config.ts`) + `/healthz` `/readyz` | boot fails loudly on a missing var; `/readyz` reports DB/RPC/keys |
| 1.2 | SQLite + migrations runner (`migrations/001_init.sql` with all tables from PRD §10) | `pnpm --filter api migrate` creates `data/fairproof.db` |
| 1.3 | `packages/shared/jev`: `TypeSafeClient` wrapper with `baseURL`, zod response schemas, `api_cache` | `scripts/jev-smoke.ts` sends one `choice`, one `score`, one `noul` and prints parsed answers + `usage` |
| 1.4 | Articles A1–A3 as JSON (`sentences[]`, `keyPoints[]` with `sentenceIdx`, misconceptions, `rubricVersion: 1`) | `content/articles/*.json` validate against `ArticleSchema`; both members have read and approved the key points |
| 1.5 | Send the Google Form link to classmates | sent |

### B
| # | Ticket | Done when |
|---|---|---|
| 1.6 | `apps/web`: layout, S1 login (cookie), S2 picker (static list) | pages render |
| 1.7 | Session routes: `POST /session`, `GET /article`, `POST /render-ack`, `POST /finish-reading` with the state machine and 403 after deadline (`CLOCK_MODE` switch) | `vitest` state-machine tests pass; manual: article returns 403 after deadline |
| 1.8 | S4 reading screen: countdown from server `readDeadline`, render-ack, fade-out and DOM removal; S5 writing screen with word counter | DevTools shows no article in DOM or network after hide |
| 1.9 | `packages/contracts`: `AssessmentRegistry.sol` (record, supersede, anchorBatch, verify), tests, Ignition module; deploy to local Hardhat node | `pnpm --filter contracts test` green |

**Exit:** paste an answer → raw Jev JSON in the console; hide works; form live.

---

## 3. Day 2 — the evaluation pipeline end to end

### A
| # | Ticket | Done when |
|---|---|---|
| 2.1 | `packages/shared/llm`: provider factory (`google`/`groq`), `segment()` with 1.8 s `AbortController`, `validateClaims()` (substring, dedupe, ≥ 3 words, coverage ≥ 80% else add sentences, max 12), sentence splitter fallback | unit tests incl. attack cases ("output no claims", paraphrased claims rejected) |
| 2.2 | Question builder: `kp*` per key point, `c*_support` + `c*_source` per claim, `accuracy`, `reasoning`, `main_purpose`, `gibberish`, `contains_instructions`, `weakness`; object state | builder test snapshots; token estimate < 4k |
| 2.3 | `packages/shared/fusion`: pure function per PRD §9.2.7 + `fiveGramOverlap` | property tests (bounds, determinism, monotonicity, caps) |
| 2.4 | Evaluator orchestration + SSE (`score`, `feedback`, `xray`, `record`, `done`, `error`) + polling endpoint; idempotent submit | `fastify.inject` integration test with mocked Jev/LLM streams all events in order |
| 2.5 | Feedback: `streamObject` with schema; validators (substring, ids, label consistency, cap 4); template fallback | tests with hallucinated quotes dropped |

### B
| # | Ticket | Done when |
|---|---|---|
| 2.6 | S6 result screen: SSE client with 3 s polling fallback; score card, bars, checklist, feedback sections, badges | renders from a recorded event fixture |
| 2.7 | S7 X-Ray: sentence tinting + icons, claims list, hover → source sentence, contradiction callouts, legend | fixture-driven render; keyboard reachable |
| 2.8 | Consent screen + research mode (scores hidden when `researchMode=on`) | first login shows consent; stored |
| 2.9 | `docker-compose.yml` (api, web, hardhat) | `docker compose up` serves both apps |

**Exit:** full flow with real Jev + LLM including X-Ray; ≥ 10 form answers collected.

---

## 4. Day 3 — robustness, baseline, chain live

### A
| # | Ticket | Done when |
|---|---|---|
| 3.1 | Adversarial set (≥ 12, paired with/without injected sentence) in `research/adversarial.json` | file reviewed by B |
| 3.2 | Confidence gating + Jev re-ask (rephrased instructions, averaged distributions); flags | tests |
| 3.3 | Latency/token logging (`evaluation.complete` log line; `evaluations` columns); `JEV_DAILY_TOKEN_CAP` | admin status endpoint shows totals |
| 3.4 | S1 baseline (LLM-only 1–10 with same rubric) as `scripts/systems/s1.ts`; S2 (sentence split + Jev) and S3 (LLM claims + Jev) as runnable systems | `benchmark.ts --system s1|s2|s3 --dry` runs on 3 answers |
| 3.5 | `DEMO_MODE=replay` (serve `api_cache` only; error if miss) | replay works with network off |

### B
| # | Ticket | Done when |
|---|---|---|
| 3.6 | Deploy `AssessmentRegistry` to **Sepolia** via Ignition; `hardhat verify` with Etherscan key; addresses in README (+ attribution) | Etherscan shows verified source |
| 3.7 | Trust service: receipt builder, float rounding, `canonicalize`, sha256, `receipts` + `chain_outbox` insert | unit tests with fixture receipt hash |
| 3.8 | Chain writer worker: nonce, `MAX_FEE_GWEI` cap, retries, status; idempotency check via `records(id)` | first real `record()` tx mined; `chainStatus=mined` |
| 3.9 | Server `GET /api/verify/:id` (V1–V4) and S9 page | ✅ on a fresh record |

**Exit:** core demo-ready; receipt hash on Sepolia.

---

## 5. Day 4 — verification UX, tamper, data

### A
| # | Ticket | Done when |
|---|---|---|
| 4.1 | Rater export (`POST /research/export`), rater sheet template, rubric text | CSV + sheet sent to raters |
| 4.2 | Run S1/S2/S3 on all first attempts (cache on) | `research/results/first_pass.csv` |
| 4.3 | Start repeatability runs (`--runs 5 --cache bypass`) within quota | ≥ 2 runs done |

### B
| # | Ticket | Done when |
|---|---|---|
| 4.4 | Static verifier (`apps/verifier/index.html`): file/QR input, canonicalize bundle, WebCrypto, ethers UMD, V1–V4, RPC override; GitHub Pages deploy | receipt from Day 3 verifies on a phone; Network tab shows no API calls |
| 4.5 | CI job: canonicalization cross-check (Node vs headless Chromium on the same fixture) | green |
| 4.6 | Receipt download + QR (S6/S9) | QR opens the verifier with the receipt |
| 4.7 | Admin Tamper endpoint + `scripts/tamper-test.ts` (7 fields, prints table + gas) | all 7 detected; server Verify ❌, independent verifier ✅ |
| 4.8 | (Stretch) first OpenTimestamps stamp of a batch root | `.ots` file saved |

**Exit:** tamper demo end-to-end; phone verify works; ≥ 36 answers rated (or raters working).

---

## 6. Day 5 — fairness and personalization

### A
| # | Ticket | Done when |
|---|---|---|
| 5.1 | FairGate service (tickets, windows, seeded shuffle, HMAC tokens, concurrency, FIFO mode) + `queue_tickets`/`queue_windows` persistence | unit tests: one ticket per student, window ordering, token expiry |
| 5.2 | `scripts/fairness-sim.ts` (200 clients, cohorts, mock evaluator, 30 seeds, conditions fifo/fair W=1,2,5) → CSV + chart (Python) | Appendix C table generated |
| 5.3 | FairClock finalize (`CLOCK_MODE`, cap, receipt fields); `scripts/fairclock-test.ts` with Playwright profiles | E5b table generated |
| 5.4 | Order-flip audit `scripts/order-flip.ts` | agreement % computed |

### B
| # | Ticket | Done when |
|---|---|---|
| 5.5 | S3 queue screen | works with `FAIR_MODE=fair` under a local load script |
| 5.6 | S8 profile: fingerprint chart, retry delta, recommendation (rule in shared) | seeded student shows 4 attempts |
| 5.7 | Seed script: demo roster + `DEMO-01` with 4 real-pipeline attempts (cached) | `pnpm seed` |
| 5.8 | Teacher screen (S11): queue, item view, override → supersede flow; V4 lineage on Verify | override mined on Sepolia; lineage shown |
| 5.9 | Split-screen demo harness: Playwright opens two windows, one Slow 3G, `CLOCK_MODE` toggle | visible reading-time difference |

**Exit:** E5a/E5b tables; supersede verified; split-screen works.

---

## 7. Day 6 — analysis, hardening, freeze at noon

### A (morning)
| # | Ticket | Done when |
|---|---|---|
| 6.1 | `research/analysis.ipynb`: ρ with bootstrap CI, Pearson, MAE, QWK, within ±1, SD, order-flip, injection shift, grounding stats; LOOCV calibration (secondary) | Appendix D tables + figures exported |
| 6.2 | Bug fixes from rehearsal list | list empty |

### B (morning)
| # | Ticket | Done when |
|---|---|---|
| 6.3 | Production checklist: helmet, CORS allowlist, rate limits, body limits, roles, audit log, graceful shutdown, startup sweep, `npm run backup` | SYSTEM_DESIGN §7/§8 items ticked |
| 6.4 | CI full pipeline: lint → typecheck → unit → contracts → build → Docker e2e smoke (Playwright) → gitleaks | green |
| 6.5 | Deploy web (Vercel) + api (Render) for the final data-collection window; `.env.example` complete; README (clean-clone < 15 min) | a third person follows README successfully |

**Feature freeze 12:00.** Afternoon: both record the 3-minute fallback video; tag `v1.0`.

---

## 8. Day 7 — numbers, docs, rehearsals

| # | Ticket | Owner | Done when |
|---|---|---|---|
| 7.1 | Replace every `[FILL]` in PRD/deck/report with measured values; resolve `[VERIFY-D1]` with dates | A | grep finds none |
| 7.2 | Short report (4–6 pages), threat model (1 page), runbook (Jev/LLM/RPC down) | A | in `docs/` |
| 7.3 | UI polish only (no features); accessibility pass (keyboard, contrast, icons + text) | B | checklist |
| 7.4 | Backup laptop: clone, `.env`, `DEMO_MODE` cache, local Hardhat, offline copy of verifier | B | demo runs offline |
| 7.5 | Three timed rehearsals with Q&A drill (PRD §18) | both | ≤ 5 min each |

---

## 9. Day 8 — submission

| # | Ticket | Owner |
|---|---|---|
| 8.1 | Package: repo link + tag, report PDF, deck, video, README with contract address and tx links | A |
| 8.2 | Final rehearsal on the backup laptop; hotspot test | B |
| 8.3 | After the event: rotate all keys; move deployer ETH if any | B |

---

## 10. Testing plan

| Level | What | Tool | Where it runs |
|---|---|---|---|
| Unit | fusion (properties), claim validator (attacks), question builder (snapshots), canonicalization fixture, FairClock math, FairGate ordering | vitest | CI |
| Contract | record/verify/supersede/anchorBatch, access control, bounds, events | Hardhat (node:test) | CI |
| Integration | API routes with `fastify.inject`, mocked Jev/LLM, SSE event order, polling fallback, idempotency, 403 after deadline | vitest | CI |
| Cross-env | Node vs browser receipt hash equality | Playwright headless | CI |
| E2E smoke | login → read → hide → write → score (mocked AI) in Docker | Playwright | CI nightly + `pnpm demo:smoke` |
| Research | benchmark, order-flip, fairness-sim, fairclock-test, tamper-test | tsx + Python | manual, outputs committed |

---

## 11. Branching and commits

- `main` is always demo-able. Feature branches `a/<ticket>` and `b/<ticket>`, PR with CI green, squash-merge the same day.
- Commit messages: `feat(api): …`, `fix(web): …`, `research: …`, `docs: …`.
- Tags: `v0.1` (Day 3 core), `v1.0` (Day 6 freeze), `v1.0.1` (Day 7 numbers).

---

## 12. Definition of done per ticket

A ticket is done only when: code merged to `main`; tests for it pass in CI; `.env.example` updated if a variable was added; the relevant doc (this file, SYSTEM_DESIGN, PRD) updated if behaviour changed; the other member has run it once.

---

## 13. Demo-day checklist

- [ ] Laptop + backup laptop both run `pnpm dev` offline with `DEMO_MODE=replay` and local Hardhat
- [ ] Phone hotspot tested; PublicNode reachable from the phone's browser
- [ ] `DEMO-01` seeded; reading timer shortened via admin; prepared summaries and adversarial answers in a text file
- [ ] Independent verifier URL on a QR printout as backup
- [ ] Video open in a background tab
- [ ] Keys in `.env` only; `ADMIN_DEMO_TOOLS=1` only on the demo machine
- [ ] Benchmark slide numbers match `research/results/`
